"use client";

import { useEffect, useState } from "react";

import { Reveal } from "./Reveal";

const REPO = "HBAABA119/Hyper-Clicker";
const API = `https://api.github.com/repos/${REPO}`;

interface Asset {
  name: string;
  url: string;
  size: number;
}

interface Release {
  tag: string;
  name: string | null;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  assets: Asset[];
}

type State =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; release: Release; installer: Asset | null }
  | { status: "error"; message: string };

const INSTALLER_PATTERNS = [/-setup\.exe$/i, /\.msi$/i, /\.exe$/i];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

/** Minimal Markdown rendering, enough for release notes. */
function renderNotes(markdown: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const inline = (value: string) =>
    escape(value)
      .replace(/`([^`]+)`/g, '<code class="font-mono text-[0.8125em]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  const out: string[] = [];
  let items: string[] = [];

  const flush = () => {
    if (items.length) {
      out.push(`<ul class="ml-5 list-disc space-y-1.5">${items.join("")}</ul>`);
      items = [];
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);

    if (bullet) {
      items.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (heading) {
      out.push(
        `<h3 class="mt-5 font-display text-lg tracking-tight first:mt-0">${inline(
          heading[2],
        )}</h3>`,
      );
      continue;
    }
    out.push(`<p class="mt-2">${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}

export function Download() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${API}/releases/latest`, {
          headers: { Accept: "application/vnd.github+json" },
        });

        if (cancelled) return;

        if (response.status === 404) {
          setState({ status: "none" });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: `GitHub returned ${response.status}`,
          });
          return;
        }

        const data = await response.json();
        const assets: Asset[] = (data.assets ?? []).map(
          (a: { name: string; browser_download_url: string; size: number }) => ({
            name: a.name,
            url: a.browser_download_url,
            size: a.size,
          }),
        );

        let installer: Asset | null = null;
        for (const pattern of INSTALLER_PATTERNS) {
          installer = assets.find((a) => pattern.test(a.name)) ?? null;
          if (installer) break;
        }

        setState({
          status: "ready",
          release: {
            tag: data.tag_name,
            name: data.name,
            body: data.body ?? "",
            htmlUrl: data.html_url,
            publishedAt: data.published_at,
            assets,
          },
          installer,
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Network error",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="download" className="scroll-mt-20 border-t border-line py-16 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <Reveal>
          <p className="eyebrow">Download</p>
          <h2 className="mt-5 max-w-3xl text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            Always the{" "}
            <em className="font-display italic text-accent">latest build</em>.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            This page reads the newest published release straight from GitHub, so
            the button below is never stale.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-surface">
            {state.status === "loading" ? (
              <div className="px-6 py-12 text-center text-sm text-faint">
                Checking GitHub Releases…
              </div>
            ) : null}

            {state.status === "none" ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted">
                  No published release yet.
                </p>
                <a
                  href={`https://github.com/${REPO}/releases`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm text-accent underline underline-offset-2"
                >
                  Follow the repository for the first one
                </a>
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-warn">
                  Could not reach GitHub: {state.message}
                </p>
                <a
                  href={`https://github.com/${REPO}/releases`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm text-accent underline underline-offset-2"
                >
                  Open the releases page instead
                </a>
              </div>
            ) : null}

            {state.status === "ready" ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-5">
                  <div>
                    <div className="font-mono text-sm">
                      {state.release.tag}
                    </div>
                    <div className="mt-0.5 text-xs text-faint">
                      published {state.release.publishedAt.slice(0, 10)}
                    </div>
                  </div>

                  {state.installer ? (
                    <a
                      href={state.installer.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary"
                    >
                      Download {state.installer.name}
                      <span className="font-mono text-[0.6875rem] opacity-70">
                        {formatBytes(state.installer.size)}
                      </span>
                    </a>
                  ) : null}
                </div>

                {state.release.body ? (
                  <div
                    className="max-h-96 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-muted [&_h3]:text-ink [&_strong]:text-ink [&_code]:text-ink-soft [&_li]:mt-1"
                    dangerouslySetInnerHTML={{
                      __html: renderNotes(state.release.body),
                    }}
                  />
                ) : null}

                <div className="flex flex-wrap items-center gap-4 border-t border-line px-6 py-4">
                  {state.release.assets.length > 1 ? (
                    <div className="flex flex-wrap gap-3">
                      {state.release.assets
                        .filter((a) => a !== state.installer)
                        .map((asset) => (
                          <a
                            key={asset.name}
                            href={asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[0.6875rem] text-muted underline underline-offset-2 hover:text-ink"
                          >
                            {asset.name}
                          </a>
                        ))}
                    </div>
                  ) : null}
                  <a
                    href={state.release.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs text-muted underline underline-offset-2 hover:text-ink"
                  >
                    View on GitHub
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}