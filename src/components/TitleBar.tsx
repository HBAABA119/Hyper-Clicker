import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Logo } from "./Logo";
import { isDesktop } from "../lib/api";

interface TitleBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  running: boolean;
  onToggleEngine: () => void;
}

/**
 * Custom title bar. The window is undecorated (`decorations: false`), so this
 * supplies the drag region and the window controls, styled to match the app
 * rather than looking like a bolted-on Windows chrome.
 */
export function TitleBar({
  sidebarCollapsed,
  onToggleSidebar,
  running,
  onToggleEngine,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    const win = getCurrentWindow();

    const sync = () => {
      win
        .isMaximized()
        .then(setMaximized)
        .catch(() => setMaximized(false));
    };
    sync();

    // Keep the restore/maximise glyph in step with the real window state.
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const control = async (action: "minimize" | "toggle" | "close") => {
    if (!isDesktop()) return;
    try {
      const win = getCurrentWindow();
      if (action === "minimize") await win.minimize();
      if (action === "toggle") await win.toggleMaximize();
      if (action === "close") await win.close();
    } catch (err) {
      console.error(`window ${action} failed`, err);
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface pl-2 select-none"
    >
      {/* Left: sidebar toggle + brand */}
      <div className="flex items-center gap-1" data-tauri-drag-region>
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-sunk hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            className="size-4"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <line x1="9.5" y1="4" x2="9.5" y2="20" />
            {sidebarCollapsed ? (
              <polyline points="13 10 16 12 13 14" />
            ) : (
              <polyline points="15 10 12 12 15 14" />
            )}
          </svg>
        </button>

        <div
          className="ml-1 flex items-center gap-2.5"
          data-tauri-drag-region
        >
          <Logo size={22} />
          <span
            data-tauri-drag-region
            className="font-display text-lg leading-none tracking-tight"
          >
            HyperClicker
          </span>
          <span
            data-tauri-drag-region
            className="hidden font-mono text-[0.625rem] uppercase tracking-[0.18em] text-faint sm:inline"
          >
            precision input engine
          </span>
        </div>
      </div>

      {/* Right: quick engine toggle + window controls */}
      <div className="flex h-full items-stretch">
        <button
          type="button"
          onClick={onToggleEngine}
          className={`flex items-center gap-2 px-4 text-xs font-medium transition-colors ${
            running
              ? "text-good hover:bg-good-soft"
              : "text-muted hover:bg-surface-sunk hover:text-ink"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              running ? "bg-good" : "bg-line-strong"
            }`}
          />
          {running ? "running" : "idle"}
        </button>

        <WindowButton label="Minimise" onClick={() => control("minimize")}>
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </WindowButton>

        <WindowButton
          label={maximized ? "Restore" : "Maximise"}
          onClick={() => control("toggle")}
        >
          {maximized ? (
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <rect x="2.5" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M4.5 4V2.6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          )}
        </WindowButton>

        <WindowButton
          label="Close"
          danger
          onClick={() => control("close")}
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton({
  children,
  label,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex w-11 items-center justify-center transition-colors ${
        danger
          ? "text-muted hover:bg-stop hover:text-white"
          : "text-muted hover:bg-surface-sunk hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}