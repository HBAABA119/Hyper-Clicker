import { Logo } from "./Logo";

export type PageId = "dashboard" | "rules" | "settings" | "help";

interface SidebarProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  collapsed: boolean;
  running: boolean;
}

const ITEMS: { id: PageId; label: string; icon: React.ReactNode }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <>
        <rect x="3" y="3" width="7.5" height="8" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
        <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
        <rect x="3" y="14" width="7.5" height="7" rx="1.5" />
      </>
    ),
  },
  {
    id: "rules",
    label: "Rules",
    // Funnel: reads as filtering/gating, and stays centred and legible at
    // 18px. The previous bracket-plus-check path was visibly off-centre.
    icon: <path d="M21 4H3l7.2 8.46V19l3.6 2v-8.54L21 4z" />,
  },
  {
    id: "help",
    label: "Help",
    icon: (
      <>
        <circle cx="12" cy="12" r="9.25" />
        <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.4-2.6 4" />
        <line x1="12" y1="17.2" x2="12" y2="17.3" />
      </>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.3-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.1a2 2 0 1 1 0 4z" />
      </>
    ),
  },
];

export function Sidebar({
  page,
  onNavigate,
  collapsed,
  running,
}: SidebarProps) {
  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-line bg-surface/70 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        collapsed ? "w-[4.5rem]" : "w-60"
      }`}
    >
      {/* Brand block: collapses to the mark only */}
      <div
        className={`flex h-16 items-center gap-3 border-b border-line ${
          collapsed ? "justify-center px-0" : "px-5"
        }`}
      >
        <Logo size={collapsed ? 26 : 30} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-display text-lg leading-none">
              HyperClicker
            </div>
            <div className="mt-1 font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-faint">
              v0.1
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {ITEMS.map((item) => {
            const active = page === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-surface-sunk hover:text-ink"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  {/* Active rail */}
                  <span
                    aria-hidden
                    className={`absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity duration-200 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-[18px] shrink-0"
                    aria-hidden
                  >
                    {item.icon}
                  </svg>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Status footer */}
      <div
        className={`border-t border-line py-3 ${
          collapsed ? "px-3" : "px-5"
        }`}
      >
        {collapsed ? (
          <div className="flex justify-center">
            <EngineDot running={running} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <EngineDot running={running} />
            <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-faint">
              {page}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

function EngineDot({ running }: { running: boolean }) {
  return (
    <span className="relative flex size-2" aria-hidden>
      {running ? (
        <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-70" />
      ) : null}
      <span
        className={`relative inline-flex size-2 rounded-full ${
          running ? "bg-good" : "bg-line-strong"
        }`}
      />
    </span>
  );
}