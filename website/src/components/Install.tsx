"use client";

import { useState } from "react";

import { Reveal } from "./Reveal";

const PREREQUISITES = [
  ["Rust", "stable toolchain (1.77+)"],
  ["Node", "20 or newer"],
  ["WebView2", "already present on Windows 11"],
  ["Build Tools", "MSVC C++ workload, if you have not got it"],
];

const INSTALL: { label: string; lines: string[] }[] = [
  {
    label: "Run from source",
    lines: ["pnpm install", "pnpm tauri dev"],
  },
  {
    label: "Build an installer",
    lines: ["pnpm tauri build", "", "# .msi and setup.exe land in:", "src-tauri/target/release/bundle/"],
  },
  {
    label: "Run the tests",
    lines: ["cd src-tauri", "cargo test"],
  },
];

export function Install() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard access can be denied; the text is selectable regardless.
      setCopied(null);
    }
  };

  return (
    <section id="install" className="scroll-mt-20 border-t border-line bg-paper-deep/50 py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-14 lg:grid-cols-5">
          <Reveal className="lg:col-span-2">
            <p className="eyebrow">Install</p>
            <h2 className="mt-5 text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              Windows, <em className="font-display italic text-accent">today</em>.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted">
              No installer, no driver, no background service. A single
              executable that starts when you start it and stops when you close
              it.
            </p>

            <dl className="mt-10 space-y-3">
              {PREREQUISITES.map(([term, detail]) => (
                <div
                  key={term}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3"
                >
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-sm text-muted">{detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal className="lg:col-span-3" delay={0.12}>
            <div className="space-y-4">
              {INSTALL.map((block) => {
                const text = block.lines.join("\n");
                return (
                  <div
                    key={block.label}
                    className="overflow-hidden rounded-2xl border border-line bg-surface"
                  >
                    <div className="flex items-center justify-between border-b border-line px-5 py-3">
                      <span className="eyebrow">{block.label}</span>
                      <button
                        type="button"
                        onClick={() => copy(block.label, text)}
                        className="font-mono text-[0.6875rem] text-muted transition-colors hover:text-accent"
                      >
                        {copied === block.label ? "copied" : "copy"}
                      </button>
                    </div>
                    <pre className="overflow-x-auto px-5 py-4 font-mono text-[0.8125rem] leading-relaxed text-ink">
                      <code>{text}</code>
                    </pre>
                  </div>
                );
              })}

              <p className="px-1 text-sm leading-relaxed text-muted">
                Escape always stops the engine, whatever the rule says. Time
                critical thread priority is off by default because it starves
                every other thread on the machine.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}