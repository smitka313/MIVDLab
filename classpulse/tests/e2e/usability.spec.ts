import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "./fixtures";
import { openApp, reload } from "./helpers";

async function openClass(page: import("@playwright/test").Page, name: string) {
  await openApp(page, "/classroom");
  await page.getByRole("link", { name, exact: true }).first().click();
  await expect(page.getByRole("grid")).toBeVisible();
}

test("select several students and log for all of them, then undo from Today's log", async ({ page }) => {
  await openClass(page, "Intro to Engineering Design");
  await page.getByRole("radio", { name: "Select several" }).click();
  const seats = page.getByRole("grid").locator("button[title]");
  await seats.nth(0).click();
  await seats.nth(1).click();
  await expect(page.getByText("2 students selected")).toBeVisible();
  await page.getByRole("button", { name: "Log for 2 selected" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Strong collaboration" }).click();
  await expect(page.getByText("Strong collaboration · 2 students")).toBeVisible();
  const log = page.getByRole("complementary", { name: "Today's log" });
  await expect(log.getByRole("listitem")).toHaveCount(2);
  await log.getByRole("button", { name: /^Undo Strong collaboration/ }).first().click();
  await expect(log.getByRole("listitem")).toHaveCount(1);
  await reload(page);
  await expect(page.getByRole("complementary", { name: "Today's log" }).getByRole("listitem")).toHaveCount(1);
});

test("select everyone at a lab bench in one tap", async ({ page }) => {
  await openClass(page, "STEM Research Lab");
  await page.getByRole("radio", { name: "Select several" }).click();
  await page.getByRole("button", { name: "Select everyone at this lab bench" }).first().click();
  await expect(page.getByText(/[1-9]\d* students? selected/)).toBeVisible();
});

test("tap seats to take attendance, then mark everyone else present", async ({ page }) => {
  await openClass(page, "AP Biology");
  await page.getByRole("radio", { name: "Attendance" }).click();
  const seat = page.getByRole("grid").locator("button[title]").first();
  await seat.click();
  await expect(seat).toHaveAttribute("aria-label", /Absent/);
  await seat.click();
  await expect(seat).toHaveAttribute("aria-label", /Tardy/);
  await page.getByRole("button", { name: "Mark everyone else present" }).click();
  const status = page.getByText(/^\d+\/\d+ marked$/);
  await expect(status).toHaveText(/^(\d+)\/\1 marked$/);
  await expect(seat).toHaveAttribute("aria-label", /Tardy/); // exceptions kept
});

test("display options: first names only and larger seats", async ({ page }) => {
  await openClass(page, "Biology");
  const seat = page.getByRole("grid").locator("button[title]").first();
  const full = (await seat.getAttribute("title"))!;
  await page.getByRole("button", { name: "Display options" }).click();
  await page.getByRole("switch", { name: "First names only" }).click();
  await page.getByRole("radio", { name: "large" }).click();
  await page.keyboard.press("Escape");
  await expect(seat).not.toContainText(/ [A-Z]\.$/);
  await expect(seat).toContainText(full.split(" ")[0]);
  await reload(page); // remembered on this device
  await expect(page.getByRole("grid").locator("button[title]").first()).not.toContainText(/ [A-Z]\.$/);
});

test("students not yet recognized this week are marked", async ({ page }) => {
  await openClass(page, "Biology");
  await expect(page.getByText(/no positive or engagement observation yet this week/)).toBeVisible();
  const flagged = page.getByRole("grid").locator('button[aria-label*="not yet recognized this week"]').first();
  const name = (await flagged.getAttribute("title"))!;
  await flagged.click();
  await page.getByRole("dialog").getByRole("button", { name: "Helped another student" }).click();
  await expect(page.getByRole("grid").locator(`button[title="${name}"]`)).not.toHaveAttribute("aria-label", /not yet recognized/);
});

test("search with Ctrl+K jumps to a student", async ({ page }) => {
  await openApp(page, "/dashboard");
  await page.goto("/students");
  const first = page.locator("tbody a").first();
  const name = (await first.innerText()).split("\n")[0].trim();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search students, classes and pages" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("sub");
  await page.getByRole("option", { name: /Substitute packet/ }).click();
  await expect(page.getByRole("heading", { name: "Substitute packet" })).toBeVisible();
});

test("substitute packet: per-class instructions save, and only shared notes appear", async ({ page }) => {
  await openApp(page, "/classroom/sub-packet");
  const sections = page.locator("main section[aria-label]");
  await expect(sections).toHaveCount(6);
  const p1 = page.getByRole("region", { name: "P1 · Biology" });
  await p1.getByLabel(/Substitute instructions/).fill("Warm-up is on the board. Seat 4 can show you the lab cabinet.");
  await p1.getByLabel(/Substitute instructions/).blur();
  await expect(page.getByText("Instructions saved")).toBeVisible();
  await reload(page);
  await expect(page.getByRole("region", { name: "P1 · Biology" }).getByLabel(/Substitute instructions/)).toHaveValue(/Warm-up is on the board/);
  await expect(page.getByText("Seemed unwell", { exact: false })).toHaveCount(0); // private notes stay private
  await page.getByRole("checkbox").first().uncheck();
  await expect(sections).toHaveCount(5);
});

test("note phrases insert with one tap, and a note can go in the sub packet", async ({ page }) => {
  await openClass(page, "Biology");
  await page.getByRole("grid").locator("button[title]").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Add note" }).click();
  await dialog.getByRole("button", { name: "Checked in about missing work." }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue("Checked in about missing work.");
  await expect(dialog.getByText(/Win/)).toBeVisible(); // dictation tip
  await dialog.getByLabel("Include in substitute packet").check();
  await dialog.getByRole("button", { name: "Save note" }).click();
  await page.goto("/classroom/sub-packet");
  await expect(page.getByRole("region", { name: "P1 · Biology" })).toContainText("Checked in about missing work.");
});

test("Schoology export imports with grades from graduation year", async ({ page }) => {
  await openApp(page, "/students/import");
  const file = path.join(os.tmpdir(), `schoology-${Date.now()}.csv`);
  const y = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  fs.writeFileSync(file, `Name First,Name Last,Unique User ID,Grad Year,Quiz 1 (10)\nPoints Possible,,,,10\nSkyler,Schoology,SG-1,${y + 1},9\n`);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("Looks like a Schoology export")).toBeVisible();
  await page.getByRole("button", { name: "Review rows" }).click();
  const row = page.locator("tbody tr");
  await expect(row).toHaveCount(1); // "Points Possible" row skipped
  await expect(row.first()).toContainText("Skyler Schoology");
  await expect(row.first()).toContainText("11");
  await expect(row.first()).toContainText("SG-1");
});

test("the period switcher follows the bell schedule unless picked by hand", async ({ page }) => {
  // A Tuesday at 10:00 local time: Period 3 (9:47–10:42) is in session.
  await page.clock.install({ time: new Date(2026, 10, 10, 10, 0, 0) });
  await openApp(page, "/dashboard");
  const sw = page.getByLabel("Current class period");
  await expect(sw.locator("option:checked")).toHaveText(/P3 · Intro to Engineering Design \(now\)/);
  await sw.selectOption({ label: "P1 · Biology" });
  await reload(page);
  await expect(page.getByLabel("Current class period").locator("option:checked")).toHaveText("P1 · Biology");
  // An hour later Period 5 is in session, and the manual pick has expired.
  await page.clock.setFixedTime(new Date(2026, 10, 10, 12, 30, 0));
  await reload(page);
  await expect(page.getByLabel("Current class period").locator("option:checked")).toHaveText(/P5 · Principles of Engineering \(now\)/);
});

test("PowerSchool multi-section export sorts students into classes", async ({ page }) => {
  await openApp(page, "/students/import");
  const file = path.join(os.tmpdir(), `powerschool-${Date.now()}.csv`);
  fs.writeFileSync(
    file,
    [
      "Students.ID,Students.Student_Number,Students.First_Name,Students.Last_Name,Students.Grade_Level,Students.Enroll_Status,Students.DOB,Course_Name,Section_Number,Expression",
      "9901,PS-1,Parker,Powers,10,0,2010-01-01,Biology,2,1(A)",
      "9902,PS-2,Quinn,Powers,11,0,2009-01-01,Forensic Science,5,7(A)",
      "9901,PS-1,Parker,Powers,10,0,2010-01-01,Forensic Science,5,7(A)",
      "9903,PS-3,Reese,Powers,12,2,2008-01-01,Forensic Science,5,7(A)",
    ].join("\n"),
  );
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("Looks like a PowerSchool export")).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "sensitive columns" })).toContainText("Students.DOB");
  await page.getByRole("button", { name: "Review rows" }).click();
  // Period 1 Biology already exists in the demo; Forensic Science P7 doesn't.
  await expect(page.getByLabel("Class for Biology · period 1 · section 2")).toHaveValue(/.+/);
  await expect(page.getByLabel("Class for Biology · period 1 · section 2").locator("option:checked")).toHaveText("Add to P1 · Biology");
  await expect(page.getByLabel("Class for Forensic Science · period 7 · section 5").locator("option:checked")).toHaveText(/Create new class: Forensic Science \(P7\)/);
  await expect(page.getByText(/Not currently enrolled \(transferred out\)/)).toBeVisible();
  await page.getByRole("button", { name: /Import 2 students/ }).click();
  await expect(page.getByText("2 new students created")).toBeVisible();
  await expect(page.getByText("1 class created")).toBeVisible();
  await page.goto("/classroom");
  await page.getByRole("link", { name: "Forensic Science" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.getByRole("link", { name: "Quinn Powers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Parker Powers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reese Powers" })).toHaveCount(0);
});
