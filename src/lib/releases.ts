const REPO = "HBAABA119/Hyper-Clicker";
const API = `https://api.github.com/repos/${REPO}`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

export interface ReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

export interface Release {
  tag: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = RELEASES_PAGE;
export const LATEST_RELEASE_URL = `${API}/releases/latest`;

/** Installer assets, most preferred first. */
const INSTALLER_PATTERNS = [
  /-setup\.exe$/i, // NSIS
  /\.msi$/i,
  /\.exe$/i,
];

export function pickInstaller(assets: ReleaseAsset[]): ReleaseAsset | null {
  for (const pattern of INSTALLER_PATTERNS) {
    const found = assets.find((asset) => pattern.test(asset.name));
    if (found) return found;
  }
  return null;
}

/** Compare dotted version strings. Returns >0 when `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/, "")
      .split(/[.-]/)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : 0));

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l - r;
  }
  return 0;
}

export interface UpdateCheck {
  status: "idle" | "checking" | "up-to-date" | "available" | "error";
  latest: Release | null;
  installer: ReleaseAsset | null;
  error?: string;
}

/**
 * Ask GitHub for the newest published release.
 *
 * This reads the public Releases API, so it works with no signing key and no
 * extra Rust dependency. Binary auto-install is handled by the release
 * workflow; see README for enabling signed in-app updates.
 */
export async function checkForUpdate(
  currentVersion: string,
): Promise<UpdateCheck> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (response.status === 404) {
      return { status: "error", latest: null, installer: null, error: "No releases published yet." };
    }
    if (!response.ok) {
      return {
        status: "error",
        latest: null,
        installer: null,
        error: `GitHub returned ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      tag_name: string;
      name: string | null;
      body: string | null;
      html_url: string;
      published_at: string;
      prerelease: boolean;
      assets: { name: string; browser_download_url: string; size: number }[];
    };

    const latest: Release = {
      tag: data.tag_name,
      name: data.name ?? data.tag_name,
      body: data.body ?? "",
      htmlUrl: data.html_url,
      publishedAt: data.published_at,
      prerelease: data.prerelease,
      assets: data.assets.map((asset) => ({
        name: asset.name,
        browserDownloadUrl: asset.browser_download_url,
        size: asset.size,
      })),
    };

    const newer = compareVersions(latest.tag, currentVersion) > 0;
    return {
      status: newer ? "available" : "up-to-date",
      latest,
      installer: pickInstaller(latest.assets),
    };
  } catch (err) {
    return {
      status: "error",
      latest: null,
      installer: null,
      error: err instanceof Error ? err.message : "Network request failed",
    };
  }
}

/** Minimal, dependency-free Markdown-ish renderer for release notes. */
export function renderNotes(markdown: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const inline = (value: string) =>
    escape(value)
      .replace(/`([^`]+)`/g, '<code class="font-mono text-[0.8125em]">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-accent underline underline-offset-2">$1</a>',
      );

  const blocks: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(`<ul class="ml-4 list-disc space-y-1">${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);

    if (bullet) {
      listItems.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    flushList();

    if (!line.trim()) continue;
    if (heading) {
      blocks.push(
        `<h3 class="mt-4 font-display text-lg tracking-tight first:mt-0">${inline(
          heading[2],
        )}</h3>`,
      );
      continue;
    }
    blocks.push(`<p>${inline(line)}</p>`);
  }

  flushList();
  return blocks.join("");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}