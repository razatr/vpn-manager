import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:18080",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "npm run build && node -e \"require('fs').rmSync('.tmp/e2e-data', { recursive: true, force: true })\" && HOST=127.0.0.1 PORT=18080 DATA_DIR=.tmp/e2e-data npm start",
    url: "http://127.0.0.1:18080/api/health",
    reuseExistingServer: false,
    timeout: 30_000
  }
});
