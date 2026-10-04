//! Throughput instrumentation.
//!
//! The honest number is not "clicks we asked for" but "clicks the OS accepted",
//! so both are tracked and reported separately, along with the raw send-loop
//! rate. That third figure is the one competitor tools quote as "CPS" while
//! showing a number the OS never actually delivered.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::input_win;
use super::r#loop::{
    now_millis, EngineSharedState, RULE_ALLOW, RULE_BLOCKED, RULE_ERROR, RULE_UNCONFIGURED,
};

/// Event name the frontend listens on.
pub const TELEMETRY_EVENT: &str = "engine://telemetry";

const WINDOW: Duration = Duration::from_millis(100);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySnapshot {
    pub running: bool,
    pub mode: u32,
    pub button: u32,
    pub interval_micros: u64,
    pub burst: u32,
    pub time_critical: bool,

    /// Clicks handed to `SendInput`.
    pub clicks_dispatched: u64,
    /// Clicks the OS confirmed, derived from accepted raw events.
    pub clicks_accepted: u64,
    pub dispatch_calls: u64,
    pub dispatch_failures: u64,
    pub rule_blocked: u64,

    /// Clicks/sec requested by us, over the last window.
    pub dispatch_cps: f64,
    /// Clicks/sec the OS actually accepted, over the last window.
    pub accepted_cps: f64,
    /// `SendInput` calls/sec, over the last window. This is the inflated
    /// "speed" figure most tools advertise; it is not clicks delivered.
    pub send_loop_cps: f64,
    /// Deadline overshoot on the most recent burst.
    pub jitter_micros: f64,

    pub rule_status: String,
    pub rule_error: String,
    pub platform_supported: bool,

    /// Milliseconds until the engine auto-stops. `None` when disabled.
    pub stop_in_ms: Option<u64>,
    /// Seconds the current run has been going.
    pub uptime_secs: u64,
    /// Configured interval jitter (the *setting*). `jitter_micros` above is the
    /// *measured* overshoot; the two are unrelated quantities.
    pub jitter_setting_micros: u32,
}

/// Previous sample, for computing per-window deltas.
#[derive(Default)]
pub struct Sampler {
    clicks: u64,
    events: u64,
    calls: u64,
    last_at: Option<Instant>,
}

fn rule_status_name(code: u32) -> String {
    match code {
        RULE_ALLOW => "allow".into(),
        RULE_BLOCKED => "blocked".into(),
        RULE_ERROR => "error".into(),
        RULE_UNCONFIGURED => "unconfigured".into(),
        _ => "unknown".into(),
    }
}

/// Milliseconds left before the engine stops itself, if an auto-stop is armed.
fn stop_in_ms(state: &EngineSharedState) -> Option<u64> {
    let stop_after = state.stop_after_ms.load(Ordering::Relaxed);
    if stop_after == 0 {
        return None;
    }
    let started = state.started_at_millis.load(Ordering::Relaxed);
    if started == 0 {
        return Some(stop_after);
    }
    Some(stop_after.saturating_sub(now_millis().saturating_sub(started)))
}

pub fn uptime_secs(state: &EngineSharedState) -> u64 {
    let started = state.started_at_millis.load(Ordering::Relaxed);
    if started == 0 {
        return 0;
    }
    now_millis().saturating_sub(started) / 1_000
}

pub fn sample(state: &EngineSharedState, sampler: &mut Sampler) -> TelemetrySnapshot {
    let clicks = state.clicks_dispatched.load(Ordering::Relaxed);
    let events = state.events_accepted.load(Ordering::Relaxed);
    let calls = state.dispatch_calls.load(Ordering::Relaxed);
    let now = Instant::now();

    let elapsed = match sampler.last_at {
        Some(prev) => now.saturating_duration_since(prev).as_secs_f64(),
        None => WINDOW.as_secs_f64(),
    };
    let seconds = if elapsed > f64::EPSILON { elapsed } else { 1.0 };

    let (dispatch_cps, accepted_cps, send_loop_cps) = if sampler.last_at.is_some() {
        (
            (clicks.saturating_sub(sampler.clicks)) as f64 / seconds,
            ((events.saturating_sub(sampler.events)) / 2) as f64 / seconds,
            (calls.saturating_sub(sampler.calls)) as f64 / seconds,
        )
    } else {
        (0.0, 0.0, 0.0)
    };

    sampler.clicks = clicks;
    sampler.events = events;
    sampler.calls = calls;
    sampler.last_at = Some(now);

    let rule_error = state
        .rule_error
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();

    TelemetrySnapshot {
        running: state.is_running.load(Ordering::SeqCst),
        mode: state.mode.load(Ordering::Relaxed),
        button: state.button.load(Ordering::Relaxed),
        interval_micros: state.interval_nanos.load(Ordering::Relaxed) / 1_000,
        burst: state.burst_size.load(Ordering::Relaxed),
        time_critical: state.time_critical.load(Ordering::Relaxed),
        clicks_dispatched: clicks,
        clicks_accepted: events / 2,
        dispatch_calls: calls,
        dispatch_failures: state.dispatch_failures.load(Ordering::Relaxed),
        rule_blocked: state.rule_blocked.load(Ordering::Relaxed),
        dispatch_cps,
        accepted_cps,
        send_loop_cps,
        jitter_micros: state.last_jitter_nanos.load(Ordering::Relaxed) as f64 / 1_000.0,
        rule_status: rule_status_name(state.rule_status.load(Ordering::Relaxed)),
        rule_error,
        platform_supported: input_win::supported(),

        stop_in_ms: stop_in_ms(state),
        uptime_secs: uptime_secs(state),
        jitter_setting_micros: state.jitter_micros.load(Ordering::Relaxed),
    }
}

/// Spawn the 10 Hz emitter. Exits when the app shuts down.
pub fn spawn(app: AppHandle, state: EngineSharedState) {
    std::thread::Builder::new()
        .name("hyperclicker-telemetry".into())
        .spawn(move || {
            let mut sampler = Sampler::default();
            loop {
                std::thread::sleep(WINDOW);
                let snapshot = sample(&state, &mut sampler);
                if app.emit(TELEMETRY_EVENT, &snapshot).is_err() {
                    // The webview is gone, which means the app is closing.
                    return;
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_sample_reports_zero_rates() {
        let state = EngineSharedState::new();
        let mut sampler = Sampler::default();
        let snapshot = sample(&state, &mut sampler);
        assert_eq!(snapshot.dispatch_cps, 0.0);
        assert_eq!(snapshot.accepted_cps, 0.0);
        assert_eq!(snapshot.send_loop_cps, 0.0);
    }

    #[test]
    fn accepted_clicks_are_half_the_accepted_events() {
        let state = EngineSharedState::new();
        let mut sampler = Sampler::default();
        sample(&state, &mut sampler);
        state.events_accepted.store(200, Ordering::Relaxed);
        state.clicks_dispatched.store(100, Ordering::Relaxed);
        state.dispatch_calls.store(50, Ordering::Relaxed);
        let snapshot = sample(&state, &mut sampler);
        assert_eq!(snapshot.clicks_accepted, 100);
        assert!(snapshot.accepted_cps > 0.0);
        assert!(snapshot.dispatch_cps > 0.0);
    }

    #[test]
    fn stop_in_ms_is_none_when_disarmed() {
        let state = EngineSharedState::new();
        assert_eq!(stop_in_ms(&state), None);
    }

    #[test]
    fn stop_in_ms_counts_down_and_never_underflows() {
        let state = EngineSharedState::new();
        state.stop_after_ms.store(60_000, Ordering::Relaxed);
        state
            .started_at_millis
            .store(now_millis().saturating_sub(30_000), Ordering::Relaxed);
        let remaining = stop_in_ms(&state).expect("armed");
        assert!(
            remaining <= 30_000 && remaining >= 28_000,
            "expected roughly 30s left, got {remaining}"
        );

        // Backdate far past the deadline: must saturate, never wrap.
        state
            .started_at_millis
            .store(now_millis().saturating_sub(600_000), Ordering::Relaxed);
        assert_eq!(stop_in_ms(&state), Some(0));
    }

    #[test]
    fn uptime_is_zero_before_the_first_run() {
        let state = EngineSharedState::new();
        assert_eq!(uptime_secs(&state), 0);
    }

    #[test]
    fn rule_status_names_are_stable() {
        assert_eq!(rule_status_name(RULE_BLOCKED), "blocked");
        assert_eq!(rule_status_name(RULE_ALLOW), "allow");
        assert_eq!(rule_status_name(RULE_ERROR), "error");
    }
}