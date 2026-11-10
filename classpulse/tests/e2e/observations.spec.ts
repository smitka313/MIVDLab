import { expect, test } from "./fixtures";
import { openApp, reload } from "./helpers";

test("select a student in live mode, record an observation, and find it after refresh on their profile", async ({ page }) => {
  await openApp(page, "/classroom");
  await page.getByRole("link", { name: "Intro to Engineering Design" }).click();
  const seat = page.getByRole("grid").locator("button[title]").first();
  const name = (await seat.getAttribute("title"))!;
  await seat.click(); // select student
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Demonstrated persistence" }).click(); // one click logs it
  await expect(page.getByText(`Demonstrated persistence · ${name}`)).toBeVisible();

  await reload(page);
  // seat shows today's tally
  await expect(page.getByRole("grid").locator(`button[title="${name}"]`)).toHaveAttribute("aria-label", /1 positive/);

  await page.goto("/students");
  await page.getByPlaceholder("Search name or ID").fill(name.split(" ")[0]);
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await page.getByRole("tab", { name: "Behavior & Engagement" }).click();
  await expect(page.getByText("Demonstrated persistence").first()).toBeVisible();
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Demonstrated persistence").first()).toBeVisible();
});

test("undo removes an accidental observation", async ({ page }) => {
  await openApp(page, "/classroom");
  await page.getByRole("link", { name: "AP Biology" }).click();
  const seat = page.getByRole("grid").locator("button[title]").first();
  const name = (await seat.getAttribute("title"))!;
  await seat.click();
  await page.getByRole("dialog").getByRole("tab", { name: "Redirection" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Phone use" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Undone")).toBeVisible();
  await reload(page);
  await expect(page.getByRole("grid").locator(`button[title="${name}"]`)).not.toHaveAttribute("aria-label", /1 redirection/);
});

test("quick log from anywhere with the keyboard shortcut", async ({ page }) => {
  await openApp(page, "/dashboard");
  await page.keyboard.press("l");
  const dialog = page.getByRole("dialog", { name: "Quick log" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("list", { name: "Students" }).getByRole("button").first().click();
  await dialog.getByRole("tab", { name: "Engagement" }).click();
  await dialog.getByRole("button", { name: "Asked a meaningful question" }).click();
  await expect(page.getByText(/Asked a meaningful question ·/)).toBeVisible();
  await page.goto("/behavior");
  await expect(page.getByText("Asked a meaningful question").first()).toBeVisible();
});

test("correct an observation and see its change history", async ({ page }) => {
  await openApp(page, "/behavior");
  const first = page.locator("main ul.divide-y > li").first();
  await first.getByRole("button", { name: "Observation options" }).click();
  await page.getByRole("menuitem", { name: "Correct…" }).click();
  const dialog = page.getByRole("dialog", { name: "Correct observation" });
  await dialog.getByLabel("Teacher note").fill("Corrected: happened during the lab, not the lecture.");
  await dialog.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Observation updated")).toBeVisible();
  await page.getByText("Corrected: happened during the lab").first().locator("xpath=ancestor::li[1]").getByRole("button", { name: "View change history" }).click();
  const history = page.getByRole("dialog", { name: "Change history" });
  await expect(history.getByText("Edited")).toBeVisible();
  await expect(history.getByText(/note:/)).toBeVisible();
});
