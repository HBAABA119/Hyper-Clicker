import { Segmented } from "../components/Segmented";
import { Slider } from "../components/Slider";
import { Sparkline } from "../components/Sparkline";
import { Stat } from "../components/Stat";
import {
  BUTTON_NAMES,
  MODE_BURST,
  MODE_CONTINUOUS,
  formatCount,
  formatDuration,
  formatRate,
} from "../lib/api";
import { useEngine } from "../lib/store";

const PRESETS = [
  { label: "10 CPS", micros: 100_000, burst: 1, mode: MODE_BURST, blurb: "Human" },
  { label: "100 CPS", micros: 10_000, burst: 1, mode: MODE_BURST, blurb: "Fast" },
  { label: "1 kHz", micros: 1_000, burst: 1, mode: MODE_BURST, blurb: "Very fast" },
  { label: "Max", micros: 1_000, burst: 1, mode: MODE_CONTINUOUS, blurb: "Send loop" },
];

export function Dashboard() {
  const engine = useEngine();
  const { telemetry, stats, history } = engine;

  const acceptedCps = telemetry?.acceptedCps ?? 0;
  const dispatchCps = telemetry?.dispatchCps ?? 0;
  const sendLoopCps = telemetry?.sendLoopCps ?? 0;
  const failures = telemetry?.dispatchFailures ?? 0;
  const stopInMs = telemetry?.stopInMs ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------- throughput ---------------- */}
      <section className="card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="label">Measured throughput</h2>
          {stopInMs !== null ? (
            <span className="font-mono text-[0.6875rem] tabular-nums text-warn">
              auto-stop in {formatDuration(stopInMs / 1000)}
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          <span className="font-display text-[4.5rem] leading-[0.85] tabular-nums">
            {formatRate(acceptedCps)}
          </span>
          <span className="mb-2 text-sm text-muted">clicks/sec accepted</span>
          {engine.running ? (
            <span className="mb-2.5 ml-auto inline-flex items-center gap-1.5 font-mono text-[0.6875rem] text-good">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-good" />
              </span>
              {formatDuration(telemetry?.uptimeSecs ?? 0)} elapsed
            </span>
          ) : null}
        </div>

        <div className="mt-5">
          <Sparkline
            points={history}
            accent={engine.running ? "var(--color-good)" : "var(--color-line-strong)"}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat
            label="Requested"
            value={formatRate(dispatchCps)}
            hint="clicks/sec we asked for"
          />
          <Stat label="Send loop" value={formatRate(sendLoopCps)} hint="SendInput calls/sec" />
          <Stat
            label="Overshoot"
            value={telemetry ? `${telemetry.jitterMicros.toFixed(0)} µs` : "—"}
            hint="past the deadline"
          />
          <Stat
            label="Rejected"
            value={formatCount(failures)}
            hint="batches the OS refused"
            tone={failures > 0 ? "stop" : "neutral"}
          />
        </div>

        <p className="mt-5 rounded-lg bg-surface-sunk px-3.5 py-3 text-xs leading-relaxed text-muted">
          <span className="text-ink-soft">Accepted</span> is what the OS
          confirmed. <span className="text-ink-soft">SendInput</span> serialises
          into the session input queue, so the send-loop figure is always higher
          than the rate your target window sees. That gap is the OS, not the
          engine.
        </p>
      </section>

      {/* ---------------- session totals ---------------- */}
      <section className="card p-6">
        <h2 className="label">Session</h2>
        <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat
            label="Clicks sent"
            value={formatCount(stats?.clicksDispatched ?? 0)}
            hint="since the app started"
          />
          <Stat
            label="Clicks accepted"
            value={formatCount(stats?.clicksAccepted ?? 0)}
            hint="confirmed by the OS"
            tone="good"
          />
          <Stat
            label="Batches"
            value={formatCount(stats?.dispatchCalls ?? 0)}
            hint="SendInput calls"
          />
          <Stat
            label="Rule blocked"
            value={formatCount(stats?.ruleBlocked ?? 0)}
            hint="cycles the rule stopped"
          />
        </div>
      </section>

      {/* ---------------- presets + quick controls ---------------- */}
      <section className="card p-6">
        <h2 className="label">Presets</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                engine.setInterval(preset.micros);
                engine.setBurst(preset.burst);
                engine.setMode(preset.mode);
              }}
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft"
            >
              <span className="block font-mono text-xs font-medium text-ink">
                {preset.label}
              </span>
              <span className="block text-[0.625rem] text-faint">
                {preset.blurb}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-7 space-y-6">
          <Slider
            label="Interval"
            value={Math.min(engine.interval, 10_000)}
            min={10}
            max={10_000}
            step={10}
            onChange={engine.setInterval}
            display={`${formatCount(Math.min(engine.interval, 10_000))} µs · ≈ ${formatRate(
              1_000_000 / Math.max(engine.interval, 1),
            )} cps`}
            hint="Above 10 ms use the auto-stop and jitter controls in Settings."
          />

          <Slider
            label="Clicks per burst"
            value={engine.burst}
            min={1}
            max={64}
            onChange={engine.setBurst}
            display={String(engine.burst)}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <span className="label mb-2 block">Mode</span>
              <Segmented
                label="Mode"
                value={engine.mode}
                onChange={engine.setMode}
                options={[
                  { value: MODE_BURST, label: "Burst" },
                  { value: MODE_CONTINUOUS, label: "Continuous" },
                ]}
              />
            </div>
            <div>
              <span className="label mb-2 block">Button</span>
              <Segmented
                label="Button"
                size="sm"
                value={engine.button}
                onChange={engine.setButton}
                options={BUTTON_NAMES.map((name, index) => ({
                  value: index,
                  label: name,
                }))}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={engine.fireBurst}
              disabled={!engine.desktop}
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-sunk disabled:opacity-40"
            >
              Fire a single burst
            </button>
            <button
              type="button"
              onClick={engine.panicStop}
              disabled={!engine.desktop}
              className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-stop transition-colors hover:border-stop/40 hover:bg-stop-soft disabled:opacity-40"
            >
              Panic stop
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}