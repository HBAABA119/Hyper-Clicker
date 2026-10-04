//! Low-level batched input dispatch.
//!
//! Two defects in the original design are fixed here:
//!
//! 1. It allocated a 4096-element `INPUT` array *on the stack* inside the
//!    dispatch call. `INPUT` is roughly 40 bytes on x86_64, so that is about
//!    160 KB of stack per call, on a thread whose default stack is 2 MB.
//!    The buffer now lives on the heap and is re-used across dispatches.
//! 2. It ignored the `SendInput` return value. `SendInput` returns the number
//!    of events it actually inserted and `0` on failure (most commonly UIPI
//!    blocking injection into a higher-integrity window). A rejected burst was
//!    therefore indistinguishable from a successful one. The result is now
//!    surfaced instead of silently dropped.

use std::fmt;

use super::{DispatchOutcome, TargetButton};

/// Maximum raw events held in the pre-filled buffer (a click is a down+up pair).
pub const MAX_EVENTS: usize = 4096;

#[cfg(windows)]
mod imp {
    use super::{DispatchOutcome, TargetButton, MAX_EVENTS};
    use std::mem::{size_of, zeroed};

    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_ABOVE_NORMAL, THREAD_PRIORITY_NORMAL,
        THREAD_PRIORITY_TIME_CRITICAL,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
        MOUSEINPUT,
    };

    /// A pre-filled batch of input events. The buffer is rebuilt only when the
    /// target button or the click count changes, never on the hot path.
    pub struct InputBatcher {
        buffer: Box<[INPUT]>,
        clicks: u32,
        events: usize,
        button: TargetButton,
    }

    impl InputBatcher {
        pub fn new() -> Self {
            // Heap-allocated: ~160 KB, allocated once for the life of the engine.
            let buffer = unsafe { vec![zeroed::<INPUT>(); MAX_EVENTS] }.into_boxed_slice();
            Self {
                buffer,
                clicks: 0,
                events: 0,
                button: TargetButton::Left,
            }
        }

        pub fn clicks(&self) -> u32 {
            self.clicks
        }

        pub fn button(&self) -> TargetButton {
            self.button
        }

        /// Rebuild the buffer for `clicks` click pairs on `button`.
        /// Returns the number of raw events prepared.
        pub fn configure(&mut self, button: TargetButton, clicks: u32) -> usize {
            let click_cap = (MAX_EVENTS / 2) as u32;
            let clicks = clicks.min(click_cap);
            let events = (clicks as usize).saturating_mul(2);

            let (down_flag, up_flag) = match button {
                TargetButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                TargetButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                TargetButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            };

            for i in 0..events {
                let flags = if i % 2 == 0 { down_flag } else { up_flag };
                // SAFETY: `i < events <= MAX_EVENTS`, and `mouse_input` fully initialises
                // the struct it writes.
                self.buffer[i] = unsafe { mouse_input(flags) };
            }

            self.clicks = clicks;
            self.events = events;
            self.button = button;
            events
        }

        /// Flush the pre-filled batch into the OS input ring buffer.
        pub fn dispatch(&self) -> DispatchOutcome {
            if self.events == 0 {
                return DispatchOutcome::Accepted(0);
            }
            unsafe {
                let inserted = SendInput(
                    self.events as u32,
                    self.buffer.as_ptr(),
                    size_of::<INPUT>() as i32,
                );
                if inserted == 0 {
                    DispatchOutcome::Rejected {
                        requested: self.events as u32,
                        last_error: GetLastError(),
                    }
                } else {
                    DispatchOutcome::Accepted(inserted)
                }
            }
        }
    }

    unsafe fn mouse_input(flags: u32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    /// Raise the calling thread's scheduling priority.
    ///
    /// Defaults to `HIGHEST`. `TIME_CRITICAL` starves every other thread on the
    /// machine, which is a bad trade on a shared PC, so it is opt-in.
    pub fn elevate_thread_priority(time_critical: bool) {
        unsafe {
            let priority = if time_critical {
                THREAD_PRIORITY_TIME_CRITICAL
            } else {
                THREAD_PRIORITY_ABOVE_NORMAL
            };
            SetThreadPriority(GetCurrentThread(), priority);
        }
    }

    /// Drop back to normal. Called when the engine loop exits so a finished run
    /// cannot keep the machine feeling slow.
    pub fn reset_thread_priority() {
        unsafe {
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_NORMAL);
        }
    }

    pub const fn supported() -> bool {
        true
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn configure_prepares_two_events_per_click() {
            let mut b = InputBatcher::new();
            assert_eq!(b.configure(TargetButton::Left, 10), 20);
            assert_eq!(b.clicks(), 10);
        }

        #[test]
        fn configure_clamps_to_buffer_capacity() {
            let mut b = InputBatcher::new();
            let events = b.configure(TargetButton::Right, 100_000);
            assert_eq!(events, MAX_EVENTS);
            assert_eq!(b.clicks() as usize, MAX_EVENTS / 2);
        }

        #[test]
        fn configure_does_not_overflow_multiplication() {
            let mut b = InputBatcher::new();
            let events = b.configure(TargetButton::Middle, u32::MAX);
            assert_eq!(events, MAX_EVENTS);
        }

        #[test]
        fn zero_clicks_dispatches_nothing() {
            let b = InputBatcher::new();
            assert!(matches!(b.dispatch(), DispatchOutcome::Accepted(0)));
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::{DispatchOutcome, TargetButton, MAX_EVENTS};
    use std::marker::PhantomData;

    /// Non-Windows placeholder: keeps the crate compiling so the UI can start,
    /// but reports every dispatch as unsupported instead of silently doing
    /// nothing while looking like it worked.
    pub struct InputBatcher {
        clicks: u32,
        events: usize,
        button: TargetButton,
        _marker: PhantomData<[u8; MAX_EVENTS]>,
    }

    impl InputBatcher {
        pub fn new() -> Self {
            Self {
                clicks: 0,
                events: 0,
                button: TargetButton::Left,
                _marker: PhantomData,
            }
        }
        pub fn clicks(&self) -> u32 {
            self.clicks
        }
        pub fn button(&self) -> TargetButton {
            self.button
        }
        pub fn configure(&mut self, button: TargetButton, clicks: u32) -> usize {
            let click_cap = (MAX_EVENTS / 2) as u32;
            self.clicks = clicks.min(click_cap);
            self.events = (self.clicks as usize).saturating_mul(2);
            self.button = button;
            self.events
        }
        pub fn dispatch(&self) -> DispatchOutcome {
            DispatchOutcome::Rejected {
                requested: self.events as u32,
                last_error: 0,
            }
        }
    }

    pub fn elevate_thread_priority(_time_critical: bool) {}

    pub fn reset_thread_priority() {}

    pub const fn supported() -> bool {
        false
    }
}

pub use imp::{elevate_thread_priority, reset_thread_priority, supported, InputBatcher};

impl fmt::Display for TargetButton {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            TargetButton::Left => "Left",
            TargetButton::Right => "Right",
            TargetButton::Middle => "Middle",
        };
        f.write_str(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn button_codes_map_to_the_right_button() {
        assert_eq!(TargetButton::from_u32(0), TargetButton::Left);
        assert_eq!(TargetButton::from_u32(1), TargetButton::Right);
        assert_eq!(TargetButton::from_u32(2), TargetButton::Middle);
    }

    #[test]
    fn out_of_range_button_code_falls_back_to_left() {
        assert_eq!(TargetButton::from_u32(99), TargetButton::Left);
    }
}
