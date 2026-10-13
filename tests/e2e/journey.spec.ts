import { expect, test, type Page } from "@playwright/test";

/**
 * The main user journey, from signup to completed challenge and back again.
 * Runs on a phone-sized viewport and on desktop.
 */
test("signup → create → log → edit → pause/resume → complete → log in again", async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.test`;
  const password = "correct horse battery";

  // ---- 1. landing page & signup ---------------------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /set a goal/i })).toBeVisible();
  await page.getByRole("link", { name: /get started/i }).click();
  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(alerts(page)).toContainText(/at least 8 characters/i);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // ---- 2. empty dashboard ----------------------------------------------------------------
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /hi ada/i })).toBeVisible();
  await expect(page.getByText("No challenges yet")).toBeVisible();

  // ---- 3. create a fully customised challenge --------------------------------------------
  await page.getByRole("link", { name: /create your first challenge/i }).click();
  await page.getByLabel("Name", { exact: true }).fill("Run 5 km a day");
  await page.getByLabel("Category").selectOption("fitness");
  await page.getByLabel("Unit").selectOption("km");
  await page.getByLabel("Duration (days)").fill("7");
  await page.getByLabel(/target per day/i).fill("5");
  await expect(page.getByText(/7 sessions · 35 km in total/)).toBeVisible();
  await page.getByRole("button", { name: "Create challenge" }).click();

  // ---- 4. detail page with generated schedule --------------------------------------------
  await expect(page.getByRole("heading", { name: "Run 5 km a day", level: 1 })).toBeVisible();
  await expect(page.getByText("0 of 7 sessions done")).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "0 km / 5 km" }).first()).toBeVisible();

  // ---- 5. validation errors never look like success ------------------------------------------
  await openLog(page);
  await page.getByLabel(/how much/i).fill("0");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(alerts(page).first()).toBeVisible();
  await expect(page.getByText(/logged 0/i)).toHaveCount(0);

  // ---- 6. log progress (and a second session the same day) -------------------------------------
  await page.getByLabel(/how much/i).fill("3.5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Logged 3.5 km!").first()).toBeVisible();
  await expect(page.getByText("3.5 km", { exact: true }).first()).toBeVisible();
  await openLog(page);
  await page.getByLabel(/how much/i).fill("2");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Logged 2 km!").first()).toBeVisible();
  await expect(page.getByText("1 of 7 sessions done")).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "5.5 km / 5 km" }).first()).toBeVisible();
  await expect(page.getByText("Halfway there").first()).toBeVisible();

  // ---- 7. charts render ---------------------------------------------------------------------
  await expect(page.getByRole("img", { name: /line chart of cumulative amount/i })).toBeVisible();
  await expect(page.locator(".recharts-line").first()).toBeVisible();

  // ---- 8. edit: lengthen the challenge, change future target -----------------------------------
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("link", { name: /edit targets/i }).click();
  await expect(page.getByRole("heading", { name: /edit/i, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "+7 days" }).click();
  await page.getByRole("button", { name: "Update dates" }).click();
  await expect(page.getByText("Dates updated.")).toBeVisible();
  await expect(page.getByText(/\(14 days\)/)).toBeVisible();
  await page.getByLabel(/target per day/i).fill("6");
  await page.getByLabel("Apply from").fill(await tomorrow(page));
  await page.getByRole("button", { name: "Update targets" }).click();
  await expect(page.getByText("Targets updated.")).toBeVisible();
  await page.getByRole("link", { name: /back to challenge/i }).click();
  await expect(page.getByText("14 days").first()).toBeVisible();

  // ---- 9. pause and resume --------------------------------------------------------------------
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: /pause challenge/i }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Challenge paused.")).toBeVisible();
  await expect(page.getByText(/paused since/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /log activity/i })).toHaveCount(0);
  await page.getByRole("button", { name: /resume/i }).first().click();
  await page.getByRole("button", { name: "Resume", exact: true }).last().click();
  await expect(page.getByText(/challenge resumed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /log activity/i }).first()).toBeVisible();

  // ---- 10. delete a log entry, then finish early and review results ------------------------------
  await page.getByRole("button", { name: "Delete entry" }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Entry deleted.")).toBeVisible();
  await expect(page.getByText("3.5 km", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: /finish early/i }).click();
  await page.getByRole("button", { name: "Finish challenge" }).click();
  await expect(page.getByText(/challenge completed/i).first()).toBeVisible();
  await expect(page.getByText("Final results")).toBeVisible();
  await expect(page.getByText(/finished .* early/i).first()).toBeVisible();

  // ---- 11. log out, log in later: the data is still there ------------------------------------------
  await goto(page, "/settings");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong password!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(alerts(page)).toBeVisible();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await goto(page, "/challenges?status=completed");
  await page.getByRole("link", { name: /run 5 km a day/i }).click();
  await expect(page.getByText("Final results")).toBeVisible();
  await expect(page.getByText("History")).toBeVisible();
  await expect(page.getByText("3.5 km").first()).toBeVisible();
});

test("signed-out visitors are redirected and cannot see other people's data", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/challenges/00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.get("/api/export");
  expect(res.status()).toBe(401);
  await page.goto("/s/not-a-real-token-0123456789abcdef");
  await expect(page.getByText(/404|could not be found/i).first()).toBeVisible();
});

async function openLog(page: Page) {
  const btn = page.getByRole("button", { name: /log activity/i }).first();
  await btn.click();
  await expect(page.getByLabel(/how much/i)).toBeVisible();
}

async function goto(page: Page, url: string) {
  await page.goto(url);
}

async function tomorrow(page: Page): Promise<string> {
  const v = await page.getByLabel("Apply from").inputValue();
  const d = new Date(`${v}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** App alerts only – Next.js's route announcer also has role="alert". */
function alerts(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}
