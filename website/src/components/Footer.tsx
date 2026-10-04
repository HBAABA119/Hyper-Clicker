export function Footer() {
  return (
    <footer className="border-t border-line py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-ink font-mono text-[0.5625rem] font-semibold text-paper">
              HC
            </span>
            <span className="font-display text-lg">HyperClicker</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            An input automation utility for testing and personal workflows.
            Respect the terms of service of whatever you point it at.
          </p>
        </div>

        <div className="font-mono text-[0.6875rem] leading-relaxed text-faint">
          <p>Windows · Rust 1.97 · Tauri 2 · React 19</p>
          <p className="mt-1">Next.js 16 · Instrument Serif · Geist</p>
        </div>
      </div>
    </footer>
  );
}