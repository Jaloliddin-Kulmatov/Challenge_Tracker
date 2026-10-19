import { expect, test } from "@playwright/test";

/** "Add to home screen": a valid manifest with real icons, a service worker, an offline page and install help. */

test("the manifest and icons make the app installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ display: "standalone", start_url: "/plan", scope: "/", theme_color: "#0f7a5c" });
  expect(m.name).toBeTruthy();
  const purposes = m.icons.map((i: { sizes: string; purpose: string; type: string }) => `${i.sizes}:${i.purpose}`);
  expect(purposes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of m.icons as { src: string; type: string }[]) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()["content-type"]).toContain(icon.type);
  }
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
});

test("the service worker and the offline page are served", async ({ request }) => {
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  const offline = await request.get("/offline.html");
  expect(offline.ok()).toBe(true);
  expect(await offline.text()).toContain("You're offline");
});

test("pages link the home-screen icon, register the worker, and show install help in Settings", async ({ page }, info) => {
  await page.goto("/signup");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

  await page.getByLabel("Your name").fill("Install Tester");
  await page.getByLabel("Email").fill(`pwa-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const ready = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  expect(ready).toBe(true);

  await page.goto("/settings");
  await expect(page.getByText("Install on your phone")).toBeVisible();
  // headless Chromium offers no install prompt, so the generic instructions are shown
  await expect(page.getByText(/Install app/)).toBeVisible();
});

test("on an iPhone the app explains Add to Home Screen, and the banner can be dismissed for good", async ({ browser }, info) => {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("iPhone Tester");
  await page.getByLabel("Email").fill(`ios-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const banner = page.getByRole("region", { name: "Install the app" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "How" }).click();
  await expect(banner.getByText("Add to Home Screen")).toBeVisible();
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Install the app" })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByText("iPhone and iPad install from Safari")).toBeVisible();
  await ctx.close();
});

test("when the connection drops, the installed app shows the offline page instead of a browser error", async ({ page, context }, info) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Offline Tester");
  await page.getByLabel("Email").fill(`off-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.goto("/plan").catch(() => {});
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
