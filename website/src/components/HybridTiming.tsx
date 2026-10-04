"use client";

import { useEffect, useRef, useState } from "react";

/** Below this much remaining time the engine spins instead of sleeping. */
const SPIN_THRESHOLD_US = 1200;

/**
 * Animated view of one dispatch cycle: a coarse sleep for the bulk of the
 * interval, then a spin-lock for the final stretch where the OS scheduler is
 * too coarse to be useful.
 */
export function HybridTiming({ intervalUs }: { intervalUs: number }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number>(0);

  // Sub-millisecond intervals are entirely spin time; anything longer spends
  // most of its life asleep.
  const spinStart =
    intervalUs <= SPIN_THRESHOLD_US ? 0 : 1 - SPIN_THRESHOLD_US / intervalUs;
  const spinning = progress >= spinStart;
  // Only label the sleep zone when it is wide enough to hold the text.
  const showSleepLabel = spinStart > 0.18;

  useEffect(() => {
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      // Playback speed is fixed in wall-clock terms, but scaled so a 1 ms
      // interval still takes long enough to watch.
      const cyclesPerSecond = Math.max(1 / (intervalUs / 1_000_000), 0.9);
      setProgress((prev) => (prev + (delta / 1000) * cyclesPerSecond) % 1);
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [intervalUs]);

  const remainingUs = Math.max(0, (1 - progress) * intervalUs);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(22_19_15/0.04)]">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">One dispatch cycle</span>
        <span
          className="font-mono text-xs tabular-nums"
          style={{ color: spinning ? "var(--color-accent)" : "var(--color-muted)" }}
        >
          {spinning ? "spin_lock()" : "sleep(500µs)"}
        </span>
      </div>

      {/* Track: sleep zone then spin zone. */}
      <div className="relative mt-4 h-14 overflow-hidden rounded-xl bg-paper-deep">
        <div
          className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgb(22_19_15/0.05)_5px,rgb(22_19_15/0.05)_10px)]"
          style={{ width: `${spinStart * 100}%` }}
          aria-hidden
        />
        <div
          className="absolute inset-y-0 bg-accent-soft"
          style={{ left: `${spinStart * 100}%`, right: 0 }}
          aria-hidden
        />

        <span
          className="absolute inset-y-0 flex items-center pl-3 font-mono text-[0.625rem] uppercase tracking-widest text-faint"
          style={{ width: `${spinStart * 100}%` }}
        >
          {showSleepLabel ? "coarse sleep" : ""}
        </span>
        <span
          className="absolute inset-y-0 right-3 flex items-center font-mono text-[0.625rem] uppercase tracking-widest text-accent"
          style={{ left: `${spinStart * 100}%` }}
        >
          {showSleepLabel ? "spin" : "spin_lock for the whole interval"}
        </span>

        {/* Playhead */}
        <div
          className="absolute inset-y-0 w-px bg-ink"
          style={{ left: `${progress * 100}%` }}
          aria-hidden
        />
        <div
          className="absolute -top-1 size-2.5 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${progress * 100}%` }}
          aria-hidden
        />
      </div>

      <div className="mt-4 flex items-baseline justify-between font-mono text-xs tabular-nums">
        <span className="text-muted">
          {remainingUs < 1
            ? "dispatch →"
            : `${remainingUs.toFixed(0)} µs to deadline`}
        </span>
        <span className="text-faint">interval {intervalUs} µs</span>
      </div>
    </div>
  );
}