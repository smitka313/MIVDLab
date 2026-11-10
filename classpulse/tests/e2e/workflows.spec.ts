import { expect, test } from "@playwright/test";
import { openApp, reload } from "./helpers";

test("attendance is saved to the correct date and class", async ({ page }) => {
  await openApp(page, "/attendance");
  await page.getByLabel("Class", { exact: true }).selectOption({ label: "P2 · Biology" });
  const date = "2026-10-01";
  await page.getByLabel("Date").fill(date);
  const row = page.locator("tbody tr").first();
  const name = (await row.locator("td").first().textContent())!.trim();
  await row.getByRole("radio", { name: /Tardy/ }).click();
  await expect(page.getByText(`${name}: Tardy`)).toBeVisible();

  await reload(page);
  await page.getByLabel("Class", { exact: true }).selectOption({ label: "P2 · Biology" });
  await page.getByLabel("Date").fill(date);
  await expect(page.locator("tbody tr").first().getByRole("radio", { name: /Tardy/ })).toHaveAttribute("aria-checked", "true");
  // different class, same date: untouched
  await page.getByLabel("Class", { exact: true }).selectOption({ label: "P1 · Biology" });
  await expect(page.getByText(/0\/\d+ marked/)).toBeVisible();
});

test("mark unmarked students present, then export attendance CSV", async ({ page }) => {
  await openApp(page, "/attendance");
  await page.getByRole("button", { name: "Mark unmarked present" }).click();
  await expect(page.getByText(/Marked \d+ unmarked students present/)).toBeVisible();
  await page.getByRole("tab", { name: "Class history" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  const lines = text.trim().split(/\r\n/);
  expect(lines[0]).toBe("Date,Last Name,First Name,Status,Note");
  expect(lines.length).toBeGreaterThan(10);
  expect(lines.every((l) => l.split(",").length >= 5)).toBe(true);
});

test("create, update and complete an intervention plan", async ({ page }) => {
  await openApp(page, "/interventions");
  await page.getByRole("button", { name: "New plan" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Student").selectOption({ index: 1 });
  await dialog.getByLabel("Target behavior or goal").fill("Starts the warm-up within 3 minutes");
  await dialog.getByLabel("Strategy", { exact: true }).selectOption({ label: "Structured check-ins" });
  await dialog.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: "Starts the warm-up within 3 minutes" })).toBeVisible();

  await page.getByLabel("Assessment").selectOption({ label: "Appears helpful" });
  await page.getByLabel("Evidence / notes").fill("Started on time 4 of 5 days.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Started on time 4 of 5 days.")).toBeVisible();

  await page.getByRole("button", { name: "Completed" }).click();
  await expect(page.getByText("Status: Completed")).toBeVisible();
  await reload(page);
  await expect(page.locator("main").getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Started on time 4 of 5 days.")).toBeVisible();
});

test("log a communication record and review it in the log", async ({ page }) => {
  await openApp(page, "/communication");
  await page.getByRole("button", { name: "Log contact" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Student").selectOption({ index: 1 });
  await dialog.getByLabel("Contact type").selectOption({ label: "Phone call" });
  await dialog.getByLabel("Recipient / participant").fill("Guardian (fictional)");
  await dialog.getByLabel("Summary").fill("Discussed great progress on the bridge project.");
  await dialog.getByRole("button", { name: "Log contact" }).click();
  await expect(page.getByText("Contact logged")).toBeVisible();
  await reload(page);
  await expect(page.getByText("Discussed great progress on the bridge project.")).toBeVisible();
});

test("draft a message from selected observations without sending it", async ({ page }) => {
  await openApp(page, "/communication");
  await page.getByRole("tab", { name: "Draft a message" }).click();
  await page.getByLabel("Student").selectOption({ index: 1 });
  await page.getByLabel("Template", { exact: true }).selectOption({ index: 1 });
  const first = page.locator("fieldset ul input[type=checkbox]").first();
  if (await first.count()) await first.check();
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(/Hello/);
  // Copy / email are disabled until the teacher confirms review
  await expect(page.getByRole("button", { name: "Copy" })).toBeDisabled();
  await page.getByText("I have reviewed this message").click();
  await expect(page.getByRole("button", { name: "Copy" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Open email draft" })).toHaveAttribute("href", /^mailto:/);
});

test("create and modify groups", async ({ page }) => {
  await openApp(page, "/groups");
  await page.getByLabel("Class", { exact: true }).selectOption({ label: "P1 · Biology" });
  await page.getByRole("button", { name: "New groups" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Microscope teams");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Groups created")).toBeVisible();
  await expect(page.getByLabel("Saved group configuration")).toHaveValue(/.+/);
  const firstGroupName = page.getByLabel("Group name").first();
  await firstGroupName.fill("Team Alpha");
  await firstGroupName.blur();
  // move a member from group 1 to group 2
  const select = page.locator('select[aria-label^="Group for"]').first();
  const student = (await select.getAttribute("aria-label"))!.replace("Group for ", "");
  await select.selectOption({ index: 2 });
  await reload(page);
  await page.getByLabel("Class", { exact: true }).selectOption({ label: "P1 · Biology" });
  await expect(page.getByLabel("Group name").first()).toHaveValue("Team Alpha");
  await expect(page.getByLabel(`Group for ${student}`)).not.toHaveValue("");
});

test("reports reflect stored data and export valid CSV", async ({ page }) => {
  await openApp(page, "/reports");
  await page.getByLabel("Report type").selectOption({ label: "Class behavior summary" });
  await page.getByRole("button", { name: "90 days" }).click();
  const total = Number(await page.locator("dl dd").first().textContent());
  expect(total).toBeGreaterThan(0);
  await page.goto("/behavior");
  await page.getByLabel("From").fill(new Date(Date.now() - 90 * 86400000).toLocaleDateString("en-CA"));
  await expect(page.getByText(`${total} observations`, { exact: true })).toBeVisible();

  await page.goto("/reports");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  expect(text.split("\r\n")[0]).toBe("Class,Student,Positive,Engagement,Redirection,Total");
});

test("destructive actions require confirmation", async ({ page }) => {
  await openApp(page, "/classroom");
  await page.getByRole("button", { name: "Options for Principles of Engineering" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("permanently deletes");
  const btn = confirm.getByRole("button", { name: "Delete class" });
  await expect(btn).toBeDisabled();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("link", { name: "Principles of Engineering" })).toBeVisible();

  await page.getByRole("button", { name: "Options for Principles of Engineering" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page.getByRole("alertdialog").getByLabel(/Type DELETE/).fill("DELETE");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete class" }).click();
  await expect(page.getByRole("link", { name: "Principles of Engineering" })).toHaveCount(0);
});

test("export all data produces a valid JSON file", async ({ page }) => {
  await openApp(page, "/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export all my data" }).click()]);
  const json = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8")));
  expect(json.format).toBe("classpulse-export");
  expect(json.tables.students.length).toBeGreaterThan(100);
  expect(json.tables.classes).toHaveLength(6);
});

test("custom quick-log buttons appear in Live Classroom", async ({ page }) => {
  await openApp(page, "/settings#categories");
  await page.getByLabel("New quick-log button").first().fill("Wore safety goggles");
  await page.getByLabel("New quick-log button").first().press("Enter");
  await expect(page.getByText("Button added")).toBeVisible();
  await page.goto("/classroom");
  await page.getByRole("link", { name: "STEM Research Lab" }).click();
  await page.getByRole("grid").locator("button[title]").first().click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Wore safety goggles" })).toBeVisible();
});
