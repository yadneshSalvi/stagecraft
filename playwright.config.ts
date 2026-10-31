import { defineConfig, devices } from "@playwright/test";
import { deploymentStorageState } from "./tests/e2e/support/deployment-context";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  // A valid session may honor the unchanged server's 60-second Retry-After.
  expect: { timeout: 75_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3001",
    storageState: deploymentStorageState(),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
