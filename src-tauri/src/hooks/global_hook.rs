//! Global hotkey listener.
//!
//! `SendInput`-injected events set `LLMHF_INJECTED` on any low-level hook, so a
//! hook that does not filter them will see the clicker's *own* clicks. Bind a
//! hotkey to a mouse button under `rdev` and the engine retriggers itself
//! forever. `rdev` 0.5.3 does not expose the injected flag, so this uses a
//! native `WH_KEYBOARD_LL` / `WH_MOUSE_LL` hook and drops injected events
//! before they reach the matcher.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookAction {
    /// Flip the engine on or off.
    Toggle,
    /// Held key/button went down: run while held.
    HoldStart,
    HoldEnd,
    /// Hard stop, always honoured regardless of rule state.
    PanicStop,
}

pub const VK_ESCAPE: u32 = 0x1B;

#[derive(Clone, Debug)]
pub struct Bindings {
    pub toggle_vk: u32,
    pub hold_vk: u32,
    pub panic_vk: u32,
    /// 0 = left, 1 = right, 2 = middle. `None` disables mouse hold-to-run.
    pub mouse_hold: Option<u8>,
}

impl Default for Bindings {
    fn default() -> Self {
        Self {
            toggle_vk: 0x75, // F6
            hold_vk: 0x76,   // F7
            panic_vk: VK_ESCAPE,
            mouse_hold: None,
        }
    }
}

/// Map a UI key name such as `"F6"` or `"A"` to a Win32 virtual-key code.
pub fn vk_from_name(name: &str) -> Option<u32> {
    let key = name.trim().to_ascii_uppercase();
    if key.len() == 1 {
        let c = key.as_bytes()[0];
        return match c {
            b'0'..=b'9' | b'A'..=b'Z' => Some(c as u32),
            _ => None,
        };
    }
    if let Some(rest) = key.strip_prefix('F') {
        if let Ok(n) = rest.parse::<u32>() {
            if (1..=12).contains(&n) {
                return Some(0x6F + n);
            }
        }
    }
    match key.as_str() {
        "ESCAPE" | "ESC" => Some(VK_ESCAPE),
        "SPACE" => Some(0x20),
        "ENTER" | "RETURN" => Some(0x0D),
        "TAB" => Some(0x09),
        "SHIFT" => Some(0x10),
        "CTRL" | "CONTROL" => Some(0x11),
        "ALT" => Some(0x12),
        "CAPSLOCK" => Some(0x14),
        _ => None,
    }
}

/// Pure key matcher. Panic is checked first so it always wins a conflict.
fn classify_key(bindings: &Bindings, vk: u32, down: bool) -> Option<HookAction> {
    if vk == bindings.panic_vk {
        return down.then_some(HookAction::PanicStop);
    }
    if vk == bindings.toggle_vk {
        return down.then_some(HookAction::Toggle);
    }
    if vk == bindings.hold_vk {
        return Some(if down {
            HookAction::HoldStart
        } else {
            HookAction::HoldEnd
        });
    }
    None
}

/// Pure mouse matcher (only the hold-to-run button is bindable).
fn classify_mouse(bindings: &Bindings, button: u8, down: bool) -> Option<HookAction> {
    if bindings.mouse_hold == Some(button) {
        Some(if down {
            HookAction::HoldStart
        } else {
            HookAction::HoldEnd
        })
    } else {
        None
    }
}

static SENDER: OnceLock<Mutex<Option<Sender<HookAction>>>> = OnceLock::new();
static BINDINGS: OnceLock<Mutex<Bindings>> = OnceLock::new();
static THREAD_ID: AtomicU32 = AtomicU32::new(0);
static ACTIVE: AtomicBool = AtomicBool::new(false);

fn sender_slot() -> &'static Mutex<Option<Sender<HookAction>>> {
    SENDER.get_or_init(|| Mutex::new(None))
}

fn bindings_slot() -> &'static Mutex<Bindings> {
    BINDINGS.get_or_init(|| Mutex::new(Bindings::default()))
}

fn dispatch(action: HookAction) {
    if let Ok(slot) = sender_slot().lock() {
        if let Some(tx) = slot.as_ref() {
            let _ = tx.send(action);
        }
    }
}

#[cfg(windows)]
mod imp {
    use super::{classify_key, classify_mouse, Bindings, ACTIVE, THREAD_ID};
    use std::mem::zeroed;
    use std::ptr::null_mut;
    use std::sync::atomic::Ordering;

    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT,
        PostThreadMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, HC_ACTION,
        HHOOK, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL,
    };

    /// Injected-event flags from the low-level hook structs.
    const LLKHF_INJECTED: u32 = 0x0000_0010;
    const LLMHF_INJECTED: u32 = 0x0000_0001;

    const WM_QUIT: u32 = 0x0012;
    const WM_KEYDOWN: u32 = 0x0100;
    const WM_KEYUP: u32 = 0x0101;
    const WM_SYSKEYDOWN: u32 = 0x0104;
    const WM_SYSKEYUP: u32 = 0x0105;
    const WM_LBUTTONDOWN: u32 = 0x0201;
    const WM_LBUTTONUP: u32 = 0x0202;
    const WM_RBUTTONDOWN: u32 = 0x0204;
    const WM_RBUTTONUP: u32 = 0x0205;
    const WM_MBUTTONDOWN: u32 = 0x0207;
    const WM_MBUTTONUP: u32 = 0x0208;

    fn bindings_snapshot() -> Bindings {
        super::bindings_slot()
            .lock()
            .map(|b| b.clone())
            .unwrap_or_default()
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code as u32 == HC_ACTION {
            unsafe {
                let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
                // Drop anything the OS injected, including our own clicks.
                if (kb.flags as u32) & LLKHF_INJECTED == 0 {
                    let msg = wparam as u32;
                    let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
                    let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
                    if down || up {
                        if let Some(action) = classify_key(&bindings_snapshot(), kb.vkCode as u32, down)
                        {
                            super::dispatch(action);
                        }
                    }
                }
            }
        }
        unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) }
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code as u32 == HC_ACTION {
            unsafe {
                let ms = &*(lparam as *const MSLLHOOKSTRUCT);
                // This is what stops the engine from retriggering the mouse
                // hotkey that started it.
                if (ms.flags as u32) & LLMHF_INJECTED == 0 {
                    let (button, down) = match wparam as u32 {
                        WM_LBUTTONDOWN => (0u8, true),
                        WM_LBUTTONUP => (0, false),
                        WM_RBUTTONDOWN => (1, true),
                        WM_RBUTTONUP => (1, false),
                        WM_MBUTTONDOWN => (2, true),
                        WM_MBUTTONUP => (2, false),
                        _ => (255, false),
                    };
                    if button != 255 {
                        if let Some(action) =
                            classify_mouse(&bindings_snapshot(), button, down)
                        {
                            super::dispatch(action);
                        }
                    }
                }
            }
        }
        unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) }
    }

    pub fn set_bindings(bindings: Bindings) {
        if let Ok(mut slot) = super::bindings_slot().lock() {
            *slot = bindings;
        }
    }

    /// The hook thread does *not* own the action receiver: the callbacks write to
    /// the shared sender, and `HookManager::start` hands the receiver back to
    /// the dispatcher thread.
    pub fn run() -> std::io::Result<std::thread::JoinHandle<()>> {
        std::thread::Builder::new()
            .name("hyperclicker-hook".into())
            .spawn(move || {
                THREAD_ID.store(unsafe { GetCurrentThreadId() }, Ordering::SeqCst);

                let keyboard: HHOOK =
                    unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), null_mut(), 0) };
                let mouse: HHOOK =
                    unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), null_mut(), 0) };

                // Active only if at least one hook installed successfully.
                ACTIVE.store(
                    !keyboard.is_null() || !mouse.is_null(),
                    Ordering::SeqCst,
                );

                // A low-level hook is serviced through this thread's message
                // loop, so it must pump until WM_QUIT.
                let mut msg: MSG = unsafe { zeroed() };
                while unsafe { GetMessageW(&mut msg, null_mut(), 0, 0) } > 0 {
                    unsafe {
                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }

                if !keyboard.is_null() {
                    unsafe { UnhookWindowsHookEx(keyboard) };
                }
                if !mouse.is_null() {
                    unsafe { UnhookWindowsHookEx(mouse) };
                }

                ACTIVE.store(false, Ordering::SeqCst);
                THREAD_ID.store(0, Ordering::SeqCst);
            })
    }

    pub fn stop() {
        let tid = THREAD_ID.load(Ordering::SeqCst);
        if tid != 0 {
            unsafe {
                PostThreadMessageW(tid, WM_QUIT, 0, 0);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Bindings;
    use std::sync::atomic::Ordering;
    use std::time::Duration;

    pub fn set_bindings(_bindings: Bindings) {}

    pub fn run() -> std::io::Result<std::thread::JoinHandle<()>> {
        std::thread::Builder::new()
            .name("hyperclicker-hook".into())
            .spawn(|| {
                super::ACTIVE.store(true, Ordering::SeqCst);
                // No global hook on this platform. Park until stopped so the
                // thread exists and `ACTIVE` still reports honestly.
                while super::ACTIVE.load(Ordering::SeqCst) {
                    std::thread::sleep(Duration::from_millis(50));
                }
            })
    }

    pub fn stop() {
        super::ACTIVE.store(false, Ordering::SeqCst);
    }
}

use imp::{run, set_bindings, stop};

/// True when a global hook is installed and pumping.
pub fn hook_active() -> bool {
    ACTIVE.load(Ordering::SeqCst)
}

pub struct HookManager {
    handle: Mutex<Option<JoinHandle<()>>>,
    bindings: Arc<Mutex<Bindings>>,
}

impl HookManager {
    pub fn new() -> Self {
        Self {
            handle: Mutex::new(None),
            bindings: Arc::new(Mutex::new(Bindings::default())),
        }
    }

    /// Install the global hook and return the action receiver.
    pub fn start(&self) -> Result<Receiver<HookAction>, String> {
        let (tx, rx) = channel();
        {
            let mut slot = sender_slot()
                .lock()
                .map_err(|_| "hook sender lock poisoned")?;
            *slot = Some(tx);
        }
        let handle = run().map_err(|err| format!("failed to spawn hook thread: {err}"))?;
        *self
            .handle
            .lock()
            .map_err(|_| "hook handle lock poisoned")? = Some(handle);
        Ok(rx)
    }

    pub fn apply_bindings(&self, bindings: Bindings) {
        if let Ok(mut slot) = self.bindings.lock() {
            *slot = bindings.clone();
        }
        set_bindings(bindings);
    }

    pub fn stop(&self) {
        stop();
        if let Ok(mut slot) = self.handle.lock() {
            if let Some(handle) = slot.take() {
                let _ = handle.join();
            }
        }
        if let Ok(mut slot) = sender_slot().lock() {
            *slot = None;
        }
    }
}

impl Drop for HookManager {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Installs the real `WH_KEYBOARD_LL` / `WH_MOUSE_LL` hooks and pumps the
    /// message loop they need. This is the actual integration point for the
    /// F6/F7 bindings, so it is worth proving the OS accepted them.
    #[test]
    #[cfg(windows)]
    fn global_hook_installs_and_reports_active() {
        let manager = HookManager::new();
        let _receiver = manager.start().expect("hook thread should start");

        // SetWindowsHookEx is called from inside the spawned thread, so give it
        // a moment to install before asserting.
        std::thread::sleep(std::time::Duration::from_millis(250));
        assert!(
            hook_active(),
            "the global hook should report active after starting"
        );

        manager.stop();
        assert!(!hook_active(), "stopping should tear the hook down");
    }

    #[test]
    fn function_keys_map_to_expected_virtual_codes() {
        assert_eq!(vk_from_name("F6"), Some(0x75));
        assert_eq!(vk_from_name("f7"), Some(0x76));
        assert_eq!(vk_from_name("F12"), Some(0x7B));
        assert_eq!(vk_from_name("F1"), Some(0x70));
    }

    #[test]
    fn letters_and_digits_map_to_ascii() {
        assert_eq!(vk_from_name("A"), Some(0x41));
        assert_eq!(vk_from_name("z"), Some(0x5A));
        assert_eq!(vk_from_name("5"), Some(0x35));
    }

    #[test]
    fn named_special_keys_map() {
        assert_eq!(vk_from_name("Escape"), Some(VK_ESCAPE));
        assert_eq!(vk_from_name("Space"), Some(0x20));
        assert_eq!(vk_from_name("Enter"), Some(0x0D));
    }

    #[test]
    fn unknown_key_names_are_rejected() {
        assert_eq!(vk_from_name("NotAKey"), None);
        assert_eq!(vk_from_name("F13"), None);
        assert_eq!(vk_from_name("F0"), None);
        assert_eq!(vk_from_name(""), None);
    }

    #[test]
    fn default_bindings_are_distinct() {
        let b = Bindings::default();
        assert_ne!(b.toggle_vk, b.hold_vk);
        assert_ne!(b.toggle_vk, b.panic_vk);
        assert_ne!(b.hold_vk, b.panic_vk);
    }

    #[test]
    fn toggle_fires_once_on_key_down() {
        let b = Bindings::default();
        assert_eq!(
            classify_key(&b, b.toggle_vk, true),
            Some(HookAction::Toggle)
        );
        assert_eq!(classify_key(&b, b.toggle_vk, false), None);
    }

    #[test]
    fn hold_reports_down_and_up() {
        let b = Bindings::default();
        assert_eq!(
            classify_key(&b, b.hold_vk, true),
            Some(HookAction::HoldStart)
        );
        assert_eq!(classify_key(&b, b.hold_vk, false), Some(HookAction::HoldEnd));
    }

    #[test]
    fn panic_key_wins_a_conflict_with_hold() {
        let b = Bindings {
            toggle_vk: 0x75,
            hold_vk: VK_ESCAPE,
            panic_vk: VK_ESCAPE,
            mouse_hold: None,
        };
        assert_eq!(
            classify_key(&b, VK_ESCAPE, true),
            Some(HookAction::PanicStop)
        );
    }

    #[test]
    fn unbound_keys_are_ignored() {
        let b = Bindings::default();
        assert_eq!(classify_key(&b, 0x41, true), None);
        assert_eq!(classify_mouse(&b, 0, true), None);
    }

    #[test]
    fn mouse_hold_is_inert_until_bound() {
        let mut b = Bindings::default();
        assert_eq!(classify_mouse(&b, 1, true), None);
        b.mouse_hold = Some(1);
        assert_eq!(
            classify_mouse(&b, 1, true),
            Some(HookAction::HoldStart)
        );
        assert_eq!(classify_mouse(&b, 1, false), Some(HookAction::HoldEnd));
        assert_eq!(classify_mouse(&b, 0, true), None);
    }
}