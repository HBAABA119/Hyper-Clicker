// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod engine;
mod hooks;
mod scripting;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};

use config::{ConfigStore, Profile};
use engine::r#loop::{ClickEngine, MODE_BURST, MODE_CONTINUOUS};
use engine::telemetry;
use hooks::{Bindings, HookAction, HookManager};
use scripting::ScriptEngine;

/// Clamp interval so a typo cannot request a multi-hour interval.
const MIN_INTERVAL_MICROS: u64 = 10;
const MAX_INTERVAL_MICROS: u64 = 10_000_000;
const MIN_BURST: u32 = 1;
const MAX_BURST: u32 = 2048;

struct AppState {
    // Arc so the hotkey dispatcher thread can hold a 'static reference.
    click_engine: Arc<ClickEngine>,
    script_engine: Arc<ScriptEngine>,
    hook_manager: HookManager,
    store: ConfigStore,
    profile: Mutex<Profile>,
    ready: AtomicBool,
}

impl AppState {
    fn persist(&self) -> Result<(), String> {
        let snapshot = self
            .profile
            .lock()
            .map_err(|_| "profile lock poisoned")?
            .clone();
        self.store.save(&snapshot)
    }

    /// Update the in-memory profile only.
    ///
    /// Persistence is deliberately *not* done here: the UI pushes interval and
    /// burst values on every slider tick, and writing JSON to disk each time
    /// would thrash the disk for no benefit. The profile is written on explicit
    /// save and on shutdown.
    fn update_profile<F>(&self, edit: F) -> Result<(), String>
    where
        F: FnOnce(&mut Profile),
    {
        let mut slot = self.profile.lock().map_err(|_| "profile lock poisoned")?;
        edit(&mut slot);
        Ok(())
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CapabilitiesInfo {
    platform_supported: bool,
    hook_active: bool,
    native_bindings: bool,
    platform: String,
    panic_key: String,
    toggle_key: String,
    hold_key: String,
}

fn capabilities_info(state: &AppState) -> CapabilitiesInfo {
    let profile = state.profile.lock().map(|p| p.clone()).unwrap_or_default();
    CapabilitiesInfo {
        platform_supported: engine::input_win::supported(),
        hook_active: hooks::global_hook::hook_active(),
        native_bindings: scripting::native_bindings_available(),
        platform: scripting::host::platform_name(),
        panic_key: "Escape".to_string(),
        toggle_key: profile.toggle_key.clone(),
        hold_key: profile.hold_key.clone(),
    }
}

#[tauri::command]
fn get_capabilities(state: State<'_, AppState>) -> CapabilitiesInfo {
    capabilities_info(&state)
}

#[tauri::command]
fn set_clicker_active(state: State<'_, AppState>, active: bool) -> Result<(), String> {
    if active {
        state.click_engine.start()
    } else {
        state.click_engine.stop();
        Ok(())
    }
}

#[tauri::command]
fn set_timing_parameters(
    state: State<'_, AppState>,
    interval_micros: u64,
    burst_count: u32,
) -> Result<(), String> {
    let micros = interval_micros.clamp(MIN_INTERVAL_MICROS, MAX_INTERVAL_MICROS);
    let burst = burst_count.clamp(MIN_BURST, MAX_BURST);

    state
        .click_engine
        .state
        .interval_nanos
        .store(micros.saturating_mul(1_000), Ordering::Relaxed);
    state
        .click_engine
        .state
        .burst_size
        .store(burst, Ordering::Relaxed);

    state.update_profile(|p| {
        p.interval_micros = micros;
        p.burst = burst;
    })
}

#[tauri::command]
fn set_mode(state: State<'_, AppState>, mode: u32) -> Result<(), String> {
    let mode = if mode == MODE_CONTINUOUS {
        MODE_CONTINUOUS
    } else {
        MODE_BURST
    };
    state.click_engine.state.mode.store(mode, Ordering::Relaxed);
    state.update_profile(|p| p.mode = mode)
}

#[tauri::command]
fn set_button(state: State<'_, AppState>, button: u32) -> Result<(), String> {
    let button = button.min(2);
    state
        .click_engine
        .state
        .button
        .store(button, Ordering::Relaxed);
    state.update_profile(|p| p.button = button)
}

/// `TIME_CRITICAL` starves every other thread on the machine, so it is opt-in.
#[tauri::command]
fn set_time_critical(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    state
        .click_engine
        .state
        .time_critical
        .store(enabled, Ordering::Relaxed);
    state.update_profile(|p| p.time_critical = enabled)
}

/// Arm (or disarm, with 0) the auto-stop timer. Enforced inside the engine
/// loop, so it still fires if the window is unresponsive.
#[tauri::command]
fn set_auto_stop(state: State<'_, AppState>, minutes: u64) -> Result<(), String> {
    let minutes = minutes.min(24 * 60);
    let millis = minutes.saturating_mul(60_000);
    state
        .click_engine
        .state
        .stop_after_ms
        .store(millis, Ordering::Relaxed);
    state.update_profile(|p| p.auto_stop_minutes = minutes)
}

#[tauri::command]
fn set_jitter(state: State<'_, AppState>, micros: u32) -> Result<(), String> {
    let micros = micros.min(100_000);
    state
        .click_engine
        .state
        .jitter_micros
        .store(micros, Ordering::Relaxed);
    state.update_profile(|p| p.jitter_micros = micros)
}

/// Rebind the global hotkeys. Applied immediately -- the hook matcher reads
/// the live binding table, so there is no restart needed.
#[tauri::command]
fn set_bindings(
    state: State<'_, AppState>,
    toggle_key: String,
    hold_key: String,
    mouse_hold: Option<u8>,
) -> Result<(), String> {
    let toggle_vk = hooks::vk_from_name(&toggle_key)
        .ok_or_else(|| format!("unknown key name for toggle: {toggle_key:?}"))?;
    let hold_vk = hooks::vk_from_name(&hold_key)
        .ok_or_else(|| format!("unknown key name for hold: {hold_key:?}"))?;

    if toggle_vk == hold_vk {
        return Err("toggle and hold cannot be the same key".to_string());
    }
    if mouse_hold.is_some_and(|b| b > 2) {
        return Err("mouse button must be 0 (left), 1 (right) or 2 (middle)".into());
    }

    let bindings = Bindings {
        toggle_vk,
        hold_vk,
        panic_vk: hooks::VK_ESCAPE,
        mouse_hold,
    };
    state.hook_manager.apply_bindings(bindings);

    state.update_profile(|p| {
        p.toggle_key = toggle_key.clone();
        p.hold_key = hold_key.clone();
        p.mouse_hold = mouse_hold;
    })
}

/// Session counters, polled on demand for the stats panel.
#[tauri::command]
fn get_stats(state: State<'_, AppState>) -> Result<Stats, String> {
    let s = &state.click_engine.state;
    Ok(Stats {
        clicks_dispatched: s.clicks_dispatched.load(Ordering::Relaxed),
        clicks_accepted: s.events_accepted.load(Ordering::Relaxed) / 2,
        events_accepted: s.events_accepted.load(Ordering::Relaxed),
        dispatch_calls: s.dispatch_calls.load(Ordering::Relaxed),
        dispatch_failures: s.dispatch_failures.load(Ordering::Relaxed),
        rule_blocked: s.rule_blocked.load(Ordering::Relaxed),
        uptime_secs: telemetry::uptime_secs(s),
        running: s.is_running.load(Ordering::SeqCst),
    })
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Stats {
    clicks_dispatched: u64,
    clicks_accepted: u64,
    events_accepted: u64,
    dispatch_calls: u64,
    dispatch_failures: u64,
    rule_blocked: u64,
    uptime_secs: u64,
    running: bool,
}

#[tauri::command]
fn trigger_burst_now(state: State<'_, AppState>) -> Result<u32, String> {
    Ok(state.click_engine.trigger_single_burst())
}

/// Always stops the engine, whatever the rule says.
#[tauri::command]
fn panic_stop(state: State<'_, AppState>) -> Result<(), String> {
    state.click_engine.stop();
    Ok(())
}

#[tauri::command]
fn update_script(state: State<'_, AppState>, code: String) -> Result<u64, String> {
    let version = state.script_engine.compile(&code)?;
    state.update_profile(|p| p.script = code.clone())?;
    Ok(version)
}

/// Flush the in-memory profile to disk on demand.
#[tauri::command]
fn save_profile(state: State<'_, AppState>) -> Result<(), String> {
    state.persist()
}

#[tauri::command]
fn get_profile(state: State<'_, AppState>) -> Result<Profile, String> {
    state
        .profile
        .lock()
        .map(|p| p.clone())
        .map_err(|_| "profile lock poisoned".to_string())
}

#[tauri::command]
fn reset_profile(state: State<'_, AppState>) -> Result<Profile, String> {
    let fresh = Profile::default();
    apply_profile(&state, &fresh)?;
    Ok(fresh)
}

fn apply_profile(state: &AppState, profile: &Profile) -> Result<(), String> {
    state.click_engine.state.interval_nanos.store(
        profile.interval_micros.saturating_mul(1_000),
        Ordering::Relaxed,
    );
    state
        .click_engine
        .state
        .burst_size
        .store(profile.burst.clamp(MIN_BURST, MAX_BURST), Ordering::Relaxed);
    state
        .click_engine
        .state
        .button
        .store(profile.button.min(2), Ordering::Relaxed);
    state.click_engine.state.mode.store(
        if profile.mode == MODE_CONTINUOUS {
            MODE_CONTINUOUS
        } else {
            MODE_BURST
        },
        Ordering::Relaxed,
    );
    state
        .click_engine
        .state
        .time_critical
        .store(profile.time_critical, Ordering::Relaxed);
    state.click_engine.state.stop_after_ms.store(
        profile.auto_stop_minutes.saturating_mul(60_000),
        Ordering::Relaxed,
    );
    state
        .click_engine
        .state
        .jitter_micros
        .store(profile.jitter_micros.min(100_000), Ordering::Relaxed);

    state.script_engine.compile(&profile.script)?;
    state.hook_manager.apply_bindings(bindings_from(profile));
    *state.profile.lock().map_err(|_| "profile lock poisoned")? = profile.clone();
    state.persist()
}

fn bindings_from(profile: &Profile) -> Bindings {
    Bindings {
        toggle_vk: hooks::vk_from_name(&profile.toggle_key).unwrap_or(0x75),
        hold_vk: hooks::vk_from_name(&profile.hold_key).unwrap_or(0x76),
        panic_vk: hooks::VK_ESCAPE,
        mouse_hold: profile.mouse_hold.filter(|b| *b <= 2),
    }
}

/// Apply one hotkey action to the engine.
///
/// Extracted from the dispatcher thread so the F6/F7/Escape semantics can be
/// tested directly. This is the whole global-hotkey contract: `Toggle` flips,
/// `HoldStart` is idempotent, and `HoldEnd`/`PanicStop` always stop.
fn apply_hook_action(engine: &ClickEngine, action: HookAction) {
    match action {
        HookAction::Toggle => {
            if engine.is_running() {
                engine.stop();
            } else if let Err(err) = engine.start() {
                eprintln!("hyperclicker: hotkey start failed: {err}");
            }
        }
        HookAction::HoldStart => {
            if let Err(err) = engine.start() {
                eprintln!("hyperclicker: hotkey start failed: {err}");
            }
        }
        HookAction::HoldEnd | HookAction::PanicStop => engine.stop(),
    }
}

/// Translate hook actions into engine state changes.
fn spawn_hook_dispatcher(
    engine: Arc<ClickEngine>,
    rx: std::sync::mpsc::Receiver<HookAction>,
    app: AppHandle,
) {
    std::thread::Builder::new()
        .name("hyperclicker-hotkeys".into())
        .spawn(move || {
            while let Ok(action) = rx.recv() {
                apply_hook_action(&engine, action);
                let _ = app.emit("engine://status", engine.is_running());
            }
        })
        .ok();
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            let store = ConfigStore::new(&dir);
            let profile = store.load();

            let script_engine = Arc::new(ScriptEngine::new());
            if let Err(err) = script_engine.compile(&profile.script) {
                eprintln!("hyperclicker: stored rule failed to compile, ignoring it: {err}");
                script_engine
                    .compile("true")
                    .map_err(|err| format!("fallback rule failed to compile: {err}"))?;
            }

            let click_engine = Arc::new(ClickEngine::new(Arc::clone(&script_engine)));
            let hook_manager = HookManager::new();
            hook_manager.apply_bindings(bindings_from(&profile));

            let state = AppState {
                click_engine,
                script_engine,
                hook_manager,
                store,
                profile: Mutex::new(profile),
                ready: AtomicBool::new(true),
            };

            let handle = app.handle().clone();

            // Hotkeys own engine start/stop.
            match state.hook_manager.start() {
                Ok(rx) => {
                    spawn_hook_dispatcher(Arc::clone(&state.click_engine), rx, handle.clone())
                }
                Err(err) => eprintln!("hyperclicker: global hook unavailable: {err}"),
            }

            telemetry::spawn(handle.clone(), state.click_engine.state.clone());

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_capabilities,
            save_profile,
            set_clicker_active,
            set_timing_parameters,
            set_auto_stop,
            set_jitter,
            set_bindings,
            get_stats,
            set_mode,
            set_button,
            set_time_critical,
            trigger_burst_now,
            panic_stop,
            update_script,
            get_profile,
            reset_profile,
        ])
        .build(tauri::generate_context!())
        .expect("error initializing HyperClicker")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if state.ready.load(Ordering::SeqCst) {
                        // Shutdown is the one place it is safe to wait for the
                        // loop: the process is going away regardless.
                        state.click_engine.stop_and_wait();
                        state.hook_manager.stop();
                        let _ = state.persist();
                    }
                }
            }
        });
}

/// Keeps the telemetry event name referenced from the bridge so a rename in
/// `telemetry` is caught here rather than silently unhooking the UI.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::hooks::vk_from_name;

    fn test_engine() -> Arc<ClickEngine> {
        let engine = Arc::new(ClickEngine::new(Arc::new(ScriptEngine::new())));
        engine
            .state
            .interval_nanos
            .store(2_000_000, Ordering::Relaxed);
        engine
    }

    // --- Global hotkey semantics (F6 toggle, F7 hold, Escape panic) ---------

    #[test]
    fn f6_toggles_the_engine_on_then_off() {
        let engine = test_engine();
        assert!(!engine.is_running());
        apply_hook_action(&engine, HookAction::Toggle);
        assert!(engine.is_running(), "F6 must start the engine");
        apply_hook_action(&engine, HookAction::Toggle);
        assert!(!engine.is_running(), "F6 must stop the engine");
        engine.stop_and_wait();
    }

    #[test]
    fn escape_always_stops_regardless_of_rule_state() {
        let engine = test_engine();
        apply_hook_action(&engine, HookAction::Toggle);
        assert!(engine.is_running());
        apply_hook_action(&engine, HookAction::PanicStop);
        assert!(!engine.is_running(), "Escape must always stop the engine");
        engine.stop_and_wait();
    }

    #[test]
    fn hold_start_is_idempotent() {
        let engine = test_engine();
        // Key auto-repeat must not spawn a thread per repeat.
        for _ in 0..50 {
            apply_hook_action(&engine, HookAction::HoldStart);
        }
        assert!(engine.is_running());
        apply_hook_action(&engine, HookAction::HoldEnd);
        assert!(!engine.is_running());
        engine.stop_and_wait();
    }

    #[test]
    fn rapid_toggle_never_ends_up_running() {
        let engine = test_engine();
        for _ in 0..40 {
            apply_hook_action(&engine, HookAction::Toggle);
        }
        // 40 toggles from stopped must end stopped.
        assert!(!engine.is_running());
        engine.stop_and_wait();
    }

    #[test]
    fn the_default_bindings_resolve_to_f6_and_f7() {
        let profile = Profile::default();
        let bindings = bindings_from(&profile);
        assert_eq!(bindings.toggle_vk, 0x75, "F6");
        assert_eq!(bindings.hold_vk, 0x76, "F7");
        assert_eq!(bindings.panic_vk, hooks::VK_ESCAPE);
    }

    #[test]
    fn panic_stop_is_not_blocked_by_a_long_interval() {
        // The regression: the window froze because the stop command joined a
        // loop that was waiting out a long interval on the main thread.
        let engine = test_engine();
        engine
            .state
            .interval_nanos
            .store(10_000_000_000, Ordering::Relaxed);
        apply_hook_action(&engine, HookAction::Toggle);
        std::thread::sleep(std::time::Duration::from_millis(20));

        let start = std::time::Instant::now();
        engine.stop();
        assert!(
            start.elapsed() < engine::r#loop::STOP_DEADLINE,
            "panic stop blocked for {:?}",
            start.elapsed()
        );
        engine.stop_and_wait();
    }

    #[test]
    fn telemetry_event_name_is_stable() {
        // Deliberately compares against the literal: renaming the constant in
        // `telemetry` without updating the frontend subscription fails here.
        assert_eq!(telemetry::TELEMETRY_EVENT, "engine://telemetry");
    }

    #[test]
    fn timing_parameters_are_clamped() {
        assert_eq!(0u64.clamp(MIN_INTERVAL_MICROS, MAX_INTERVAL_MICROS), 10);
        assert_eq!(
            u64::MAX.clamp(MIN_INTERVAL_MICROS, MAX_INTERVAL_MICROS),
            MAX_INTERVAL_MICROS
        );
        assert_eq!(0u32.clamp(MIN_BURST, MAX_BURST), 1);
        assert_eq!(99999u32.clamp(MIN_BURST, MAX_BURST), MAX_BURST);
    }

    #[test]
    fn interval_conversion_does_not_overflow() {
        let micros = MAX_INTERVAL_MICROS;
        assert_eq!(micros.saturating_mul(1_000), 10_000_000_000);
    }

    #[test]
    fn bindings_fall_back_when_key_names_are_invalid() {
        let profile = Profile {
            toggle_key: "NotAKey".to_string(),
            hold_key: "AlsoNotAKey".to_string(),
            ..Profile::default()
        };
        let bindings = bindings_from(&profile);
        assert_eq!(bindings.toggle_vk, 0x75);
        assert_eq!(bindings.hold_vk, 0x76);
    }

    #[test]
    fn auto_stop_minutes_are_clamped_to_a_day() {
        // Mirrors `set_auto_stop`: minutes are capped at 24 h, then converted
        // to milliseconds with saturating arithmetic.
        let millis = |minutes: u64| minutes.min(24 * 60).saturating_mul(60_000);

        assert_eq!(millis(0), 0, "0 disarms the auto-stop timer");
        assert_eq!(millis(1), 60_000);
        assert_eq!(millis(24 * 60), 86_400_000, "exactly a day passes through");
        assert_eq!(millis(10_000), 86_400_000, "beyond a day is capped");
        assert_eq!(
            millis(u64::MAX),
            86_400_000,
            "an absurd value cannot overflow the deadline"
        );
    }

    #[test]
    fn mouse_hold_binding_is_carried_into_the_profile() {
        let profile = Profile {
            mouse_hold: Some(1),
            ..Profile::default()
        };
        assert_eq!(bindings_from(&profile).mouse_hold, Some(1));

        // An out-of-range stored value is dropped rather than installed.
        let bad = Profile {
            mouse_hold: Some(9),
            ..Profile::default()
        };
        assert_eq!(bindings_from(&bad).mouse_hold, None);
    }

    #[test]
    fn bindings_use_valid_names_when_present() {
        let profile = Profile {
            toggle_key: "F9".to_string(),
            hold_key: "F10".to_string(),
            ..Profile::default()
        };
        let bindings = bindings_from(&profile);
        assert_eq!(bindings.toggle_vk, vk_from_name("F9").expect("F9 is valid"));
        assert_eq!(bindings.hold_vk, vk_from_name("F10").expect("F10 is valid"));
    }
}
