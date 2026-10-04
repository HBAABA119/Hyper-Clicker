import { useState } from "react";

import { KeyCapture } from "../components/KeyCapture";
import { Slider } from "../components/Slider";
import { Switch } from "../components/Switch";
import { Updates } from "../components/Updates";
import { BUTTON_NAMES, formatCount } from "../lib/api";
import { useEngine } from "../lib/store";

export function Settings() {
  const engine = useEngine();
  const [draftToggle, setDraftToggle] = useState(engine.toggleKey);
  const [draftHold, setDraftHold] = useState(engine.holdKey);
  const [draftMouse, setDraftMouse] = useState<number | null>(engine.mouseHold);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    draftToggle !== engine.toggleKey ||
    draftHold !== engine.holdKey ||
    draftMouse !== engine.mouseHold;

  const save = async () => {
    setError(null);
    setSaved(null);
    try {
      await engine.saveBindings(draftToggle, draftHold, draftMouse);
      setSaved("Hotkeys updated. They are live immediately — no restart needed.");
    } catch (err) {
      setError(String(err));
    }
  };

  const applyProfile = async () => {
    setError(null);
    setSaved(null);
    try {
      await engine.resetProfile();
      const fresh = {
        toggleKey: "F6",
        holdKey: "F7",
        mouseHold: null as number | null,
      };
      setDraftToggle(fresh.toggleKey);
      setDraftHold(fresh.holdKey);
      setDraftMouse(fresh.mouseHold);
      setSaved("Profile reset to defaults.");
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------- hotkeys ---------------- */}
      <section className="card p-6">
        <h2 className="label">Hotkeys</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Bindings are applied to the live global hook the moment you save, so
          there is nothing to restart.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <KeyCapture
            label="Toggle engine"
            value={draftToggle}
            onCapture={setDraftToggle}
            hint="Press once to arm, then press a key."
          />
          <KeyCapture
            label="Hold to run"
            value={draftHold}
            onCapture={setDraftHold}
            hint="Runs while held, stops on release."
          />
        </div>

        <div className="mt-5">
          <span className="label">Hold-to-run mouse button</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setDraftMouse(null)}
              className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                draftMouse === null
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted hover:border-line-strong"
              }`}
            >
              Off
            </button>
            {BUTTON_NAMES.map((name, index) => (
              <button
                key={name}
                type="button"
                onClick={() => setDraftMouse(index)}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                  draftMouse === index
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface text-muted hover:border-line-strong"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[0.6875rem] text-faint">
            Synthetic clicks are filtered out of the hook, so binding a button
            cannot make the engine retrigger itself.
          </p>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || !engine.desktop}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save hotkeys
          </button>
          {saved ? (
            <span className="text-[0.6875rem] text-good">{saved}</span>
          ) : null}
          {error ? (
            <span className="font-mono text-[0.6875rem] text-stop">{error}</span>
          ) : null}
        </div>

        <dl className="mt-6 space-y-2 border-t border-line pt-5 text-xs">
          {[
            ["Panic stop", engine.caps?.panicKey ?? "Escape"],
            ["Global hook", engine.caps?.hookActive ? "installed" : "unavailable"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="font-mono text-ink-soft">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- safety ---------------- */}
      <section className="card p-6">
        <h2 className="label">Safety</h2>
        <div className="mt-5 space-y-6">
          <Slider
            label="Auto-stop after"
            value={engine.autoStopMinutes}
            min={0}
            max={120}
            step={5}
            onChange={engine.setAutoStopMinutes}
            display={
              engine.autoStopMinutes === 0
                ? "off"
                : `${formatCount(engine.autoStopMinutes)} min`
            }
            hint="Enforced inside the engine loop, so it still fires if the window is unresponsive."
          />

          <Switch
            label="Time-critical thread priority"
            description="Raises the engine to TIME_CRITICAL, which starves every other thread on the machine. Expect fan noise and a laggy desktop — leave this off on a shared PC."
            checked={engine.timeCritical}
            onChange={engine.setTimeCritical}
          />
        </div>
      </section>

      {/* ---------------- timing ---------------- */}
      <section className="card p-6">
        <h2 className="label">Timing detail</h2>
        <div className="mt-5">
          <Slider
            label="Interval jitter"
            value={engine.jitterMicros}
            min={0}
            max={5_000}
            step={10}
            onChange={engine.setJitterMicros}
            display={
              engine.jitterMicros === 0
                ? "off"
                : `± ${formatCount(engine.jitterMicros)} µs`
            }
            hint="Random spread applied to each interval, so bursts are not metronomic."
          />
        </div>
      </section>

      {/* ---------------- profile ---------------- */}
      <section className="card p-6">
        <h2 className="label">Profile</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Interval, burst, button, mode, hotkeys and your rule persist to a JSON
          file in the app config directory. A corrupt file falls back to defaults
          instead of stopping the app from starting.
        </p>
        <button
          type="button"
          onClick={applyProfile}
          disabled={!engine.desktop}
          className="mt-4 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-stop/40 hover:bg-stop-soft hover:text-stop disabled:opacity-40"
        >
          Reset profile to defaults
        </button>
      </section>

      {/* ---------------- updates ---------------- */}
      <Updates />

      {/* ---------------- platform ---------------- */}
      <section className="card p-6">
        <h2 className="label">Platform</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Platform", engine.caps?.platform ?? "—"],
            ["Native bindings", engine.caps?.nativeBindings ? "available" : "unavailable"],
            [
              "Input dispatch",
              engine.caps?.platformSupported ? "SendInput" : "unsupported",
            ],
            ["Telemetry", "10 Hz"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-line pb-2"
            >
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-mono text-xs text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}