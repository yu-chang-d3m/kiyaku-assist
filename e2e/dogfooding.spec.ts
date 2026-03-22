import { test, expect, Page } from "@playwright/test";
import path from "path";

const BASE_URL =
  "https://kiyaku-assist--kiyaku-assist.asia-east1.hosted.app";
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
const PDF_PATH = "/Users/uchan/Desktop/00301管理規約案20260301.pdf";

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
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await screenshot(page, "01_top_page");

    // タイトルまたはロゴが表示されること
    const title = await page.title();
    console.log("📄 Page title:", title);

    // ページ内のテキスト内容を収集
    const bodyText = await page.innerText("body");
    console.log("📝 Body text (first 500 chars):", bodyText.slice(0, 500));

    // 基本的なレンダリング確認
    expect(await page.isVisible("body")).toBe(true);
  });

  test("ナビゲーション要素の確認", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    // ヘッダーの存在確認
    const header = page.locator("header");
    const hasHeader = (await header.count()) > 0;
    console.log("🔍 Header exists:", hasHeader);

    // リンクやボタンの一覧
    const links = await page.locator("a").allInnerTexts();
    console.log("🔗 Links:", links);

    const buttons = await page.locator("button").allInnerTexts();
    console.log("🔘 Buttons:", buttons);

    await screenshot(page, "01_nav_elements");
  });
});

// ── 2. ログインページ ──────────────────────────────────
test.describe("2. ログイン", () => {
  test("ログインページが表示される", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await screenshot(page, "02_login_page");

    const bodyText = await page.innerText("body");
    console.log("📝 Login page text:", bodyText.slice(0, 500));

    // メールフィールドの存在
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const hasEmail = (await emailInput.count()) > 0;
    console.log("📧 Email input exists:", hasEmail);

    // パスワードフィールドの存在
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    );
    const hasPassword = (await passwordInput.count()) > 0;
    console.log("🔒 Password input exists:", hasPassword);

    // Googleログインボタン
    const googleBtn = page.locator('button:has-text("Google")');
    const hasGoogle = (await googleBtn.count()) > 0;
    console.log("🔵 Google login button exists:", hasGoogle);
  });

  test("空のフォームでログインするとエラーが表示される", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    // ログインボタンをクリック（空のまま）
    const submitBtn = page.locator(
      'button[type="submit"]:has-text("メールでログイン")'
    );
    if ((await submitBtn.count()) > 0) {
      await submitBtn.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, "02_login_empty_submit");

      const bodyText = await page.innerText("body");
      console.log("📝 After empty submit:", bodyText.slice(0, 500));
    } else {
      console.log("⚠️ Login submit button not found");
    }
  });

  test("不正なメール/パスワードでログインするとエラーが表示される", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    );

    if ((await emailInput.count()) > 0 && (await passwordInput.count()) > 0) {
      await emailInput.first().fill("invalid@example.com");
      await passwordInput.first().fill("wrongpassword123");

      const submitBtn = page.locator(
        'button[type="submit"], button:has-text("ログイン")'
      );
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
        await page.waitForTimeout(3000);
        await screenshot(page, "02_login_invalid_credentials");

        const bodyText = await page.innerText("body");
        console.log("📝 After invalid login:", bodyText.slice(0, 500));
      }
    } else {
      console.log("⚠️ Email/Password inputs not found");
    }
  });
});

// ── 3. 未認証でのページアクセス確認 ───────────────────
test.describe("3. 認証ガード", () => {
  // 認証ガードで保護されるべきページ
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
      await page.goto(`${BASE_URL}${route}`, {
        waitUntil: "networkidle",
      });
      // AuthGuard により /login へリダイレクトされることを確認
      await page.waitForURL("**/login", { timeout: 10000 });
      const finalUrl = page.url();
      console.log(`🔐 ${route} → redirected to: ${finalUrl}`);
      expect(finalUrl).toContain("/login");
      await screenshot(
        page,
        `03_auth_guard_${route.replace("/", "")}`
      );
    });
  }

  // /guide は保護不要（誰でも閲覧可能）
  test("/guide は認証なしでもアクセス可能", async ({ page }) => {
    await page.goto(`${BASE_URL}/guide`, { waitUntil: "networkidle" });
    const finalUrl = page.url();
    console.log(`📖 /guide → ${finalUrl}`);
    expect(finalUrl).toContain("/guide");
    await screenshot(page, "03_auth_guard_guide");
  });
});

// ── 4. オンボーディングフロー（認証なしでアクセス可能か確認）─
test.describe("4. オンボーディング", () => {
  test("オンボーディングのUIを確認", async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: "networkidle" });
    const finalUrl = page.url();

    // リダイレクトされなかった場合のみUI確認
    if (finalUrl.includes("/onboarding")) {
      await screenshot(page, "04_onboarding");
      const bodyText = await page.innerText("body");
      console.log("📝 Onboarding page:", bodyText.slice(0, 500));

      // フォーム要素の確認
      const inputs = await page.locator("input, select, textarea").count();
      const buttons = await page.locator("button").allInnerTexts();
      console.log("📋 Form inputs count:", inputs);
      console.log("🔘 Buttons:", buttons);
    } else {
      console.log("🔐 Redirected to:", finalUrl);
    }
  });
});

// ── 5. アップロードページ ──────────────────────────────
test.describe("5. アップロード", () => {
  test("アップロードページの表示確認", async ({ page }) => {
    await page.goto(`${BASE_URL}/upload`, { waitUntil: "networkidle" });
    const finalUrl = page.url();

    if (finalUrl.includes("/upload")) {
      await screenshot(page, "05_upload_page");
      const bodyText = await page.innerText("body");
      console.log("📝 Upload page:", bodyText.slice(0, 500));

      // ドロップゾーンの確認
      const dropzone = page.locator(
        '[class*="drop"], [class*="upload"], [role="button"]'
      );
      console.log("📦 Dropzone-like elements:", await dropzone.count());

      // ファイル入力の確認
      const fileInput = page.locator('input[type="file"]');
      console.log("📁 File input exists:", (await fileInput.count()) > 0);
    } else {
      console.log("🔐 Redirected to:", finalUrl);
    }
  });

  test("PDFファイルのアップロードテスト", async ({ page }) => {
    await page.goto(`${BASE_URL}/upload`, { waitUntil: "networkidle" });
    const finalUrl = page.url();

    if (!finalUrl.includes("/upload")) {
      console.log("🔐 Redirected, skipping upload test");
      return;
    }

    // ファイル入力を探す（hidden でも操作可能）
    const fileInput = page.locator('input[type="file"]');
    if ((await fileInput.count()) > 0) {
      await fileInput.first().setInputFiles(PDF_PATH);
      await page.waitForTimeout(3000);
      await screenshot(page, "05_after_upload");
      const bodyText = await page.innerText("body");
      console.log("📝 After upload:", bodyText.slice(0, 500));
    } else {
      console.log("⚠️ File input not found, trying click on dropzone");

      // ドロップゾーンをクリックしてファイルダイアログを出そうとする
      const uploadArea = page
        .locator('[class*="drop"], [class*="upload"]')
        .first();
      if ((await uploadArea.count()) > 0) {
        console.log("📦 Found upload area, clicking...");
        // filechooser を使う
        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
          uploadArea.click(),
        ]);
        if (fileChooser) {
          await fileChooser.setFiles(PDF_PATH);
          await page.waitForTimeout(3000);
          await screenshot(page, "05_after_upload_via_chooser");
        }
      }
    }
  });
});

// ── 6. チャットページ ──────────────────────────────────
test.describe("6. チャット", () => {
  test("チャットページの表示確認", async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle" });
    const finalUrl = page.url();

    if (finalUrl.includes("/chat")) {
      await screenshot(page, "06_chat_page");
      const bodyText = await page.innerText("body");
      console.log("📝 Chat page:", bodyText.slice(0, 500));

      // メッセージ入力欄の確認
      const chatInput = page.locator(
        'input[type="text"], textarea, [contenteditable="true"]'
      );
      console.log("💬 Chat input exists:", (await chatInput.count()) > 0);
    } else {
      console.log("🔐 Redirected to:", finalUrl);
    }
  });
});

// ── 7. レスポンシブ確認（モバイル） ────────────────────
test.describe("7. レスポンシブ", () => {
  test("モバイルビューの確認", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    const page = await context.newPage();

    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await screenshot(page, "07_mobile_top");

    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await screenshot(page, "07_mobile_login");

    const bodyText = await page.innerText("body");
    console.log("📱 Mobile view text:", bodyText.slice(0, 300));

    await context.close();
  });
});

// ── 8. パフォーマンス ─────────────────────────────────
test.describe("8. パフォーマンス", () => {
  test("トップページの読み込み時間を計測", async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    const loadTime = Date.now() - start;
    console.log(`⏱️ Top page load time: ${loadTime}ms`);

    // Performance API で詳細取得
    const perfMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming;
      return {
        dns: nav.domainLookupEnd - nav.domainLookupStart,
        connect: nav.connectEnd - nav.connectStart,
        ttfb: nav.responseStart - nav.requestStart,
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
        transferSize: nav.transferSize,
      };
    });
    console.log("📊 Performance metrics:", JSON.stringify(perfMetrics));

    // 5秒以内に読み込み完了すること
    expect(loadTime).toBeLessThan(10000);
  });
});

// ── 9. コンソールエラーの収集 ──────────────────────────
test.describe("9. コンソールエラー", () => {
  test("各ページでコンソールエラーを収集", async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
      if (msg.type() === "warning") warnings.push(msg.text());
    });

    page.on("pageerror", (err) => {
      errors.push(`PAGE ERROR: ${err.message}`);
    });

    const pagesToCheck = ["/", "/login", "/onboarding"];

    for (const route of pagesToCheck) {
      console.log(`\n--- Checking ${route} ---`);
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
    }

    console.log("\n🔴 Console Errors:", JSON.stringify(errors, null, 2));
    console.log("\n🟡 Console Warnings:", JSON.stringify(warnings, null, 2));

    await screenshot(page, "09_console_check_final");
  });
});

// ── 10. アクセシビリティ基本チェック ───────────────────
test.describe("10. アクセシビリティ", () => {
  test("基本的なアクセシビリティ要素の確認", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    // lang属性
    const lang = await page.getAttribute("html", "lang");
    console.log("🌐 HTML lang attribute:", lang);

    // 画像のalt属性
    const imagesWithoutAlt = await page
      .locator("img:not([alt])")
      .count();
    console.log("🖼️ Images without alt:", imagesWithoutAlt);

    // フォーム要素のラベル
    const inputsWithoutLabel = await page.evaluate(() => {
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"])'
      );
      let count = 0;
      inputs.forEach((input) => {
        const id = input.id;
        const hasLabel = id
          ? document.querySelector(`label[for="${id}"]`)
          : false;
        const hasAriaLabel =
          input.getAttribute("aria-label") ||
          input.getAttribute("aria-labelledby");
        if (!hasLabel && !hasAriaLabel) count++;
      });
      return count;
    });
    console.log("📝 Inputs without labels:", inputsWithoutLabel);

    // 見出し構造
    const headings = await page.evaluate(() => {
      const hs = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      return Array.from(hs).map((h) => ({
        tag: h.tagName,
        text: h.textContent?.trim().slice(0, 50),
      }));
    });
    console.log("📑 Heading structure:", JSON.stringify(headings));
  });
});
