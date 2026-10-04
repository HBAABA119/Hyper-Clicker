"use client";

import { Reveal } from "./Reveal";

const ROWS: {
  feature: string;
  theirs: string;
  ours: string;
}[] = [
  {
    feature: "Throughput reporting",
    theirs: "Quotes the send-loop rate",
    ours: "Reports clicks the OS accepted",
  },
  {
    feature: "Failed dispatches",
    theirs: "Silently discarded",
    ours: "Counted and shown",
  },
  {
    feature: "Conditional rules",
    theirs: "App-specific, hard-coded",
    ours: "Rhai script, compiled to an AST",
  },
  {
    feature: "Input buffer",
    theirs: "Allocated per call",
    ours: "Heap buffer, rebuilt on change",
  },
  {
    feature: "Global hook safety",
    theirs: "Sees its own synthetic clicks",
    ours: "Filters the injected flag",
  },
  {
    feature: "Persistence",
    theirs: "Settings reset on quit",
    ours: "JSON profile, corrupt-safe",
  },
];

export function Comparison() {
  return (
    <section id="compare" className="scroll-mt-20 py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <Reveal>
          <p className="eyebrow">Comparison</p>
          <h2 className="mt-5 max-w-3xl text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            What a typical clicker{" "}
            <em className="font-display italic text-accent">leaves out</em>.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          {/* Phone: stacked cards. A three-column grid is unusable at 390px
              and pushes the page into horizontal overflow. */}
          <div className="mt-12 space-y-3 sm:hidden">
            {ROWS.map((row) => (
              <div
                key={row.feature}
                className="rounded-2xl border border-line bg-surface p-5"
              >
                <h3 className="text-sm font-medium">{row.feature}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="eyebrow">Typical tool</dt>
                    <dd className="mt-0.5 leading-relaxed text-muted">
                      {row.theirs}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow !text-accent">HyperClicker</dt>
                    <dd className="mt-0.5 flex items-start gap-2 leading-relaxed">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-measured)"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-1 size-4 shrink-0"
                        aria-hidden
                      >
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                      <span>{row.ours}</span>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          {/* Tablet and up: the comparison table. */}
          <div className="mt-12 hidden overflow-hidden rounded-2xl border border-line bg-surface sm:block">
            <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-px bg-line text-sm">
              <div className="bg-surface px-5 py-3">
                <span className="eyebrow">Behaviour</span>
              </div>
              <div className="bg-surface px-5 py-3">
                <span className="eyebrow">Typical tool</span>
              </div>
              <div className="bg-accent-soft px-5 py-3">
                <span className="eyebrow !text-accent">HyperClicker</span>
              </div>
            </div>

            {ROWS.map((row) => (
              <div
                key={row.feature}
                className="grid grid-cols-[1.6fr_1fr_1fr] items-start gap-px border-t border-line bg-line text-sm"
              >
                <div className="bg-surface px-5 py-4 font-medium">
                  {row.feature}
                </div>
                <div className="bg-surface px-5 py-4 leading-relaxed text-muted">
                  {row.theirs}
                </div>
                <div className="flex items-start gap-2 bg-surface px-5 py-4 leading-relaxed text-ink">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-measured)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  >
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                  <span>{row.ours}</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
            None of this makes clicks faster on its own. It makes the number you
            are shown trustworthy, which is the part most tools skip.
          </p>
        </Reveal>
      </div>
    </section>
  );
}