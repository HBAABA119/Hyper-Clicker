"use client";

import { Reveal } from "./Reveal";

const FEATURES = [
  {
    title: "Every dispatch is checked",
    body: "SendInput returns how many events it inserted and zero on failure. A rejected burst is counted and shown, not mistaken for a click.",
    icon: (
      <path d="M4 12l5 5L20 6" />
    ),
  },
  {
    title: "Nothing on the hot path",
    body: "The 4096-record INPUT buffer lives on the heap and is rebuilt only when the button or burst size actually changes.",
    icon: <path d="M3 7h18M3 12h18M3 17h18" />,
  },
  {
    title: "Rules that do something",
    body: "A Rhai expression compiled to an AST gates every cycle. Foreground window titles and screen pixels are read through real Win32 calls.",
    icon: <path d="M8 6l-5 6 5 6M16 6l5 6-5 6" />,
  },
  {
    title: "No self-retriggering",
    body: "Injected clicks are filtered out of the global hook by flag, so binding a mouse button cannot start an infinite loop.",
    icon: <path d="M12 3v18M5 8l7-5 7 5v8l-7 5-7-5z" />,
  },
  {
    title: "Tune without locking",
    body: "Interval, burst, mode and button are atomics. The UI can change them mid-run with zero contention on the dispatch loop.",
    icon: <path d="M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2m12 0h2" />,
  },
  {
    title: "Survives a restart",
    body: "Interval, burst, hotkeys and your rule persist to a JSON profile, and a corrupt file falls back to defaults instead of failing to start.",
    icon: <path d="M5 8h14v12H5zM9 8V5h6v3" />,
  },
];

export function Features() {
  return (
    <section id="engine" className="scroll-mt-20 py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="eyebrow">Engine</p>
          <h2 className="mt-5 max-w-3xl text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            Built to be{" "}
            <em className="font-display italic text-accent">measurable</em>.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 0.06}>
              <article className="h-full bg-surface p-7">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-6"
                  aria-hidden
                >
                  {feature.icon}
                </svg>
                <h3 className="mt-5 font-medium">{feature.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  {feature.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}