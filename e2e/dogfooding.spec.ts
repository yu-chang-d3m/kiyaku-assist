/**
 * 本番/ステージング スモークテスト
 *
 * デプロイ後に最小限の動作確認を行う。認証なしで実行可能な範囲をテストする。
 * playwright.config.ts の staging-smoke プロジェクトで実行される。
 *
 * 実行例:
 *   STAGING_URL=https://your-app.web.app npx playwright test --project=staging-smoke
 */

import { test, expect, Page } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

// ── Helper ──────────────────────────────────────────────
async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

// ── 1. トップページ表示確認 ────────────────────────────
test.describe("1. トップページ", () => {
  test("トップページが正しく表示される", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await screenshot(page, "01_top_page");

    // body がレンダリングされていること
    await expect(page.locator("body")).toBeVisible();

    // タイトルが設定されていること
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("ナビゲーション要素の確認", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // ヘッダーが存在すること
    await expect(page.locator("header")).toBeVisible();

    // リンクが1つ以上あること
    const linkCount = await page.locator("a").count();
    expect(linkCount).toBeGreaterThan(0);

    await screenshot(page, "01_nav_elements");
  });
});

// ── 2. ログインページ ──────────────────────────────────
test.describe("2. ログイン", () => {
  test("ログインページのフォームが表示される", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await screenshot(page, "02_login_page");

    // メールフィールドが存在すること
    await expect(
      page.locator('[data-test="login-email"]').or(
        page.locator('input[type="email"]'),
      ),
    ).toBeVisible();

    // パスワードフィールドが存在すること
    await expect(
      page.locator('[data-test="login-password"]').or(
        page.locator('input[type="password"]'),
      ),
    ).toBeVisible();
  });

  test("空のフォームでログインするとエラーが表示される", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    const submitBtn = page.locator('[data-test="login-submit"]').or(
      page.locator('button[type="submit"]:has-text("メールでログイン")'),
    );
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // エラーメッセージが表示されること
    await expect(
      page.getByText("メールアドレスとパスワードを入力", { exact: false }),
    ).toBeVisible({ timeout: 5000 });

    await screenshot(page, "02_login_empty_submit");
  });

  test("不正なメール/パスワードでエラーが表示される", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    await page.locator('[data-test="login-email"]').or(
      page.locator('input[type="email"]'),
    ).fill("invalid@example.com");

    await page.locator('[data-test="login-password"]').or(
      page.locator('input[type="password"]'),
    ).fill("wrongpassword123");

    await page.locator('[data-test="login-submit"]').or(
      page.locator('button[type="submit"]:has-text("メールでログイン")'),
    ).click();

    // エラーメッセージが表示されるまで待機
    await expect(
      page.getByText("失敗しました", { exact: false }),
    ).toBeVisible({ timeout: 10000 });

    await screenshot(page, "02_login_invalid_credentials");
  });
});

// ── 3. 未認証でのページアクセス確認 ───────────────────
test.describe("3. 認証ガード", () => {
  const protectedRoutes = [
    "/onboarding",
    "/upload",
    "/analysis",
    "/review",
    "/export",
    "/chat",
  ];

  for (const route of protectedRoutes) {
    test(`${route} に未認証でアクセス → /login にリダイレクトされる`, async ({
      page,
    }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      await page.waitForURL("**/login**", { timeout: 10000 });
      expect(page.url()).toContain("/login");
      await screenshot(page, `03_auth_guard_${route.replace("/", "")}`);
    });
  }

  test("/guide は認証なしでもアクセス可能", async ({ page }) => {
    await page.goto("/guide", { waitUntil: "networkidle" });
    expect(page.url()).toContain("/guide");
    await screenshot(page, "03_auth_guard_guide");
  });
});

// ── 4. パフォーマンス ─────────────────────────────────
test.describe("4. パフォーマンス", () => {
  test("トップページが10秒以内に読み込まれる", async ({ page }) => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "networkidle" });
    const loadTime = Date.now() - start;

    const perfMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      return {
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        domContentLoaded: Math.round(
          nav.domContentLoadedEventEnd - nav.startTime,
        ),
        load: Math.round(nav.loadEventEnd - nav.startTime),
      };
    });
    console.log(`Performance: load=${loadTime}ms`, perfMetrics);

    expect(loadTime).toBeLessThan(10000);
  });
});

// ── 5. コンソールエラーの収集 ──────────────────────────
test.describe("5. コンソールエラー", () => {
  test("公開ページにページクラッシュ級のエラーがないこと", async ({
    page,
  }) => {
    const pageErrors: string[] = [];

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    const publicRoutes = ["/", "/login", "/guide"];

    for (const route of publicRoutes) {
      await page.goto(route, { waitUntil: "networkidle" });
    }

    // PAGE ERROR（未捕捉例外）がゼロであること
    expect(
      pageErrors,
      `ページエラーが発生: ${pageErrors.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ── 6. アクセシビリティ基本チェック ───────────────────
test.describe("6. アクセシビリティ", () => {
  test("基本的なアクセシビリティ要素の確認", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // lang 属性が設定されていること
    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBeTruthy();

    // alt なしの画像がないこと
    const imagesWithoutAlt = await page.locator("img:not([alt])").count();
    expect(imagesWithoutAlt).toBe(0);
  });
});

// ── 7. レスポンシブ確認（モバイル） ────────────────────
test.describe("7. レスポンシブ", () => {
  test("モバイルビューでトップページとログインが表示される", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    await screenshot(page, "07_mobile_top");

    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    await screenshot(page, "07_mobile_login");

    await context.close();
  });
});
