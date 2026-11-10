import fs from "node:fs";
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

test.use({ localMode: null });

async function startMyClassroom(page: Page) {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "My classroom" })).toBeVisible();
  await page.getByRole("button", { name: "Start my classroom" }).click();
  await expect(page.getByText("Welcome to ClassPulse")).toBeVisible();
}

async function addClassWithStudent(page: Page, course: string, first: string, last: string) {
  await page.goto("/classroom");
  await page.getByRole("button", { name: "New class" }).first().click();
  await page.getByRole("dialog").getByLabel("Course name").fill(course);
  await page.getByRole("dialog").getByLabel("Period").fill("2");
  await page.getByRole("dialog").getByRole("button", { name: "Create class" }).click();
  await page.getByRole("link", { name: course }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.getByRole("button", { name: "New student" }).click();
  await page.getByRole("dialog").getByLabel("First name").fill(first);
  await page.getByRole("dialog").getByLabel("Last name").fill(last);
  await page.getByRole("dialog").getByRole("button", { name: "Add student" }).click();
  await expect(page.getByRole("link", { name: `${first} ${last}` })).toBeVisible();
}

test("My classroom starts empty, saves on this device, and stays separate from the demo", async ({ page }) => {
  await startMyClassroom(page);
  await expect(page.getByText("Demo mode — fictional students")).toHaveCount(0);
  await page.goto("/students");
  await expect(page.getByText("No students yet")).toBeVisible();

  await addClassWithStudent(page, "Chemistry", "Robin", "Personal");
  await page.reload();
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.getByRole("link", { name: "Robin Personal" })).toBeVisible();

  // Switch to the demo: fictional data, none of ours.
  await page.goto("/settings#data");
  await page.getByRole("button", { name: "Switch to the demo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Switch" }).click();
  await expect(page.getByText("Demo mode — fictional students")).toBeVisible();
  await page.goto("/students");
  await page.getByPlaceholder("Search name or ID").fill("Personal");
  await expect(page.getByText("No students match these filters.")).toBeVisible();

  // And back: our records are untouched.
  await page.goto("/settings#data");
  await page.getByRole("button", { name: "Switch to My classroom" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Switch" }).click();
  await page.goto("/students");
  await expect(page.getByRole("link", { name: "Robin Personal" })).toBeVisible();
});

test("encrypted backup restores on a fresh device", async ({ page, browser }) => {
  await startMyClassroom(page);
  await addClassWithStudent(page, "Physics", "Jamie", "Backup");

  // The reminder appears once there are records and no backup.
  await expect(page.getByText("You haven't made a backup yet.")).toBeVisible();
  await page.getByRole("link", { name: "Back up now" }).click();
  await page.getByLabel("Passphrase", { exact: true }).fill("purple-otter-42");
  await page.getByLabel("Repeat passphrase").fill("purple-otter-42");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^classpulse-backup-\d{4}-\d{2}-\d{2}-encrypted\.json$/);
  const file = await download.path();
  const text = fs.readFileSync(file!, "utf8");
  expect(JSON.parse(text)).toMatchObject({ format: "classpulse-backup", encrypted: true });
  expect(text).not.toContain("Jamie");
  await expect(page.getByText("You haven't made a backup yet.")).toHaveCount(0);

  // A different, empty browser profile = a new device.
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await fresh.goto(page.url().replace(/\/settings\/.*$/, "/dashboard/"));
  await fresh.getByRole("button", { name: /Restore from a backup file/ }).click();
  await fresh.getByLabel("Backup file").setInputFiles(file!);
  await fresh.getByLabel("Backup passphrase").fill("wrong-passphrase");
  await fresh.getByRole("button", { name: "Unlock" }).click();
  await expect(fresh.getByRole("alert").filter({ hasText: "passphrase" })).toContainText("doesn't open this backup");
  await fresh.getByLabel("Backup passphrase").fill("purple-otter-42");
  await fresh.getByRole("button", { name: "Unlock" }).click();
  await expect(fresh.getByText(/1 classes, 1 students/)).toBeVisible();
  await fresh.getByRole("button", { name: "Restore this backup" }).click();
  await expect(fresh.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await fresh.goto(fresh.url().replace(/\/dashboard\/.*$/, "/students/"));
  await expect(fresh.getByRole("link", { name: "Jamie Backup" })).toBeVisible();
  await ctx.close();
});

test("only one tab can edit the on-device records at a time", async ({ page, context }) => {
  await startMyClassroom(page);
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByRole("heading", { name: "ClassPulse is open in another tab" })).toBeVisible({ timeout: 15000 });
  await page.close();
  await second.getByRole("button", { name: "Try again" }).click();
  await expect(second.getByText("Welcome to ClassPulse")).toBeVisible();
});
