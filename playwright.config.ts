import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 設定
 *
 * projects:
 *   - setup:         認証セットアップ（1回だけ実行し storageState を保存）
 *   - local:         ローカル開発サーバー対象の E2E（認証済み）
 *   - mobile:        モバイル viewport（認証済み）
 *   - staging-smoke: 本番 URL 対象のスモークテスト（認証なし、デプロイ後確認用）
 *
 * 環境変数:
 *   - E2E_BASE_URL:     ベース URL 上書き（デフォルト: http://localhost:3000）
 *   - E2E_TEST_EMAIL:   テスト用メールアドレス
 *   - E2E_TEST_PASSWORD: テスト用パスワード
 *   - STAGING_URL:      スモークテスト対象 URL
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // ジャーニーテストはステップ順序が重要
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // DB 競合回避 + ジャーニー順序保証
  reporter: process.env.CI
    ? [["html"], ["json", { outputFile: "e2e-results.json" }]]
    : [["html"]],
  timeout: 180_000, // AI 処理を含むため長めに設定
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    // ── 認証セットアップ ──
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // ── ローカル E2E（認証済み） ──
    {
      name: "local",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/user.json",
      },
      dependencies: ["setup"],
      testIgnore: /dogfooding\.spec\.ts/,
    },
    // ── モバイル E2E（認証済み） ──
    {
      name: "mobile",
      use: {
        ...devices["iPhone 14"],
        storageState: ".auth/user.json",
      },
      dependencies: ["setup"],
      testMatch: /journey\.spec\.ts/,
    },
    // ── 本番/ステージング スモークテスト（認証なし） ──
    {
      name: "staging-smoke",
      use: {
        ...devices["Desktop Chrome"],
        baseURL:
          process.env.STAGING_URL ||
          "https://kiyaku-assist--kiyaku-assist.asia-east1.hosted.app",
      },
      testMatch: /dogfooding\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
