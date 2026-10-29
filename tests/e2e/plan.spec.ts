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
  await expect(page.locator("#goals").getByText("0 of 10 achieved")).toBeVisible();
  await page.locator("#goals").getByRole("checkbox", { name: /Grades/ }).click();
  await expect(page.locator("#goals").getByText("1 of 10 achieved")).toBeVisible();

  const month = page.locator("#month");
  await expect(month.getByText("October · Applications")).toBeVisible();
  await expect(month.getByText("November · German + courses")).toBeVisible(); // next month
  await month.getByRole("checkbox", { name: "DAAD sent" }).click();

  const week1 = page.locator("#weeks details").first();
  await expect(week1).toContainText("long run 15 km");
  await week1.getByRole("checkbox", { name: /Add all deadlines/ }).click();
  await week1.getByRole("checkbox", { name: /Studies/ }).click();
  await expect(page.locator("#weeks details")).toHaveCount(19);

  // a week that hasn't started: its own tasks can be ticked early, the recurring weekly goals can't
  const week9 = page.locator("#weeks details").nth(8);
  await week9.locator("summary").click();
  await expect(week9.getByRole("checkbox", { name: /Start ML Specialization/ })).toBeEnabled();
  await expect(week9.getByRole("checkbox", { name: /Social/ })).toBeDisabled();

  // ---- schedule ---------------------------------------------------------------------------------------
  const schedule = page.locator("#schedule");
  await expect(schedule.getByRole("article", { name: "Thursday" })).toContainText("WIA2006 Systems Analysis & Design");
  await expect(schedule.getByRole("article", { name: "Thursday" })).toContainText("19:00–21:00");
  await expect(schedule.getByRole("article", { name: "Thursday" })).toContainText("Long run");
  await expect(schedule.getByRole("article", { name: "Monday" })).toContainText("09:00–10:00");
  await expect(schedule.getByRole("article", { name: "Monday" })).toContainText("Probability & Statistics I");
  await expect(schedule.getByRole("article", { name: "Friday" })).toContainText("Lecture · Online");
  await expect(schedule.getByRole("article", { name: "Tuesday" })).not.toContainText("19:00");
  await expect(schedule.getByRole("article", { name: "Wednesday" })).toContainText("Today");

  // ---- Sunday numbers ------------------------------------------------------------------------------------
  await week1.getByLabel("Weight (kg)").fill("70.5");
  await week1.getByLabel("Long run (km)").fill("12");
  await week1.getByRole("button", { name: "Save numbers" }).click();
  await expect(page.getByText("Week 1 numbers saved.")).toBeVisible();
  await expect(page.locator("#goals").getByText("70.5 kg")).toBeVisible(); // the goals panel (still open) shows the latest numbers

  // the October card compares what you logged with what the plan asks for
  const octNumbers = page.getByRole("group", { name: "October numbers" }).or(page.locator('dl[aria-label="October numbers"]'));
  await expect(octNumbers).toContainText("12 / 15"); // long run: logged vs the October target
  await expect(octNumbers).toContainText("70.5 / "); // weight, with an automatic target from the first weigh-in
  await expect(octNumbers).toContainText("Books finished");
  await expect(octNumbers).toContainText("0 / 0");

  // ---- everything is still there after a reload ------------------------------------------------------------
  await page.reload();
  await expect(today(page).getByRole("checkbox", { name: /Exercise/ })).toHaveAttribute("aria-checked", "true");
  await expect(today(page).getByText("1 / 9")).toBeVisible();
  await page.locator("#goals summary").click();
  await expect(page.locator("#goals").getByText("1 of 10 achieved")).toBeVisible();
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

test("edit the plan: change a goal, add a daily task and a book, finish a book, and keep it all after a reload", async ({ page }, info) => {
  await signup(page, info.project.name);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("heading", { name: "Semester 4 · Malaysia", level: 1 })).toBeVisible();

  // every day has German and reading
  await expect(today(page).getByRole("checkbox", { name: /German/ })).toBeVisible();
  await expect(today(page).getByRole("checkbox", { name: /Read your book/ })).toBeVisible();

  // books can be ticked straight away
  await page.locator("#goals summary").click();
  await page.locator("#goals").getByRole("checkbox", { name: "Book 1" }).click();
  await expect(page.locator("#goals").getByText("1 of 3 finished")).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/plan\/edit/);
  await expect(page.getByRole("heading", { name: "Edit plan", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await page.getByLabel("Goal 1 target", { exact: true }).fill("A+ in all 6 courses and top 10%");
  await page.getByText("Books to finish").click(); // sections are collapsed until opened
  await page.getByLabel("Book 1 title", { exact: true }).fill("Deep Work");
  await page.getByRole("button", { name: "Add a daily task" }).click();
  await page.getByLabel(/Daily task \d+ title/).last().fill("Walk 20 minutes");
  await page.getByRole("button", { name: "Add a book" }).click();
  await page.getByLabel(/Book \d+ title/).last().fill("Atomic Habits");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(today(page).getByRole("checkbox", { name: /Walk 20 minutes/ })).toBeVisible();
  await expect(today(page).getByText("0 / 10")).toBeVisible();
  await page.locator("#goals summary").click();
  await expect(page.locator("#goals").getByText("A+ in all 6 courses and top 10%")).toBeVisible();
  await expect(page.locator("#goals").getByRole("checkbox", { name: "Deep Work" })).toHaveAttribute("aria-checked", "true"); // kept its tick
  await expect(page.locator("#goals").getByRole("checkbox", { name: "Atomic Habits" })).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#goals").getByText("1 of 4 finished")).toBeVisible();

  await today(page).getByRole("checkbox", { name: /Walk 20 minutes/ }).click();
  await page.reload();
  await expect(today(page).getByRole("checkbox", { name: /Walk 20 minutes/ })).toHaveAttribute("aria-checked", "true");
});

test("a bad edit is refused with a message, and reset brings the original plan back", async ({ page }, info) => {
  await signup(page, info.project.name);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("heading", { name: "Semester 4 · Malaysia", level: 1 })).toBeVisible();

  await page.goto("/plan/edit");
  await page.getByLabel("Daily task 1 title", { exact: true }).fill("Walk 20 minutes");
  await page.getByLabel("Goal 1 name", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("can't be empty");
  await expect(page).toHaveURL(/\/plan\/edit/);

  // fix it and save: the first daily task is now the walk
  await page.getByLabel("Goal 1 name", { exact: true }).fill("Grades");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(today(page).getByRole("checkbox", { name: /Walk 20 minutes/ })).toBeVisible();
  await expect(today(page).getByRole("checkbox", { name: /Exercise/ })).toHaveCount(0);

  // reset brings the original back
  await page.goto("/plan/edit");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Reset everything/ }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(today(page).getByRole("checkbox", { name: /Walk 20 minutes/ })).toHaveCount(0);
  await expect(today(page).getByRole("checkbox", { name: /Exercise/ })).toBeVisible();
  await expect(today(page).getByText("0 / 9")).toBeVisible();
});

test("the evening reminder can be switched on and stays on; without an email provider the page says so", async ({ page }, info) => {
  await signup(page, info.project.name);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("heading", { name: "Semester 4 · Malaysia", level: 1 })).toBeVisible();

  const toggle = page.getByRole("switch", { name: /reminder every evening/ });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText(/Email sending isn't connected/)).toBeVisible(); // no RESEND_API_KEY in the test server
  await expect(page.getByText("Telegram reminder")).toBeVisible();
  await expect(page.getByText(/Telegram isn't set up on this server yet/)).toBeVisible(); // no bot token either
  await expect(page.getByRole("button", { name: "Connect Telegram" })).toHaveCount(0);
  await toggle.check({ force: true });
  await expect(page.getByText("I'll email you at 23:30.")).toBeVisible();
  await expect(page.getByText(/Every day at 23:30 to plan-/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("switch", { name: /reminder every evening/ })).toBeChecked();
  await expect(page.getByLabel("Reminder time")).toHaveValue("23:30");

  await page.getByRole("switch", { name: /reminder every evening/ }).uncheck({ force: true });
  await expect(page.getByText("Reminder turned off.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: /reminder every evening/ })).not.toBeChecked();
});

test("today is an hour-by-hour timeline with ticks, there is an analysis of the week, and overlapping blocks are refused", async ({ page }, info) => {
  await signup(page, info.project.name);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("heading", { name: "Semester 4 · Malaysia", level: 1 })).toBeVisible();

  // Wednesday: the class sits between study blocks, the workout is at 19:00 and can be ticked in place
  const day = today(page);
  await expect(day.getByRole("button", { name: "Timeline" })).toHaveAttribute("aria-pressed", "true");
  await expect(day).toContainText("WIG3007 Special Topics in Multimedia");
  await expect(day).toContainText("14:00");
  await expect(day).toContainText("Shower and dinner");
  const workout = day.getByRole("checkbox", { name: /Exercise/ });
  await expect(workout).toContainText("19:00–20:00");
  await workout.click();
  await expect(day.getByText("1 / 9")).toBeVisible();
  await expect(day.getByRole("checkbox", { name: /Talk to 1 new person/ })).toBeVisible(); // "any time" tasks sit below

  await day.getByRole("button", { name: "Checklist" }).click();
  await expect(day.getByRole("checkbox", { name: /Exercise/ })).toHaveAttribute("aria-checked", "true");

  // the analysis of the week
  const analysis = page.locator("#analysis");
  await expect(analysis.getByRole("heading", { name: "Analysis of my week" })).toBeVisible();
  await expect(analysis).toContainText("17"); // class hours a week
  await expect(analysis).toContainText("Nothing looks tight");
  await expect(analysis.getByRole("img", { name: /^Friday: Classes 4 hours/ })).toBeVisible();

  // a block that overlaps another one is refused with a clear message
  await page.goto("/plan/edit");
  await page.getByText("Daily timeline").click();
  await page.getByText("Wednesday", { exact: true }).click();
  await page.getByRole("button", { name: "Add a block" }).first().click();
  await page.getByLabel(/Wednesday block \d+ title/).last().fill("Late tea");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/“Late tea” overlap|overlap/);
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
