import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const PORT = 3100;
const DB = process.env.E2E_DATABASE_URL ?? "postgres://app:app@127.0.0.1:5432/challenges_e2e";
// Use a pre-installed Chromium when the sandbox provides one; otherwise Playwright's own browser.
const bundled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync(bundled) ? bundled : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { executablePath, args: ["--no-sandbox"] } },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath, args: ["--no-sandbox"] } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath, args: ["--no-sandbox"] } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: DB, BETTER_AUTH_URL: `http://localhost:${PORT}`, BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdef0123456789", NODE_ENV: "production" },
  },
});
