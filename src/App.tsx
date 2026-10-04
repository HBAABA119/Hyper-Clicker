import { useEffect, useState } from "react";

import { Sidebar, type PageId } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { Dashboard } from "./pages/Dashboard";
import { Help } from "./pages/Help";
import { Rules } from "./pages/Rules";
import { Settings } from "./pages/Settings";
import { EngineProvider, useEngine } from "./lib/store";

/** Below this width the sidebar collapses to an icon rail automatically. */
const AUTO_COLLAPSE_BELOW = 1080;

function Shell() {
  const engine = useEngine();
  const [page, setPage] = useState<PageId>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  // Keep the layout usable in a narrow window without the user having to do
  // anything. A manual toggle wins until the window is resized again.
  useEffect(() => {
    const apply = () => {
      if (manualOverride) return;
      setCollapsed(window.innerWidth < AUTO_COLLAPSE_BELOW);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [manualOverride]);

  const toggleSidebar = () => {
    setManualOverride(true);
    setCollapsed((prev) => !prev);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-paper text-ink">
      <TitleBar
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        running={engine.running}
        onToggleEngine={engine.toggleEngine}
      />

      {!engine.desktop ? (
        <div className="shrink-0 bg-warn-soft px-5 py-2 text-xs text-warn">
          Running outside the desktop shell. Start the app with{" "}
          <code className="font-mono">pnpm tauri dev</code> to drive the engine.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          page={page}
          onNavigate={setPage}
          collapsed={collapsed}
          running={engine.running}
        />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-5 md:p-6">
            {!engine.ready ? (
              <div className="grid place-items-center py-24 text-sm text-faint">
                Loading…
              </div>
            ) : (
              <div key={page} className="animate-[page-in_320ms_cubic-bezier(0.16,1,0.3,1)]">
                {page === "dashboard" ? <Dashboard /> : null}
                {page === "rules" ? <Rules /> : null}
                {page === "settings" ? <Settings /> : null}
                {page === "help" ? <Help /> : null}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <EngineProvider>
      <Shell />
    </EngineProvider>
  );
}