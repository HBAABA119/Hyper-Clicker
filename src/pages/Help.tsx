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
      title: "Safety controls and privacy",
      summary: "Escape, auto-stop, why time-critical is off, and what never leaves your machine.",
      body: (
        <>
          <ul className="space-y-2.5">
            {[
              [
                "Panic stop (Escape)",
                "Always stops the engine, regardless of what the rule says. The stop is checked inside the engine loop rather than in the interface, so it still works if the window has stopped responding.",
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

          <p className="pt-1">
            <strong>No administrator rights.</strong> The installer is a per-user
            install. HyperClicker never requests elevation and does not need it.
          </p>
          <p>
            <strong>Your rule cannot do anything else.</strong> The script engine
            exposes four read-only functions — window title, one pixel, cursor
            position and platform — with no file, network or process access. It
            runs under an operation cap, so a runaway script is stopped instead
            of freezing the app.
          </p>
          <p>
            <strong>One network call, and only when you ask.</strong> Checking
            for updates reads the public GitHub releases API. Nothing else leaves
            the machine — no telemetry, no analytics, no account.
          </p>
          <p>
            <strong>Your profile stays local.</strong> A single JSON file in the
            app config directory holding your settings and your rule. Settings →
            Uninstall removes it along with the program.
          </p>
          <p>
            The one real risk is the obvious one: this sends genuine clicks to
            whatever window has focus. A rule that allows everything while you
            are typing will click your own UI. Gate on the window title if you
            plan to leave it running.
          </p>
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
      summary: "The causes that account for almost every failure.",
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
              [
                "The hotkey did nothing.",
                "Settings reports whether the global hook installed. If it says unavailable, another program is holding a low-level hook, and the on-screen controls still work. If it says installed, try a different key — some keyboards route F-keys through the OS before applications see them.",
              ],
              [
                "The whole machine feels slow.",
                "That was a real bug and is fixed: the engine used to spin out the rest of its interval before stopping, and ran at the highest thread priority, so the desktop stayed sluggish after a stop. Stops are immediate now and priority is restored when the engine exits. If it still feels slow while running, turn off time-critical priority.",
              ],
              [
                "Settings will not save a binding.",
                "A key name is rejected if it is unknown, or if toggle and hold are the same key. The message under the button says which one.",
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
    {
      id: "first-run",
      title: "Your first minute",
      summary: "A safe order to try things in, so nothing runs away from you.",
      body: (
        <>
          <ol className="space-y-3">
            {[
              [
                "Leave the interval where it is",
                "1,000 us is about 1 click per second. Move the slider later. Start slow so you can see what is happening.",
              ],
              [
                "Check Rules",
                "The default rule is `true`, which allows everything. If the Dashboard shows Rule blocked, your rule is the reason — the Rules page names the error.",
              ],
              [
                "Press F6",
                "The status dot turns from idle to running. F6 again stops it. Escape always stops it, whatever the rule says.",
              ],
              [
                "Watch Accepted, not Requested",
                "The big number is the rate the OS confirmed. If Requested is 1,000 and Accepted is 12, the engine asked for 1,000 a second and the machine delivered 12 — that is Windows, not the engine.",
              ],
              [
                "Stop before you leave",
                "Escape, or the Stop button. If anything feels wrong, Escape first and investigate after. Auto-stop exists for exactly this.",
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
          <p>
            If a hotkey does nothing, check Settings — it tells you whether the
            global hook installed. If it says <em>unavailable</em>, another
            program with an exclusive low-level hook is running, and you can
            still use the on-screen controls.
          </p>
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
            ["Tests passing", "77"],
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