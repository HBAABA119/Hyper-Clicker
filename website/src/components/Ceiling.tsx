"use client";

import { motion } from "motion/react";

import { Reveal } from "./Reveal";

const BARS = [
  {
    key: "send",
    label: "Send loop",
    detail:
      "How fast the engine can call SendInput. This is the number most tools put on their homepage.",
    value: "~1 kHz",
    width: "100%",
    color: "var(--color-line-strong)",
    text: "var(--color-muted)",
  },
  {
    key: "accepted",
    label: "Accepted by the OS",
    detail:
      "How many of those actually reached the target window. Windows drains the session input queue on its own schedule.",
    value: "hundreds /s",
    width: "46%",
    color: "var(--color-measured)",
    text: "var(--color-measured)",
  },
  {
    key: "jitter",
    label: "Deadline overshoot",
    detail:
      "How far past the target timestamp a burst lands. The hybrid sleep/spin loop keeps this in the tens of microseconds.",
    value: "tens of µs",
    width: "12%",
    color: "var(--color-accent)",
    text: "var(--color-accent)",
  },
];

export function Ceiling() {
  return (
    <section id="ceiling" className="scroll-mt-20 border-y border-line bg-paper-deep/50 py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="eyebrow">The ceiling is the operating system</p>
          <h2 className="mt-5 max-w-3xl text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            You cannot click faster than Windows{" "}
            <em className="font-display italic text-accent">lets you</em>.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Synthetic input is not written straight to your target window. It is
            serialised into the session input queue and drained by the OS on its
            own schedule. Anyone quoting 100,000 clicks per second is measuring
            how fast a loop can call an API, not clicks that landed.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-10 lg:grid-cols-3">
          {BARS.map((bar, index) => (
            <Reveal key={bar.key} delay={index * 0.1}>
              <div className="h-full">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium">{bar.label}</span>
                  <span
                    className="font-mono text-sm tabular-nums"
                    style={{ color: bar.text }}
                  >
                    {bar.value}
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: bar.color }}
                    initial={{ width: 0 }}
                    whileInView={{ width: bar.width }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{
                      duration: 1.1,
                      delay: 0.15 + index * 0.12,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </div>

                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {bar.detail}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.15}>
          <div className="mt-16 rounded-2xl border border-line bg-surface p-6 md:p-8">
            <p className="eyebrow">What the app shows instead</p>
            <div className="mt-5 grid gap-6 sm:grid-cols-3">
              {[
                ["Accepted CPS", "What the OS confirmed, sampled at 10 Hz."],
                ["Send-loop CPS", "Raw call rate, kept separate so the gap is visible."],
                ["Rejected batches", "UIPI-blocked injections, surfaced rather than swallowed."],
              ].map(([title, body]) => (
                <div key={title}>
                  <div className="font-medium">{title}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}