import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
    channel: process.platform === "win32" ? "msedge" : "chromium",
    trace: "retain-on-failure",
  },
  outputDir: "../../output/visual-polish/test-results",
  reporter: [["list"]],
});
