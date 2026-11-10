import { test as base, expect } from "@playwright/test";

/** Sub-path the static build is served under (same as GitHub Pages: /<repo>/). */
export const BASE = (process.env.E2E_BASE_PATH ?? "/classpulse").replace(/\/+$/, "");

/** Tests write app paths ("/dashboard"); these fixtures add the base path. */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = (url, opts) => goto(url.startsWith("/") ? BASE + url : url, opts);
    await provide(page);
  },
  request: async ({ request }, provide) => {
    const get = request.get.bind(request);
    request.get = (url, opts) => get(typeof url === "string" && url.startsWith("/") ? BASE + url : url, opts);
    await provide(request);
  },
});

export { expect };
