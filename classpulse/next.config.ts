import type { NextConfig } from "next";

/**
 * ClassPulse builds to plain static files (`out/`), so it can be hosted on
 * GitHub Pages, Vercel, Netlify, Cloudflare Pages or any web server.
 * All data access happens in the browser and is authorized by Supabase
 * row-level security, so no application server is needed.
 *
 * NEXT_PUBLIC_BASE_PATH: set to "/<repo>" for a GitHub Pages project site
 * (https://<user>.github.io/<repo>/). Leave empty for a root domain.
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
