import { expect, test, type Page } from "@playwright/test";

/** The semester plan: start it, tick things, see them persist, log numbers, and never fake a success. */
// The server's clock is fixed (see playwright.config.ts): Wednesday 21 Oct 2026, week 1 of the plan.

async function signup(page: Page, projectName: string) {
  const email = `plan-${projectName}-${Date.now()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Plan Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

const today = (page: Page) => page.locator("#today");

test("start the plan, tick today's tasks, and find them again after reloading and logging back in", async ({ page }, info) => {
  const email = await signup(page, info.project.name);

  // ---- start ------------------------------------------------------------------------------
  await page.getByRole("link", { name: /semester 4 plan/i }).click();
  await expect(page).toHaveURL(/\/plan/);
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("heading", { name: "Semester 4 · Malaysia", level: 1 })).toBeVisible();
  await expect(page.getByText("Day 3 / 133")).toBeVisible();

  // ---- today (a Wednesday): 9 tasks, exercise at 19:00 ----------------------------------------
  await expect(today(page).getByText("Today", { exact: true })).toBeVisible();
  await expect(today(page).getByText("0 / 9")).toBeVisible();
  const exercise = today(page).getByRole("checkbox", { name: /Exercise/ });
  await expect(exercise).toContainText("19:00");
  await expect(exercise).toContainText("Strength");
  await expect(page.getByText("06:30")).toHaveCount(0);

  await exercise.click();
  await expect(exercise).toHaveAttribute("aria-checked", "true");
  await today(page).getByRole("checkbox", { name: /German/ }).click();
  await expect(today(page).getByText("2 / 9")).toBeVisible();

  // untick works too
  await today(page).getByRole("checkbox", { name: /German/ }).click();
  await expect(today(page).getByText("1 / 9")).toBeVisible();

  // ---- yesterday can be filled in; tomorrow can't ----------------------------------------------
  await expect(today(page).getByRole("button", { name: "Next day" })).toBeDisabled();
  await today(page).getByRole("button", { name: "Previous day" }).click();
  await expect(today(page).getByText("Tuesday", { exact: true })).toBeVisible();
  await expect(today(page).getByText("0 / 8")).toBeVisible(); // no exercise on Tuesdays
  await today(page).getByRole("checkbox", { name: /Projects/ }).click();
  await expect(today(page).getByText("1 / 8")).toBeVisible();

  // ---- goals, months, weeks ----------------------------------------------------------------------
  await page.locator("#goals summary").click();
  await expect(page.locator("#goals").getByText("0 of 11 achieved")).toBeVisible();
  await page.locator("#goals").getByRole("checkbox", { name: /Grades/ }).click();
  await expect(page.locator("#goals").getByText("1 of 11 achieved")).toBeVisible();

  const month = page.locator("#month");
  await expect(month.getByText("October · Applications")).toBeVisible();
  await expect(month.getByText("November · German + courses")).toBeVisible(); // next month
  await month.getByRole("checkbox", { name: "DAAD sent" }).click();

  const week1 = page.locator("#weeks details").first();
  await expect(week1).toContainText("long run 15 km");
  await week1.getByRole("checkbox", { name: /Add all deadlines/ }).click();
  await week1.getByRole("checkbox", { name: /YouTube/ }).click();
  await expect(page.locator("#weeks details")).toHaveCount(19);

  // a week that hasn't started: its own tasks can be ticked early, the recurring weekly goals can't
  const week9 = page.locator("#weeks details").nth(8);
  await week9.locator("summary").click();
  await expect(week9.getByRole("checkbox", { name: /Start ML Specialization/ })).toBeEnabled();
  await expect(week9.getByRole("checkbox", { name: /Instagram/ })).toBeDisabled();

  // ---- schedule ---------------------------------------------------------------------------------------
  const schedule = page.locator("#schedule");
  await expect(schedule.getByRole("article", { name: "Thursday" })).toContainText("WIA2006 Systems Analysis & Design");
  await expect(schedule.getByRole("article", { name: "Thursday" })).toContainText("19:00 · Long run");
  await expect(schedule.getByRole("article", { name: "Tuesday" })).not.toContainText("19:00");
  await expect(schedule.getByRole("article", { name: "Wednesday" })).toContainText("Today");

  // ---- Sunday numbers ------------------------------------------------------------------------------------
  await week1.getByLabel("Weight (kg)").fill("70.5");
  await week1.getByLabel("YouTube subscribers").fill("12");
  await week1.getByRole("button", { name: "Save numbers" }).click();
  await expect(page.getByText("Week 1 numbers saved.")).toBeVisible();
  await expect(page.locator("#goals").getByText("70.5 kg")).toBeVisible(); // the goals panel (still open) shows the latest numbers

  // ---- everything is still there after a reload ------------------------------------------------------------
  await page.reload();
  await expect(today(page).getByRole("checkbox", { name: /Exercise/ })).toHaveAttribute("aria-checked", "true");
  await expect(today(page).getByText("1 / 9")).toBeVisible();
  await page.locator("#goals summary").click();
  await expect(page.locator("#goals").getByText("1 of 11 achieved")).toBeVisible();
  await expect(page.locator("#month").getByRole("checkbox", { name: "DAAD sent" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#weeks details").first().getByLabel("Weight (kg)")).toHaveValue("70.5");

  // ---- ...and after logging out and back in -------------------------------------------------------------------
  await page.goto("/settings");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/plan/); // people with a plan land on it
  await expect(today(page).getByRole("checkbox", { name: /Exercise/ })).toHaveAttribute("aria-checked", "true");
});

test("a tick that fails to save is undone and reported – never shown as done", async ({ page }, info) => {
  await signup(page, info.project.name);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("heading", { name: "Semester 4 · Malaysia", level: 1 })).toBeVisible();

  // simulate the network dying for server actions
  await page.route("**/plan", (route) => (route.request().headers()["next-action"] ? route.abort() : route.continue()));
  const german = today(page).getByRole("checkbox", { name: /German/ });
  await german.click();
  await expect(page.getByText(/Couldn't save that tick/)).toBeVisible();
  await expect(german).toHaveAttribute("aria-checked", "false");
  await expect(today(page).getByText("0 / 9")).toBeVisible();

  // and once the network is back it works
  await page.unroute("**/plan");
  await german.click();
  await expect(german).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(today(page).getByRole("checkbox", { name: /German/ })).toHaveAttribute("aria-checked", "true");
});

test("the plan needs an account", async ({ page }) => {
  await page.goto("/plan");
  await expect(page).toHaveURL(/\/login/);
});
