//! Core execution loop and timing engine.
//!
//! Fixes over the original design:
//!
//! * The loop called `start_time.elapsed()` twice per iteration and recomputed
//!   the target interval each pass. It now computes one deadline per iteration
//!   and checks against that.
//! * The Rhai rule engine was never consulted by the loop, so "script rules" did
//!   nothing at all. `evaluate_rule` is now called on a gated cadence and gates
//!   dispatch.
//! * `mode` was declared as a shared atomic but never read. Continuous mode is
//!   now implemented rather than left as a dead field.

use std::hint::spin_loop;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::input_win::{self, InputBatcher};
use super::{DispatchOutcome, TargetButton};
use crate::scripting::{RuleVerdict, ScriptEngine};

/// One batch of `burst_size` clicks, then wait out the interval.
pub const MODE_BURST: u32 = 0;
/// Dispatch back-to-back with no interval wait, letting the OS queue saturate.
pub const MODE_CONTINUOUS: u32 = 1;

/// Rule gate status, mirrored into shared state for telemetry.
pub const RULE_UNCONFIGURED: u32 = 0;
pub const RULE_ALLOW: u32 = 1;
pub const RULE_BLOCKED: u32 = 2;
pub const RULE_ERROR: u32 = 3;

/// How many loop passes may elapse between rule evaluations. Rhai evaluation is
/// orders of magnitude slower than a dispatch, so it must not run per click.
const RULE_CHECK_EVERY: u32 = 32;

/// Ceiling on jitter so a large setting cannot push the interval negative.
const MAX_JITTER_US: u32 = 100_000;

/// Below this remaining time we spin instead of sleeping, because the OS
/// scheduler granularity (1-15.6 ms) is far too coarse to hit a sub-millisecond
/// deadline.
const SPIN_THRESHOLD: Duration = Duration::from_micros(1200);

/// Longest single coarse sleep, so `stop()` stays responsive.
const MAX_COARSE_SLEEP: Duration = Duration::from_millis(2);

#[derive(Clone)]
pub struct EngineSharedState {
    pub is_running: Arc<AtomicBool>,
    pub interval_nanos: Arc<AtomicU64>,
    pub burst_size: Arc<AtomicU32>,
    pub mode: Arc<AtomicU32>,
    pub button: Arc<AtomicU32>,
    pub time_critical: Arc<AtomicBool>,
    /// Clicks handed to `SendInput`.
    pub clicks_dispatched: Arc<AtomicU64>,
    /// Raw events the OS actually accepted (a click is two events).
    pub events_accepted: Arc<AtomicU64>,
    pub dispatch_calls: Arc<AtomicU64>,
    pub dispatch_failures: Arc<AtomicU64>,
    /// Loop passes skipped because the rule blocked.
    pub rule_blocked: Arc<AtomicU64>,
    /// Overshoot past the deadline on the most recent burst, in nanoseconds.
    pub last_jitter_nanos: Arc<AtomicU64>,
    pub rule_status: Arc<AtomicU32>,
    pub rule_error: Arc<Mutex<String>>,
    /// Automatically stop the engine after this many milliseconds. 0 = never.
    /// A hard safety valve: it is enforced inside the loop, so it still fires
    /// if the UI is unresponsive.
    pub stop_after_ms: Arc<AtomicU64>,
    /// Random +/- spread applied to each interval, in microseconds.
    pub jitter_micros: Arc<AtomicU32>,
    /// Unix milliseconds at which the current run began.
    pub started_at_millis: Arc<AtomicU64>,
}

impl EngineSharedState {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            interval_nanos: Arc::new(AtomicU64::new(1_000_000)),
            burst_size: Arc::new(AtomicU32::new(1)),
            mode: Arc::new(AtomicU32::new(MODE_BURST)),
            button: Arc::new(AtomicU32::new(0)),
            time_critical: Arc::new(AtomicBool::new(false)),
            clicks_dispatched: Arc::new(AtomicU64::new(0)),
            events_accepted: Arc::new(AtomicU64::new(0)),
            dispatch_calls: Arc::new(AtomicU64::new(0)),
            dispatch_failures: Arc::new(AtomicU64::new(0)),
            rule_blocked: Arc::new(AtomicU64::new(0)),
            last_jitter_nanos: Arc::new(AtomicU64::new(0)),
            rule_status: Arc::new(AtomicU32::new(RULE_UNCONFIGURED)),
            rule_error: Arc::new(Mutex::new(String::new())),
            stop_after_ms: Arc::new(AtomicU64::new(0)),
            jitter_micros: Arc::new(AtomicU32::new(0)),
            started_at_millis: Arc::new(AtomicU64::new(0)),
        }
    }
}

/// Number of clicks to send on a burst pass.
fn clicks_for(mode: u32, burst: u32) -> u32 {
    if mode == MODE_CONTINUOUS {
        1
    } else {
        burst.max(1)
    }
}

/// Milliseconds since the Unix epoch.
pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Tiny xorshift PRNG. Avoids pulling in `rand` for one bounded random offset.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
}

/// Symmetric +/- spread of at most `spread_us`, never negative.
fn jittered_nanos(base_nanos: u64, spread_us: u32, rng: &mut Rng) -> u64 {
    if spread_us == 0 {
        return base_nanos;
    }
    let spread = rng.next() % (2 * spread_us as u64 + 1);
    let offset = spread as i64 - spread_us as i64;
    let nanos = base_nanos as i64 + offset * 1_000;
    if nanos < 0 {
        0
    } else {
        nanos as u64
    }
}

/// Coarse-sleep while far from the deadline, spin-lock for the final stretch.
fn wait_until(deadline: Instant) -> Duration {
    let start = Instant::now();
    loop {
        let now = Instant::now();
        if now >= deadline {
            break;
        }
        let remaining = deadline - now;
        if remaining > SPIN_THRESHOLD {
            let coarse = (remaining - SPIN_THRESHOLD).min(MAX_COARSE_SLEEP);
            thread::sleep(coarse);
        } else {
            spin_loop();
        }
    }
    deadline.saturating_duration_since(start)
}

pub struct ClickEngine {
    pub state: EngineSharedState,
    rule: Arc<ScriptEngine>,
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl ClickEngine {
    pub fn new(rule: Arc<ScriptEngine>) -> Self {
        Self {
            state: EngineSharedState::new(),
            rule,
            handle: Mutex::new(None),
        }
    }

    pub fn is_running(&self) -> bool {
        self.state.is_running.load(Ordering::SeqCst)
    }

    pub fn start(&self) -> Result<(), String> {
        if self.state.is_running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        self.state
            .started_at_millis
            .store(now_millis(), Ordering::SeqCst);

        let state = self.state.clone();
        let rule = Arc::clone(&self.rule);

        let spawned = thread::Builder::new()
            .name("hyperclicker-engine".into())
            .spawn(move || engine_loop(state, rule));

        match spawned {
            Ok(handle) => {
                *self.handle.lock().map_err(|_| "engine handle poisoned")? = Some(handle);
                Ok(())
            }
            Err(err) => {
                self.state.is_running.store(false, Ordering::SeqCst);
                Err(format!("failed to spawn engine thread: {err}"))
            }
        }
    }

    pub fn stop(&self) {
        self.state.is_running.store(false, Ordering::SeqCst);
        if let Ok(mut slot) = self.handle.lock() {
            if let Some(handle) = slot.take() {
                let _ = handle.join();
            }
        }
    }

    /// Dispatch one burst immediately, without entering the loop.
    pub fn trigger_single_burst(&self) -> u32 {
        let burst = self.state.burst_size.load(Ordering::Relaxed);
        let button = TargetButton::from_u32(self.state.button.load(Ordering::Relaxed));
        let mut batcher = InputBatcher::new();
        batcher.configure(button, burst);
        dispatch_once(&self.state, &batcher)
    }
}

impl EngineSharedState {
    fn clicks_sent(&self, clicks: u32) {
        self.clicks_dispatched
            .fetch_add(clicks as u64, Ordering::Relaxed);
    }
}

/// Fold one dispatch result into the counters.
///
/// Split out from the `SendInput` call so the accounting -- including the
/// rejected case, which is the one that used to be silently dropped -- can be
/// tested deterministically without depending on the OS accepting input.
fn record_dispatch(state: &EngineSharedState, requested: u32, outcome: DispatchOutcome) {
    state.dispatch_calls.fetch_add(1, Ordering::Relaxed);
    state.clicks_sent(requested);
    match outcome {
        DispatchOutcome::Accepted(inserted) => {
            state
                .events_accepted
                .fetch_add(inserted as u64, Ordering::Relaxed);
        }
        DispatchOutcome::Rejected { .. } => {
            state.dispatch_failures.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn dispatch_once(state: &EngineSharedState, batcher: &InputBatcher) -> u32 {
    let requested = batcher.clicks();
    let outcome = batcher.dispatch();
    record_dispatch(state, requested, outcome);
    match outcome {
        DispatchOutcome::Accepted(inserted) => inserted / 2,
        DispatchOutcome::Rejected { .. } => 0,
    }
}

fn engine_loop(state: EngineSharedState, rule: Arc<ScriptEngine>) {
    input_win::elevate_thread_priority(state.time_critical.load(Ordering::Relaxed));

    let mut batcher = InputBatcher::new();
    let mut cached_rule_version = u64::MAX;
    let mut cached_verdict = RuleVerdict::Allow;
    let mut passes_since_check: u32 = 0;
    let mut last_time_critical = state.time_critical.load(Ordering::Relaxed);
    let mut rng = Rng(now_millis() ^ 0x9E37_79B9_7F4A_7C15);

    while state.is_running.load(Ordering::Relaxed) {
        // Re-apply priority only when it actually changes; this is a syscall.
        let want_time_critical = state.time_critical.load(Ordering::Relaxed);
        if want_time_critical != last_time_critical {
            input_win::elevate_thread_priority(want_time_critical);
            last_time_critical = want_time_critical;
        }

        // Rule gate. Re-evaluates when the script changes, otherwise on a
        // cadence so Rhai never dominates the hot loop.
        let version = rule.version();
        if version != cached_rule_version || passes_since_check >= RULE_CHECK_EVERY {
            let snapshot = rule.evaluate();
            cached_verdict = snapshot.verdict;
            cached_rule_version = snapshot.version;
            state
                .rule_status
                .store(snapshot.status_code(), Ordering::Relaxed);
            if let Ok(mut slot) = state.rule_error.lock() {
                *slot = snapshot.error.unwrap_or_default();
            }
            passes_since_check = 0;
        }
        passes_since_check = passes_since_check.saturating_add(1);

        if cached_verdict == RuleVerdict::Blocked {
            state.rule_blocked.fetch_add(1, Ordering::Relaxed);
            // Rule says wait. Idle instead of spinning at 100% CPU.
            thread::sleep(Duration::from_millis(1));
            continue;
        }

        // Auto-stop is checked first so it wins over everything else, including
        // a rule that would otherwise keep dispatching.
        let stop_after = state.stop_after_ms.load(Ordering::Relaxed);
        if stop_after > 0 {
            let started = state.started_at_millis.load(Ordering::Relaxed);
            if started > 0 && now_millis().saturating_sub(started) >= stop_after {
                state.is_running.store(false, Ordering::SeqCst);
                break;
            }
        }

        let mode = state.mode.load(Ordering::Relaxed);
        let button = TargetButton::from_u32(state.button.load(Ordering::Relaxed));
        let burst = state.burst_size.load(Ordering::Relaxed);
        let want_clicks = clicks_for(mode, burst);

        // Rebuild the buffer only on an actual parameter change.
        if batcher.clicks() != want_clicks || batcher.button() != button {
            batcher.configure(button, want_clicks);
        }

        let start = Instant::now();
        dispatch_once(&state, &batcher);

        if mode == MODE_CONTINUOUS {
            // No interval: go straight back around.
            continue;
        }

        let base = state.interval_nanos.load(Ordering::Relaxed);
        let spread = state
            .jitter_micros
            .load(Ordering::Relaxed)
            .min(MAX_JITTER_US);
        let interval = Duration::from_nanos(jittered_nanos(base, spread, &mut rng));
        let deadline = start + interval;
        wait_until(deadline);
        let overshoot = Instant::now().saturating_duration_since(deadline);
        state
            .last_jitter_nanos
            .store(overshoot.as_nanos() as u64, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn engine() -> ClickEngine {
        ClickEngine::new(Arc::new(ScriptEngine::new()))
    }

    #[test]
    fn burst_mode_sends_the_configured_count() {
        assert_eq!(clicks_for(MODE_BURST, 5), 5);
    }

    #[test]
    fn burst_mode_never_sends_zero() {
        assert_eq!(clicks_for(MODE_BURST, 0), 1);
    }

    #[test]
    fn continuous_mode_sends_one_click_per_pass() {
        assert_eq!(clicks_for(MODE_CONTINUOUS, 64), 1);
    }

    #[test]
    fn jitter_is_zero_when_disabled() {
        let mut rng = Rng(12345);
        assert_eq!(jittered_nanos(1_000_000, 0, &mut rng), 1_000_000);
    }

    #[test]
    fn jitter_stays_within_the_configured_spread() {
        let mut rng = Rng(987654321);
        let base = 1_000_000u64;
        let spread = 250u32;
        for _ in 0..2_000 {
            let value = jittered_nanos(base, spread, &mut rng);
            let micros = (value as i64 - base as i64) / 1_000;
            assert!(
                (-(spread as i64)..=spread as i64).contains(&micros),
                "jitter of {micros} us escaped the +/-{spread} us bound"
            );
        }
    }

    #[test]
    fn jitter_never_goes_negative() {
        let mut rng = Rng(42);
        for _ in 0..2_000 {
            assert!(jittered_nanos(0, MAX_JITTER_US, &mut rng) < u64::MAX);
        }
    }

    #[test]
    fn jitter_actually_varies() {
        let mut rng = Rng(7);
        let first = jittered_nanos(1_000_000, 500, &mut rng);
        let second = jittered_nanos(1_000_000, 500, &mut rng);
        assert_ne!(first, second, "jitter should not be constant");
    }

    #[test]
    fn auto_stop_ends_the_run() {
        let engine = engine();
        engine
            .state
            .interval_nanos
            .store(2_000_000, Ordering::Relaxed);
        // Ask to stop after 60 ms and backdate the start by 500 ms, so the very
        // first pass must already be past the deadline.
        engine.state.stop_after_ms.store(60, Ordering::Relaxed);
        engine
            .state
            .started_at_millis
            .store(now_millis().saturating_sub(500), Ordering::Relaxed);
        engine.start().expect("engine should start");
        thread::sleep(Duration::from_millis(150));
        assert!(
            !engine.is_running(),
            "auto-stop should have stopped the engine"
        );
    }

    #[test]
    fn auto_stop_disabled_keeps_running() {
        let engine = engine();
        engine
            .state
            .interval_nanos
            .store(2_000_000, Ordering::Relaxed);
        engine.state.stop_after_ms.store(0, Ordering::Relaxed);
        engine.start().expect("engine should start");
        thread::sleep(Duration::from_millis(120));
        assert!(engine.is_running());
        engine.stop();
    }

    #[test]
    fn wait_until_never_returns_early() {
        let start = Instant::now();
        let target = Duration::from_millis(12);
        wait_until(start + target);
        assert!(
            start.elapsed() >= target,
            "returned after {:?}, expected at least {:?}",
            start.elapsed(),
            target
        );
    }

    #[test]
    fn wait_until_does_not_overshoot_badly() {
        let start = Instant::now();
        let target = Duration::from_millis(12);
        wait_until(start + target);
        let overshoot = start.elapsed() - target;
        assert!(
            overshoot < Duration::from_millis(8),
            "overshot by {:?}",
            overshoot
        );
    }

    #[test]
    fn wait_until_returns_immediately_for_a_passed_deadline() {
        let start = Instant::now();
        wait_until(start - Duration::from_millis(5));
        assert!(start.elapsed() < Duration::from_millis(5));
    }

    #[test]
    fn start_and_stop_are_idempotent() {
        let engine = engine();
        assert!(engine.start().is_ok());
        assert!(engine.is_running());
        // Second start must not spawn a second thread.
        assert!(engine.start().is_ok());
        engine.stop();
        assert!(!engine.is_running());
        engine.stop();
    }

    #[test]
    fn counters_reflect_dispatches() {
        let engine = engine();
        engine
            .state
            .interval_nanos
            .store(5_000_000, Ordering::Relaxed);
        engine.state.burst_size.store(2, Ordering::Relaxed);
        engine.start().expect("engine should start");
        thread::sleep(Duration::from_millis(80));
        engine.stop();

        assert!(engine.state.dispatch_calls.load(Ordering::Relaxed) > 0);
        assert!(
            engine.state.clicks_dispatched.load(Ordering::Relaxed) > 0,
            "clicks_dispatched should advance"
        );
    }

    #[test]
    fn rejected_batches_are_counted_not_hidden() {
        // A rejection must be visible rather than looking like a success.
        let engine = engine();
        record_dispatch(
            &engine.state,
            4,
            DispatchOutcome::Rejected {
                requested: 8,
                last_error: 5,
            },
        );
        assert_eq!(engine.state.dispatch_calls.load(Ordering::Relaxed), 1);
        assert_eq!(engine.state.dispatch_failures.load(Ordering::Relaxed), 1);
        assert_eq!(engine.state.events_accepted.load(Ordering::Relaxed), 0);
        assert_eq!(engine.state.clicks_dispatched.load(Ordering::Relaxed), 4);
    }

    #[test]
    fn accepted_batches_count_only_what_the_os_took() {
        let engine = engine();
        record_dispatch(&engine.state, 4, DispatchOutcome::Accepted(6));
        assert_eq!(engine.state.dispatch_calls.load(Ordering::Relaxed), 1);
        assert_eq!(engine.state.dispatch_failures.load(Ordering::Relaxed), 0);
        assert_eq!(engine.state.events_accepted.load(Ordering::Relaxed), 6);
    }
}
