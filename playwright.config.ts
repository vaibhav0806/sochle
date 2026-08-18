import { defineConfig, devices } from "@playwright/test";

const liveDatabaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  "postgresql://sochle:sochle@localhost:65432/sochle_verify";

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: false,
  outputDir: "test-results",
  projects: [
    {
      name: "extension-chromium",
      testMatch: /extension\.e2e\.ts/,
    },
    {
      name: "demo-chromium",
      testMatch: /demo\.e2e\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "live-chromium",
      testMatch: /(?:live|decision-core|product-experience)\.e2e\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3101" },
    },
  ],
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @sochle/web start --hostname 127.0.0.1 --port 3100",
      env: { ...process.env, SOCHLE_DEMO_MODE: "true" },
      reuseExistingServer: false,
      timeout: 30_000,
      url: "http://127.0.0.1:3100",
    },
    {
      command: "pnpm --filter @sochle/web start --hostname 127.0.0.1 --port 3101",
      env: {
        ...process.env,
        DATABASE_URL: liveDatabaseUrl,
        SOCHLE_APP_URL: "http://127.0.0.1:3101",
        SOCHLE_DEMO_MODE: "false",
        SOCHLE_OWNER_PASSWORD: "synthetic-owner-password",
        SOCHLE_SESSION_SECRET: "synthetic-session-secret-at-least-32-characters",
        SOCHLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      },
      reuseExistingServer: false,
      timeout: 30_000,
      url: "http://127.0.0.1:3101/login",
    },
  ],
  workers: 1,
});
