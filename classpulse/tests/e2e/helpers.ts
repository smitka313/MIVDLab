import { expect, type Page } from "@playwright/test";

/** Open the app (demo mode) and wait for the shell. */
export async function openApp(page: Page, path = "/dashboard") {
  await page.goto(path);
  await expect(page.getByText("Demo mode — fictional students")).toBeVisible();
}

export async function reload(page: Page) {
  await page.reload();
  await expect(page.getByText("Demo mode — fictional students")).toBeVisible();
}
