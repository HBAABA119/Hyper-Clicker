"use client";

import { motion } from "motion/react";

import { Reveal } from "./Reveal";

const STAGES = [
  {
    name: "Global hook",
    detail:
      "WH_KEYBOARD_LL / WH_MOUSE_LL, filtering LLMHF_INJECTED so the engine cannot retrigger its own hotkey.",
    tech: "Win32",
  },
  {
    name: "Rule gate",
    detail:
      "A Rhai AST compiled once on edit, evaluated on a gated cadence rather than once per click.",
    tech: "Rhai",
  },
  {
    name: "Precision loop",
    detail:
      "One deadline per cycle: coarse sleep, then spin_lock for the final sub-millisecond.",
    tech: "Rust",
  },
  {
    name: "Batch buffer",
    detail:
      "Up to 4096 pre-filled INPUT records on the heap, rebuilt only when a parameter changes.",
    tech: "heap",
  },
  {
    name: "Kernel",
    detail:
      "One SendInput call per burst. The return value is checked, never discarded.",
    tech: "SendInput",
  },
];

export function Architecture() {
  return (
    <section id="architecture" className="scroll-mt-20 border-y border-line bg-paper-deep/50 py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="eyebrow">Architecture</p>
          <h2 className="mt-5 max-w-3xl text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            From hook to kernel in{" "}
            <em className="font-display italic text-accent">five hops</em>.
          </h2>
        </Reveal>

        <ol className="mt-14 space-y-3">
          {STAGES.map((stage, index) => (
            <Reveal key={stage.name} delay={index * 0.07}>
              <li className="group relative grid gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-colors duration-300 hover:border-line-strong sm:grid-cols-[3rem_14rem_1fr_auto] sm:items-center sm:gap-6">
                {/* Accent bar that wipes in on hover. */}
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-0.5 bg-accent"
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.6,
                    delay: 0.1 + index * 0.07,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{ originY: 0 }}
                />

                <span className="font-mono text-sm text-faint tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span className="font-display text-2xl tracking-tight">
                  {stage.name}
                </span>

                <span className="text-sm leading-relaxed text-muted">
                  {stage.detail}
                </span>

                <span className="justify-self-start rounded-full border border-line bg-paper-deep px-2.5 py-1 font-mono text-[0.625rem] text-muted sm:justify-self-end">
                  {stage.tech}
                </span>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}