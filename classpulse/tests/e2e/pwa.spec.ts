import { BASE, expect, test } from "./fixtures";

test("ClassPulse is installable: manifest, icons and service worker", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "ClassPulse", short_name: "ClassPulse", display: "standalone", start_url: `${BASE}/dashboard/`, theme_color: "#001a40" });
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  for (const i of m.icons) expect((await request.get(i.src.slice(BASE.length))).ok(), i.src).toBe(true);
  expect((await request.get("/apple-touch-icon.png")).ok()).toBe(true);

  await page.goto("/dashboard");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", `${BASE}/manifest.webmanifest`);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(`${BASE}/`);
});

test("the installed app shell opens offline, and never caches other origins", async ({ page, context }) => {
  await page.goto("/dashboard");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker; this navigation is cached
  await expect(page.getByText("Demo mode — fictional students")).toBeVisible();
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return { urls, origin: location.origin };
  });
  expect(cached.urls.length).toBeGreaterThan(0);
  expect(cached.urls.every((u) => u.startsWith(cached.origin))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Demo mode — fictional students")).toBeVisible();
  await page.goto("/never-visited-page");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
