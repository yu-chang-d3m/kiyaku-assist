import { defineConfig, devices } from "@playwright/test";

/**
 * 本番 URL に対するジャーニーテスト用の設定
 * webServer を無効化し、E2E_BASE_URL に直接アクセスする
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL:
      process.env.E2E_BASE_URL ||
      "https://kiyaku-assist--kiyaku-assist.asia-east1.hosted.app",
    screenshot: "only-on-failure",
    trace: "on",
  },
  projects: [
    {
      name: "staging-journey",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /journey\.spec\.ts/,
    },
  ],
});
