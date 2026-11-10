import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
// Test the static export exactly as GitHub Pages serves it: under /<repo>/.
const BASE = (process.env.E2E_BASE_PATH ?? "/classpulse").replace(/\/+$/, "");

/**
 * End-to-end tests build the static export in DEMO MODE (no Supabase env) with a
 * base path, then serve ./out like GitHub Pages. Every browser context starts
 * with a fresh fictional demo classroom.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" }, // paths get BASE via tests/e2e/fixtures.ts
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? `node scripts/serve-static.mjs ${PORT}` : `npx next build && node scripts/serve-static.mjs ${PORT}`,
    url: `http://localhost:${PORT}${BASE}/`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NEXT_PUBLIC_BASE_PATH: BASE },
  },
});
