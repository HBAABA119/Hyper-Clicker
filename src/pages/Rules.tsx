import { useState } from "react";
import { Suspense, lazy } from "react";

import { api } from "../lib/api";
import { useEngine } from "../lib/store";

const RuleEditor = lazy(() => import("../components/RuleEditor"));

const DEFAULT_SCRIPT = `// Return true to allow clicking.
// Available: get_active_window_title(), get_pixel_hex(x, y),
//             get_cursor_pos(), platform()
true
// Gate on one window by uncommenting:
// get_active_window_title() == "Target Application"`;

const EXAMPLES: { label: string; blurb: string; code: string }[] = [
  {
    label: "Any window",
    blurb: "Always allow",
    code: "true",
  },
  {
    label: "One window",
    blurb: "Title match",
    code: 'get_active_window_title() == "Target Application"',
  },
  {
    label: "Colour gate",
    blurb: "Stop on a pixel",
    code: 'get_pixel_hex(10, 10) != "#FF0000"',
  },
  {
    label: "Desktop only",
    blurb: "Cursor position",
    code: "get_cursor_pos()[1] > 200",
  },
];

export function Rules() {
  const engine = useEngine();
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  const telemetry = engine.telemetry;
  const status = telemetry?.ruleStatus ?? "unconfigured";

  const compile = async () => {
    if (!engine.desktop) return;
    try {
      const version = await api.updateScript(script);
      await api.saveProfile();
      setError(null);
      setApplied(version);
    } catch (err) {
      setError(String(err));
      setApplied(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex min-h-[32rem] flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label">Rule engine</h2>
          <StatusPill status={status} />
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          A Rhai expression that must return{" "}
          <code className="font-mono text-ink-soft">true</code> to click. It is
          compiled to an AST once and evaluated on a gated cadence, never once
          per click.
        </p>

        <div className="mt-4 min-h-[16rem] flex-1 overflow-hidden rounded-xl border border-line">
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-xs text-faint">
                Loading editor…
              </div>
            }
          >
            <RuleEditor value={script} onChange={setScript} />
          </Suspense>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-stop-soft px-3 py-2 font-mono text-[0.6875rem] text-stop">
            {error}
          </p>
        ) : null}
        {telemetry?.ruleError ? (
          <p className="mt-3 rounded-lg bg-stop-soft px-3 py-2 font-mono text-[0.6875rem] text-stop">
            {telemetry.ruleError}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={compile}
            disabled={!engine.desktop}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            Compile &amp; apply
          </button>
          {applied !== null ? (
            <span className="font-mono text-[0.6875rem] text-faint">
              applied · v{applied}
            </span>
          ) : null}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="label">Examples</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => setScript(example.code)}
              className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft"
            >
              <span className="block text-sm font-medium text-ink">
                {example.label}
              </span>
              <span className="block font-mono text-[0.6875rem] text-faint">
                {example.blurb}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-medium">Host functions</h3>
          <dl className="mt-3 space-y-2 text-[0.6875rem]">
            {[
              ["get_active_window_title()", "Title of the focused window, or \"\"."],
              ["get_pixel_hex(x, y)", "Screen pixel as \"#RRGGBB\" via BitBlt."],
              ["get_cursor_pos()", "[x, y] of the cursor."],
              ["platform()", "OS name."],
            ].map(([fn, doc]) => (
              <div key={fn} className="flex flex-wrap gap-x-3">
                <dt className="font-mono text-ink-soft">{fn}</dt>
                <dd className="text-muted">{doc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "blocked"
      ? "bg-warn-soft text-warn"
      : status === "error"
        ? "bg-stop-soft text-stop"
        : status === "allow"
          ? "bg-good-soft text-good"
          : "bg-surface-sunk text-muted";

  const label =
    status === "unconfigured"
      ? "No rule installed"
      : status === "allow"
        ? "Rule allows clicks"
        : status === "blocked"
          ? "Rule is blocking clicks"
          : "Rule error";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-medium ${tone}`}>
      {label}
    </span>
  );
}