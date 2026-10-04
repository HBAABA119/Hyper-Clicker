"use client";

import { useMemo, useState } from "react";

import { HybridTiming } from "./HybridTiming";
import { Reveal } from "./Reveal";

/** Typical ceiling for sustained SendInput delivery on Windows. */
const DELIVERABLE_CPS = 2000;
const MAX_TICKS = 240;

/** Slider is logarithmic so the sub-millisecond range stays usable. */
function sliderToMicros(position: number): number {
  const t = position / 1000;
  return Math.round(10 * Math.pow(1000, t));
}

function microsToSlider(micros: number): number {
  return Math.round(
    1000 * (Math.log(micros / 10) / Math.log(1000)),
  );
}

export function Simulator() {
  const [intervalPos, setIntervalPos] = useState(
    microsToSlider(1000),
  );
  const [burst, setBurst] = useState(1);

  const intervalUs = sliderToMicros(intervalPos);
  const theoreticalCps = (burst * 1_000_000) / intervalUs;
  const beyondCeiling = theoreticalCps > DELIVERABLE_CPS;

  const ticks = useMemo(() => {
    const count = Math.min(Math.round(theoreticalCps), MAX_TICKS);
    return Array.from({ length: count }, (_, i) => i);
  }, [theoreticalCps]);

  return (
    <section id="simulator" className="scroll-mt-20 py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="eyebrow">Interactive</p>
          <h2 className="mt-5 max-w-3xl text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            Move the sliders, watch the{" "}
            <em className="font-display italic text-accent">schedule</em>{" "}
            change.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            This is the engine&apos;s actual timing model: how long it sleeps
            coarsely, when it switches to spinning, and what the resulting click
            rate would be before the OS gets a vote.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 lg:grid-cols-5">
          <Reveal className="lg:col-span-2">
            <div className="space-y-8">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="sim-interval" className="text-sm font-medium">
                    Interval
                  </label>
                  <span className="font-mono text-sm tabular-nums text-accent">
                    {intervalUs.toLocaleString()} µs
                  </span>
                </div>
                <input
                  id="sim-interval"
                  type="range"
                  min={0}
                  max={1000}
                  value={intervalPos}
                  onChange={(e) => setIntervalPos(Number(e.target.value))}
                  className="mt-2"
                />
                <div className="mt-1 flex justify-between font-mono text-[0.625rem] text-faint">
                  <span>10 µs</span>
                  <span>1 ms</span>
                  <span>10 ms</span>
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="sim-burst" className="text-sm font-medium">
                    Clicks per burst
                  </label>
                  <span className="font-mono text-sm tabular-nums text-accent">
                    {burst}
                  </span>
                </div>
                <input
                  id="sim-burst"
                  type="range"
                  min={1}
                  max={64}
                  value={burst}
                  onChange={(e) => setBurst(Number(e.target.value))}
                  className="mt-2"
                />
                <div className="mt-1 flex justify-between font-mono text-[0.625rem] text-faint">
                  <span>1</span>
                  <span>64</span>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="eyebrow">Theoretical rate</p>
                <p className="mt-2 font-mono text-3xl tabular-nums">
                  {theoreticalCps >= 1000
                    ? `${(theoreticalCps / 1000).toFixed(1)}k`
                    : theoreticalCps.toFixed(theoreticalCps < 10 ? 2 : 0)}{" "}
                  <span className="text-base text-muted">cps</span>
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {beyondCeiling ? (
                    <>
                      Above the ~{DELIVERABLE_CPS.toLocaleString()} cps Windows
                      typically delivers. The engine will{" "}
                      <em className="font-display italic text-ink">send</em> at
                      this rate; your target window will not{" "}
                      <em className="font-display italic text-ink">receive</em>{" "}
                      it.
                    </>
                  ) : (
                    <>
                      Comfortably inside what the OS will actually deliver. The
                      accepted rate should track the requested rate closely.
                    </>
                  )}
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal className="lg:col-span-3" delay={0.12}>
            <div className="rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">One second of dispatch</span>
                <span className="font-mono text-xs text-faint tabular-nums">
                  {ticks.length === MAX_TICKS && theoreticalCps > MAX_TICKS
                    ? `showing first ${MAX_TICKS} of ${Math.round(theoreticalCps).toLocaleString()}`
                    : `${ticks.length} bursts`}
                </span>
              </div>

              <div className="mt-5 flex h-28 items-end gap-px overflow-hidden rounded-xl bg-paper-deep px-2 py-3">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className="w-full rounded-sm transition-colors duration-300"
                    style={{
                      height: beyondCeiling ? "100%" : `${28 + (tick % 7) * 9}%`,
                      background: beyondCeiling
                        ? "var(--color-warn)"
                        : "var(--color-measured)",
                      opacity: beyondCeiling ? 0.55 : 0.85,
                    }}
                  />
                ))}
              </div>

              <p className="mt-3 font-mono text-[0.6875rem] leading-relaxed text-faint">
                {beyondCeiling
                  ? "Highlighted in amber: past this point the queue is the bottleneck, not the loop."
                  : "Green bursts are what the OS will actually deliver."}
              </p>
            </div>

            <div className="mt-6">
              <HybridTiming intervalUs={intervalUs} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}