"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { HybridTiming } from "./HybridTiming";

const EASE = [0.16, 1, 0.3, 1] as const;

const rise = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, delay: 0.08 * i, ease: EASE },
  }),
};

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Gentle parallax: the headline drifts up faster than the page scrolls.
  const headlineY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const diagramY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} id="top" className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-28">
      {/* Soft warm wash behind the headline. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[38rem] opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, var(--color-accent-soft) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <motion.div style={{ y: headlineY, opacity: fade }}>
          <motion.p
            custom={0}
            variants={rise}
            initial="hidden"
            animate="show"
            className="eyebrow"
          >
            Windows · Rust · Tauri
          </motion.p>

          <motion.h1
            custom={1}
            variants={rise}
            initial="hidden"
            animate="show"
            className="mt-6 max-w-4xl text-[3.25rem] leading-[0.95] font-normal tracking-[-0.03em] sm:text-6xl md:text-[5.25rem]"
          >
            Clicks the OS{" "}
            <em className="font-display italic text-accent">actually</em>{" "}
            accepted.
          </motion.h1>

          <motion.p
            custom={2}
            variants={rise}
            initial="hidden"
            animate="show"
            className="mt-7 max-w-2xl text-lg leading-relaxed text-muted"
          >
            A click engine that batches input into single kernel calls, gates
            every cycle on a live rule, and reports the throughput it measured
            — not the throughput it wished for.
          </motion.p>

          <motion.div
            custom={3}
            variants={rise}
            initial="hidden"
            animate="show"
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <a href="#install" className="btn-primary">
              Download for Windows
            </a>
            <a href="#simulator" className="btn-ghost">
              Try the timing simulator
            </a>
          </motion.div>
        </motion.div>

        <motion.div
          custom={4}
          variants={rise}
          initial="hidden"
          animate="show"
          style={{ y: diagramY }}
          className="mt-16 max-w-3xl"
        >
          <HybridTiming intervalUs={2000} />
        </motion.div>

        <motion.dl
          custom={5}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-14 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4"
        >
          {[
            ["4096", "events per kernel call"],
            ["1200 µs", "sleep → spin crossover"],
            ["10 Hz", "telemetry cadence"],
            ["51", "engine unit tests"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="font-mono text-xl tabular-nums">{value}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted">
                {label}
              </dd>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}