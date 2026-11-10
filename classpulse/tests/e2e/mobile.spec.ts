import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

test("mobile navigation and quick log work on a phone", async ({ page }) => {
  await openApp(page, "/dashboard");
  const nav = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(nav).toBeVisible();
  // The page must fit the phone: no zoom-out and no horizontal scroll, on every main screen.
  const device = page.viewportSize()!.width;
  for (const p of ["/dashboard", "/classroom", "/students", "/attendance", "/behavior", "/interventions", "/groups", "/communication", "/reports", "/settings"]) {
    await page.goto(p);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { inner, scroll } = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(inner, p).toBe(device);
    expect(scroll, p).toBeLessThanOrEqual(device);
  }
  await page.goto("/dashboard");

  await nav.getByRole("button", { name: "Quick log" }).click();
  const dialog = page.getByRole("dialog", { name: "Quick log" });
  await dialog.getByRole("list", { name: "Students" }).getByRole("button").first().click();
  await dialog.getByRole("button", { name: "Helped another student" }).click();
  await expect(page.getByText(/Helped another student ·/)).toBeVisible();

  await nav.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Reports & Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Reports & Analytics" })).toBeVisible();

  await nav.getByRole("link", { name: "Students" }).click();
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
});

test("live seating chart is usable on a phone", async ({ page }) => {
  await openApp(page, "/classroom");
  await page.getByRole("link", { name: "Biology" }).first().click();
  const seat = page.getByRole("grid").locator("button[title]").first();
  await seat.scrollIntoViewIfNeeded();
  await seat.click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Followed directions" })).toBeVisible();
});
