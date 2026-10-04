import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the site ships as plain files and can be hosted on any
  // static host (or opened straight from disk).
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  turbopack: {
    // The desktop app sits one directory up and has its own lockfile. Pin the
    // root so Next does not infer the parent as the workspace root.
    root: here,
  },
};

export default nextConfig;