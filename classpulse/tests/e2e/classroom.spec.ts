import { expect, test } from "./fixtures";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { openApp, reload } from "./helpers";

test("create a class and import a roster from CSV", async ({ page }) => {
  await openApp(page, "/classroom");
  await page.getByRole("button", { name: "New class" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Course name").fill("Chemistry");
  await dialog.getByLabel("Period").fill("7");
  await dialog.getByLabel("Room").fill("301");
  await dialog.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("link", { name: "Chemistry" })).toBeVisible();

  await page.getByRole("link", { name: "Chemistry" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.getByRole("link", { name: "Import CSV" }).click();

  const file = path.join(os.tmpdir(), `roster-${Date.now()}.csv`);
  fs.writeFileSync(file, "Student ID,First Name,Last Name,Grade\n9001,Quinn,Example,11\n9002,Rory,Sample,12\n9002,Rory,Sample,12\n9003,,Missing,10\n");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("4 rows found")).toBeVisible();
  await page.getByRole("button", { name: "Review rows" }).click();
  await expect(page.getByText("2 new")).toBeVisible();
  await expect(page.getByText("Missing first name")).toBeVisible();
  await expect(page.getByText("Duplicate row in file")).toBeVisible();
  await page.getByRole("button", { name: /Import 2 students/ }).click();
  await expect(page.getByText("2 new students created")).toBeVisible();
  await expect(page.getByText("2 class enrollments added")).toBeVisible();

  await page.goto("/classroom");
  await page.getByRole("link", { name: "Chemistry" }).click();
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.getByRole("link", { name: "Quinn Example" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rory Sample" })).toBeVisible();
});

test("malformed CSV files are rejected with a clear message", async ({ page }) => {
  await openApp(page, "/students/import");
  const file = path.join(os.tmpdir(), `bad-${Date.now()}.csv`);
  fs.writeFileSync(file, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x14, 0x00]));
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole("alert").filter({ hasText: "couldn" })).toContainText("doesn't look like a text CSV");
  const empty = path.join(os.tmpdir(), `empty-${Date.now()}.csv`);
  fs.writeFileSync(empty, "");
  await page.locator('input[type="file"]').setInputFiles(empty);
  await expect(page.getByRole("alert").filter({ hasText: "couldn" })).toContainText("empty");
  // Nothing was imported
  await page.goto("/students");
  await expect(page.getByText(/^142 students/)).toBeVisible(); // unchanged demo count
});

test("create a seating chart, seat a student, and it persists", async ({ page }) => {
  await openApp(page, "/classroom");
  await page.getByRole("button", { name: "New class" }).first().click();
  await page.getByRole("dialog").getByLabel("Course name").fill("Physics");
  await page.getByRole("dialog").getByLabel("Period").fill("8");
  await page.getByRole("dialog").getByRole("button", { name: "Create class" }).click();
  await page.getByRole("link", { name: "Physics" }).click();

  // add a student
  await page.getByRole("tab", { name: "Roster" }).click();
  await page.getByRole("button", { name: "New student" }).click();
  await page.getByRole("dialog").getByLabel("First name").fill("Sky");
  await page.getByRole("dialog").getByLabel("Last name").fill("Tester");
  await page.getByRole("dialog").getByRole("button", { name: "Add student" }).click();
  await expect(page.getByRole("link", { name: "Sky Tester" })).toBeVisible();

  // create layout
  await page.getByRole("tab", { name: "Seating layouts" }).click();
  await page.getByRole("button", { name: "New layout" }).click();
  await page.getByRole("dialog").getByLabel("Layout name").fill("Exam rows");
  await page.getByRole("dialog").getByRole("button", { name: "Create layout" }).click();
  await expect(page.getByRole("grid", { name: "Seating chart: Exam rows" })).toBeVisible();

  // assign via click (keyboard-accessible path)
  await page.getByRole("grid").getByRole("button", { name: "Empty seat" }).first().click();
  await page.getByRole("dialog").getByLabel("Student for this seat").selectOption({ label: "Sky Tester" });
  await expect(page.getByRole("grid").getByRole("button", { name: /Sky Tester/ })).toBeVisible();

  await reload(page);
  await page.getByRole("tab", { name: "Live classroom" }).click();
  await expect(page.getByRole("grid", { name: "Seating chart: Exam rows" }).getByRole("button", { name: /Sky Tester/ })).toBeVisible();
});

test("drag a student between seats in the editor", async ({ page }) => {
  await openApp(page, "/classroom");
  await page.getByRole("link", { name: "AP Biology" }).click();
  await page.getByRole("tab", { name: "Seating layouts" }).click();
  const grid = page.getByRole("grid");
  const seated = grid.locator("button[title]").first();
  const name = (await seated.getAttribute("title"))!;
  const empty = grid.getByRole("button", { name: "Empty seat" }).first();
  const targetId = (await empty.getAttribute("data-drop"))!;
  const from = (await seated.boundingBox())!;
  const to = (await empty.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(grid.locator(`[data-drop="${targetId}"]`)).toHaveAttribute("title", name);
  await expect(grid.locator(`button[title="${name}"]`)).toHaveCount(1);
});
