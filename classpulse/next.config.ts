import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ClassPulse renders classroom data on the client after sign-in (all access is
  // authorized by Supabase row-level security), so Cache Components / partial
  // prefetching are not used.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The service worker must always be re-fetched so updates roll out promptly.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
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
