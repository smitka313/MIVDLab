import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ClassPulse renders classroom data on the client after sign-in (all access is
  // authorized by Supabase row-level security), so Cache Components / partial
  // prefetching are not used.
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
