import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

import {
  checkForUpdate,
  formatBytes,
  renderNotes,
  RELEASES_URL,
  type UpdateCheck,
} from "../lib/releases";
import { isDesktop } from "../lib/api";

const FALLBACK_VERSION = "0.1.0";

export function Updates() {
  const [version, setVersion] = useState(FALLBACK_VERSION);
  const [check, setCheck] = useState<UpdateCheck>({
    status: "idle",
    latest: null,
    installer: null,
  });

  const runCheck = useCallback(async () => {
    setCheck({ status: "checking", latest: null, installer: null });
    const result = await checkForUpdate(version);
    setCheck(result);
  }, [version]);

  useEffect(() => {
    if (!isDesktop()) return;
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(FALLBACK_VERSION));
  }, []);

  // Check once on mount, without shouting about it if it fails.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runCheck();
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [runCheck]);

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label">Updates</h2>
        <span className="font-mono text-[0.6875rem] text-faint">
          installed v{version}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runCheck}
          disabled={check.status === "checking"}
          className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent/50 hover:bg-accent-soft disabled:opacity-50"
        >
          {check.status === "checking" ? "Checking…" : "Check for updates"}
        </button>

        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          All releases on GitHub
        </a>
      </div>

      {check.status === "up-to-date" && check.latest ? (
        <p className="mt-4 rounded-lg bg-good-soft px-3.5 py-3 text-xs text-good">
          You are on the latest release ({check.latest.tag}).
        </p>
      ) : null}

      {check.status === "available" && check.latest ? (
        <div className="mt-4">
          <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-accent">
                {check.latest.name || check.latest.tag} is available
              </span>
              <span className="font-mono text-[0.6875rem] text-muted">
                {check.latest.publishedAt.slice(0, 10)}
              </span>
            </div>

            {check.installer ? (
              <a
                href={check.installer.browserDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                Download {check.installer.name}
                <span className="font-mono text-[0.6875rem] opacity-80">
                  {formatBytes(check.installer.size)}
                </span>
              </a>
            ) : (
              <p className="mt-3 text-xs text-muted">
                No installer attached to this release yet.
              </p>
            )}

            <a
              href={check.latest.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block text-xs text-muted underline underline-offset-2 hover:text-ink"
            >
              View release notes on GitHub
            </a>
          </div>

          {check.latest.body ? (
            <div
              className="release-notes mt-4 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-muted [&_h3]:text-ink [&_strong]:text-ink [&_code]:text-ink-soft"
              dangerouslySetInnerHTML={{
                __html: renderNotes(check.latest.body),
              }}
            />
          ) : null}
        </div>
      ) : null}

      {check.status === "error" ? (
        <p className="mt-4 rounded-lg bg-warn-soft px-3.5 py-3 text-xs text-warn">
          Could not reach GitHub: {check.error}. Release notes are also kept in
          CHANGELOG.md in the repository.
        </p>
      ) : null}
    </section>
  );
}