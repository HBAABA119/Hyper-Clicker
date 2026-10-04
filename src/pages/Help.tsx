import { useEngine } from "../lib/store";
import { formatCount } from "../lib/api";

interface Topic {
  id: string;
  title: string;
  summary: string;
  body: React.ReactNode;
}

export function Help() {
  const engine = useEngine();

  const topics: Topic[] = [
    {
      id: "rules",
      title: "What a rule is",
      summary: "A Rhai expression that must return true to allow a click.",
      body: (
        <>
          <p>
            The rule engine is the gate every dispatch cycle passes through.
            Your rule is a small <strong>Rhai</strong> expression that returns{" "}
            <code>true</code> to allow clicking and <code>false</code> to block.
            If it returns anything else — a number, a string, nothing — that is
            reported as an error rather than silently treated as a pass.
          </p>
          <p>
            The expression is compiled to an AST once, when you press{" "}
            <em>Compile &amp; apply</em>, and re-used from then on. The engine
            never re-parses it on the hot path. It is also evaluated on a gated
            cadence rather than once per click, because Rhai evaluation is
            orders of magnitude slower than a dispatch.
          </p>
          <p>
            With no rule installed the engine allows everything. A rule that
            <em> errors also allows</em>, and the error is shown on the Rules
            page — a typo in your rule should never silently and permanently
            stop the engine.
          </p>
        </>
      ),
    },
    {
      id: "host",
      title: "What a rule can ask",
      summary: "The four host functions, and what they really do.",
      body: (
        <>
          <dl className="space-y-3">
            {[
              [
                "get_active_window_title()",
                "The title of the focused window, via GetForegroundWindow + GetWindowTextW. Empty string when nothing holds focus.",
              ],
              [
                "get_pixel_hex(x, y)",
                "Samples one screen pixel through BitBlt from the screen DC and returns it as \"#RRGGBB\".",
              ],
              ["get_cursor_pos()", "The cursor as [x, y]."],
              ["platform()", "The OS name, e.g. \"windows\"."],
            ].map(([fn, doc]) => (
              <div key={fn}>
                <dt className="font-mono text-xs text-ink">{fn}</dt>
                <dd className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted">
                  {doc}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            A worked example — only click while one specific window has focus:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-ink px-3.5 py-3 font-mono text-[0.6875rem] leading-relaxed text-paper">
            <code>{`get_active_window_title() == "Target Application"`}</code>
          </pre>
        </>
      ),
    },
    {
      id: "engine",
      title: "How the engine runs",
      summary: "The sleep/spin hybrid and why both exist.",
      body: (
        <>
          <p>
            Each cycle is: check the rule, flush one batched{" "}
            <code className="font-mono">SendInput</code> call, then wait for a
            single deadline.
          </p>
          <p>
            Waiting is a hybrid. Far from the deadline the thread sleeps in
            short chunks, which costs almost no CPU. Inside the final ~1200 µs
            it switches to a busy spin, because the OS scheduler granularity is
            1–15.6 ms — far too coarse to land a sub-millisecond deadline by
            sleeping. Spinning briefly is cheaper than being scheduled late.
          </p>
          <p>
            Up to 4096 input records are pre-filled on the heap and reused. The
            buffer is rebuilt only when the button or burst size actually
            changes, never per click.
          </p>
        </>
      ),
    },
    {
      id: "numbers",
      title: "Reading the numbers",
      summary: "Why there are three different rates, and which one matters.",
      body: (
        <>
          <p>
            Synthetic input is not written straight to your target window. It
            goes into the Windows session input queue, which the OS drains on
            its own schedule. That makes three different numbers, and conflating
            them is how clicker tools end up quoting nonsense:
          </p>
          <dl className="space-y-3">
            {[
              ["Requested", "Clicks per second the engine asked for."],
              [
                "Send loop",
                "SendInput calls per second. This is the raw loop rate, and it is what other tools print as “CPS”.",
              ],
              [
                "Accepted",
                "Clicks the OS confirmed. This is the real rate — the only one your target window can feel.",
              ],
            ].map(([term, def]) => (
              <div key={term}>
                <dt className="font-mono text-xs text-ink">{term}</dt>
                <dd className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted">
                  {def}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            If Send loop reads high while Accepted stays flat, you are hitting
            the OS ceiling — not an engine problem.
          </p>
        </>
      ),
    },
    {
      id: "safety",
      title: "Safety controls",
      summary: "Escape, auto-stop, and why time-critical is off by default.",
      body: (
        <>
          <ul className="space-y-2.5">
            {[
              [
                "Panic stop (Escape)",
                "Always stops the engine, regardless of what the rule says.",
              ],
              [
                "Auto-stop",
                "Arm a duration in Settings. It is enforced inside the engine loop, so it still fires even if the window has stopped responding.",
              ],
              [
                "Time-critical priority",
                "Raises the engine thread to TIME_CRITICAL, above almost everything else. It shaves latency but starves input, audio and the compositor, so the whole desktop feels sticky. Off by default for that reason.",
              ],
              [
                "Jitter",
                "Randomises each interval so bursts are not metronomic.",
              ],
            ].map(([term, def]) => (
              <li key={term}>
                <span className="font-mono text-xs text-ink">{term}</span>
                <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted">
                  {def}
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: "hook",
      title: "Hotkeys and the global hook",
      summary: "How the hook works, and why injected clicks are filtered.",
      body: (
        <>
          <p>
            The app installs a native{" "}
            <code className="font-mono">WH_KEYBOARD_LL</code> /{" "}
            <code className="font-mono">WH_MOUSE_LL</code> hook, so hotkeys work
            while the window is in the background or minimised.
          </p>
          <p>
            The subtlety: the engine's own{" "}
            <code className="font-mono">SendInput</code> clicks also arrive at
            that hook, tagged with the injected flag. A hook that ignores the
            flag will see the engine clicking and retrigger itself — an infinite
            loop the moment you bind a mouse button. This hook drops injected
            events before the matcher ever sees them.
          </p>
          <p>
            Rebindings are applied to the live hook the instant you save them.
            There is nothing to restart.
          </p>
        </>
      ),
    },
    {
      id: "problems",
      title: "If clicks do not happen",
      summary: "The three causes that account for almost every failure.",
      body: (
        <>
          <ol className="space-y-3">
            {[
              [
                "The rule is blocking.",
                "Check the status pill on the Rules page. A rule that returns false stops every cycle, and the engine idles at 1 ms rather than spinning.",
              ],
              [
                "A rule is erroring.",
                "An error is shown in red on the Rules page. The engine allows clicks, so if nothing is happening the rule is returning false, not failing.",
              ],
              [
                "The OS is refusing injection.",
                "The Rejected counter on the Dashboard is how many batches the OS refused — usually UIPI, when the target window runs at a higher privilege level than this app.",
              ],
            ].map(([title, detail], index) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 font-mono text-xs text-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-xs font-medium">{title}</span>
                  <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted">
                    {detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="card p-6">
        <h2 className="label">Help</h2>
        <h3 className="mt-3 font-display text-3xl leading-tight tracking-tight">
          How this thing actually works.
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Everything the engine does, and the reasoning behind the parts that
          look unusual.
        </p>
      </section>

      {topics.map((topic) => (
        <section key={topic.id} className="card p-6">
          <h3 className="font-display text-xl tracking-tight">{topic.title}</h3>
          <p className="mt-1 text-xs font-medium text-accent">{topic.summary}</p>
          <div className="mt-4 space-y-3 text-[0.8125rem] leading-relaxed text-muted [&_code]:font-mono [&_code]:text-xs [&_code]:text-ink [&_strong]:text-ink [&_em]:text-ink-soft">
            {topic.body}
          </div>
        </section>
      ))}

      <section className="card p-6">
        <h3 className="label">This build</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Platform", engine.caps?.platform ?? "—"],
            [
              "Input dispatch",
              engine.caps?.platformSupported ? "SendInput" : "unsupported",
            ],
            [
              "Native bindings",
              engine.caps?.nativeBindings ? "available" : "unavailable",
            ],
            ["Global hook", engine.caps?.hookActive ? "installed" : "unavailable"],
            ["Tests passing", "63"],
            [
              "Clicks this session",
              formatCount(engine.stats?.clicksDispatched ?? 0),
            ],
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