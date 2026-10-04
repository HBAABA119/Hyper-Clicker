"use client";

import { useState } from "react";

import { Reveal } from "./Reveal";

const ITEMS: { q: string; a: string }[] = [
  {
    q: "Why can't it hit 100,000 clicks per second?",
    a: "Because Windows will not deliver them. SendInput writes into the session input queue, which the OS drains on its own schedule. The tools quoting six-figure rates are timing a loop of API calls, not clicks that arrived. The app measures the accepted rate instead, which is the one your target window can actually feel.",
  },
  {
    q: "Will it get flagged as automation?",
    a: "Injected input is visible to the OS, and games that check for synthetic input can see it. Whether an application accepts it is that application's policy, not something this tool decides.",
  },
  {
    q: "What does time-critical priority actually do?",
    a: "It raises the engine thread to TIME_CRITICAL, above almost everything else on the machine. It shaves latency but starves input, audio and the compositor, so the whole desktop feels sticky and fans spin up. It is off by default for that reason.",
  },
  {
    q: "Can I stop it if something goes wrong?",
    a: "Escape always stops the engine, whatever the rule says. You can also arm an auto-stop in Settings, which is enforced inside the engine loop and therefore still fires even if the window has become unresponsive.",
  },
  {
    q: "Does binding a mouse button cause a feedback loop?",
    a: "No. SendInput sets the injected flag on low-level hooks, so a naive hook sees the engine's own clicks and retriggers itself. This one filters that flag before the hotkey matcher ever sees the event.",
  },
  {
    q: "What happens on a corrupt profile file?",
    a: "It falls back to defaults and logs the reason. A bad config should never be the reason the app will not start.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-20 border-y border-line bg-paper-deep/50 py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-4xl px-5 sm:px-6">
        <Reveal>
          <p className="eyebrow">Questions</p>
          <h2 className="mt-5 text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            The things people{" "}
            <em className="font-display italic text-accent">ask first</em>.
          </h2>
        </Reveal>

        <div className="mt-12 divide-y divide-line border-y border-line">
          {ITEMS.map((item, index) => {
            const expanded = open === index;
            return (
              <Reveal key={item.q} delay={index * 0.04}>
                <div>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : index)}
                    aria-expanded={expanded}
                    className="flex w-full items-start justify-between gap-6 py-5 text-left"
                  >
                    <span className="text-base font-medium sm:text-lg">
                      {item.q}
                    </span>
                    <span
                      aria-hidden
                      className={`mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-line transition-transform duration-300 ${
                        expanded ? "rotate-45" : ""
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="size-3"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      expanded
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-2xl pr-10 pb-6 leading-relaxed text-muted">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}