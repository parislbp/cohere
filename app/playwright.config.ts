import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the Vite dev server with the in-memory mock backend (`?mock=1`).
 * WebKit is closest to Tauri's WKWebView; Chromium is kept for speed and stack traces.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:1420/?mock=1",
    trace: "retain-on-failure",
    viewport: { width: 1400, height: 880 },
  },
  webServer: {
    command: "npm run dev:mock",
    url: "http://localhost:1420/?mock=1",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  // WebKit (closest to WKWebView) is opt-in: Playwright's frozen macOS-14 WebKit build fails to launch
  // with this Playwright version ("Unknown setting: PushAPIEnabled"). Run with PW_WEBKIT=1 on a newer OS.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, ...(process.env.PW_WEBKIT ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }] : [])],
});
