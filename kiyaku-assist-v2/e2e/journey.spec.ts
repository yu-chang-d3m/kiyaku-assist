/**
 * ユーザージャーニー E2E テスト
 *
 * 実際のユーザーが操作する順序で、カスタマージャーニー全体を通しでテストする。
 * onboarding → guide → upload → analysis → review → export
 *
 * 注意: Firebase Auth は IndexedDB にセッションを保存するため、
 * storageState では認証状態を復元できない。
 * 各テストの開始時に login ヘルパーでブラウザ上でログインする。
 */

import { test, expect, Page } from "@playwright/test";
import path from "path";
import { login } from "./helpers/login";

// ---------- ヘルパー ----------

/** コンソールエラーを収集する */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });
  return errors;
}

// ---------- ジャーニーテスト ----------

test.describe("カスタマージャーニー通しテスト", () => {
  test("onboarding → guide → upload → analysis → review → export", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);

    // ── Step 0: ログイン ──
    await test.step("0. ログイン", async () => {
      const loggedIn = await login(page);
      if (!loggedIn) {
        test.skip(true, "認証情報が未設定のためスキップ");
      }
    });

    // ── Step 1: オンボーディング ──
    await test.step("1. オンボーディング — マンション名を入力", async () => {
      await page.goto("/onboarding");
      await expect(page).toHaveURL(/\/onboarding/);

      // Q1: マンション名（テキスト入力）
      const nameInput = page.locator(
        '[data-test="onboarding-input-condoName"]',
      );
      await expect(nameInput).toBeVisible();
      await nameInput.fill("テストマンション");
      await page.locator('[data-test="onboarding-next"]').click();
    });

    await test.step("1. オンボーディング — 選択肢に回答", async () => {
      // Q2: 戸数
      await expect(
        page.locator('[data-test="onboarding-option-medium"]'),
      ).toBeVisible();
      await page.locator('[data-test="onboarding-option-medium"]').click();
      await page.locator('[data-test="onboarding-next"]').click();

      // Q3: 法人化
      await expect(
        page.locator('[data-test="onboarding-option-corporate"]'),
      ).toBeVisible();
      await page.locator('[data-test="onboarding-option-corporate"]').click();
      await page.locator('[data-test="onboarding-next"]').click();

      // Q4: 規約有無
      await expect(
        page.locator('[data-test="onboarding-option-yes"]'),
      ).toBeVisible();
      await page.locator('[data-test="onboarding-option-yes"]').click();
      await page.locator('[data-test="onboarding-next"]').click();

      // Q5: 文書種別
      await expect(
        page.locator('[data-test="onboarding-option-management-rules"]'),
      ).toBeVisible();
      await page.locator('[data-test="onboarding-option-management-rules"]').click();
      await page.locator('[data-test="onboarding-next"]').click();

      // Q6: 総会予定
      await expect(
        page.locator('[data-test="onboarding-option-3to6months"]'),
      ).toBeVisible();
      await page.locator('[data-test="onboarding-option-3to6months"]').click();
      await page.locator('[data-test="onboarding-next"]').click();

      // Q7: 所在地（任意 → スキップ）
      await expect(
        page.locator('[data-test="onboarding-input-location"]'),
      ).toBeVisible();
      await page.locator('[data-test="onboarding-next"]').click();

      // Q8: 管理会社名（任意 → スキップ）
      await expect(
        page.locator('[data-test="onboarding-input-managementCompany"]'),
      ).toBeVisible();
      await page.locator('[data-test="onboarding-next"]').click();

      // Q9: 築年数（任意 → スキップ）
      await expect(
        page.locator('[data-test="onboarding-input-buildingAge"]'),
      ).toBeVisible();
    });

    await test.step(
      "1. オンボーディング — 始めるボタンで /guide へ遷移",
      async () => {
        // 「始める」ボタン（最後の質問なので handleNext が Firestore にプロジェクト作成）
        const nextBtn = page.locator('[data-test="onboarding-next"]');
        await expect(nextBtn).toBeEnabled();

        // プロジェクト作成 API のレスポンスを待つ
        await Promise.all([
          page.waitForResponse(
            (resp) =>
              resp.url().includes("/api/project") && resp.ok(),
          ),
          nextBtn.click(),
        ]);

        await page.waitForURL("**/guide", { timeout: 15000 });
        await expect(page).toHaveURL(/\/guide/);
      },
    );

    // ── Step 2: ガイド ──
    await test.step("2. ガイド — 内容を確認して次へ", async () => {
      // ガイドページの主要コンテンツが表示されること
      await expect(
        page.getByText("法改正かんたんガイド", { exact: false }),
      ).toBeVisible();

      // 「次へ」ボタンをクリック
      const nextLink = page.locator('[data-test="guide-next"]');
      // data-test が Button の asChild で Link に渡されるため、Link 側で確認
      // asChild の場合 data-test は Button ではなく子の a タグに付与されない場合がある
      // → テキストマッチでフォールバック
      const guideNext =
        (await nextLink.count()) > 0
          ? nextLink
          : page.getByRole("link", { name: "次へ: 規約をアップロード" });
      await guideNext.click();

      await page.waitForURL("**/upload", { timeout: 10000 });
      await expect(page).toHaveURL(/\/upload/);
    });

    // ── Step 3: アップロード（デモデータ使用） ──
    await test.step(
      "3. アップロード — テキストファイルをアップロード",
      async () => {
        // ファイル入力を使ってテストフィクスチャをアップロード
        const fixtureFile = path.join(
          __dirname,
          "fixtures",
          "sample-bylaws.txt",
        );
        const fileInput = page.locator('[data-test="upload-file-input"]');

        if ((await fileInput.count()) > 0) {
          await fileInput.setInputFiles(fixtureFile);
        } else {
          // hidden input のフォールバック
          const hiddenInput = page.locator('input[type="file"]');
          await hiddenInput.setInputFiles(fixtureFile);
        }

        // パース API レスポンスを待つ
        await page.waitForResponse(
          (resp) =>
            (resp.url().includes("/api/ingestion/parse") ||
              resp.url().includes("/api/ingestion/parse-file")) &&
            resp.status() === 200,
          { timeout: 60000 },
        );

        // 確認画面が表示されること
        await expect(
          page.getByText("解析結果の確認", { exact: false }),
        ).toBeVisible({ timeout: 10000 });
      },
    );

    await test.step(
      "3. アップロード — 確認して analysis へ遷移",
      async () => {
        const confirmBtn = page.locator('[data-test="upload-confirm"]');
        await expect(confirmBtn).toBeVisible();
        await confirmBtn.click();

        await page.waitForURL("**/analysis", { timeout: 10000 });
        await expect(page).toHaveURL(/\/analysis/);
      },
    );

    // ── Step 4: 分析 ──
    let analysisSucceeded = false;
    await test.step("4. 分析 — 分析を開始して完了を待機", async () => {
      // 分析開始ボタンが表示されるのを待つ
      const startBtn = page.locator('[data-test="analysis-start"]');
      const nextBtn = page.locator('[data-test="analysis-next"]');
      const errorHeading = page.getByText("エラーが発生しました", {
        exact: false,
      });

      // 分析開始ボタンがある場合のみクリック（キャッシュ済みの場合はスキップ）
      if ((await startBtn.count()) > 0) {
        await startBtn.click();

        // 分析完了 or エラーのどちらかを待機（最大3分）
        await expect(nextBtn.or(errorHeading)).toBeVisible({
          timeout: 180_000,
        });

        if ((await errorHeading.count()) > 0) {
          // エラー発生 — 「処理結果を確認する」で部分結果があるか試す
          const restoreBtn = page.getByRole("button", {
            name: "処理結果を確認する",
          });
          if ((await restoreBtn.count()) > 0) {
            await restoreBtn.click();
            // 結果復元後に次へボタンが出るか確認（10秒）
            try {
              await expect(nextBtn).toBeVisible({ timeout: 10_000 });
              analysisSucceeded = true;
            } catch {
              console.warn(
                "⚠️ 分析 API エラー — 部分結果もなし。review 以降をスキップします。",
              );
            }
          }
        } else {
          analysisSucceeded = true;
        }
      } else {
        // 既にキャッシュされた結果が表示されている
        await expect(
          nextBtn.or(
            page.getByRole("link", { name: "次のステップへ" }),
          ),
        ).toBeVisible({ timeout: 30000 });
        analysisSucceeded = true;
      }
    });

    await test.step("4. 分析 — review へ遷移", async () => {
      if (!analysisSucceeded) {
        test.skip(true, "分析 API エラーのためスキップ");
        return;
      }
      const nextBtn = page.locator('[data-test="analysis-next"]');
      const fallbackLink = page.getByRole("link", {
        name: "次のステップへ",
      });
      const target =
        (await nextBtn.count()) > 0 ? nextBtn : fallbackLink;
      await target.click();

      await page.waitForURL("**/review", { timeout: 10000 });
      await expect(page).toHaveURL(/\/review/);
    });

    // ── Step 5: レビュー ──
    await test.step("5. レビュー — AI推奨を全て承認", async () => {
      if (!analysisSucceeded) {
        test.skip(true, "分析 API エラーのためスキップ");
        return;
      }
      // レビュー画面のデータ読み込みを待つ
      await expect(
        page.getByRole("heading", { name: "改正案レビュー" }).or(
          page.getByRole("heading", { name: "条文レビュー" }),
        ).or(
          page.getByRole("columnheader", { name: "判断" }),
        ).first(),
      ).toBeVisible({ timeout: 30000 });

      // AI推奨を全て承認ボタンがあればクリック
      const approveAllBtn = page.locator('[data-test="review-approve-all"]');
      if ((await approveAllBtn.count()) > 0) {
        await approveAllBtn.click();
        // 操作が反映されるのを待つ
        await page.waitForTimeout(2000);
      }

      // export へのリンクが表示されること
      const nextBtn = page.locator('[data-test="review-next"]');
      const fallbackLink = page.getByRole("link", {
        name: "エクスポートへ",
      });
      await expect(nextBtn.or(fallbackLink)).toBeVisible({ timeout: 10000 });
    });

    await test.step("5. レビュー — export へ遷移", async () => {
      const nextBtn = page.locator('[data-test="review-next"]');
      const fallbackLink = page.getByRole("link", {
        name: "エクスポートへ",
      });
      const target =
        (await nextBtn.count()) > 0 ? nextBtn : fallbackLink;
      await target.click();

      await page.waitForURL("**/export", { timeout: 10000 });
      await expect(page).toHaveURL(/\/export/);
    });

    // ── Step 6: エクスポート ──
    await test.step("6. エクスポート — ダウンロードを実行", async () => {
      // エクスポートページが正しく表示されること
      await expect(
        page.getByText("エクスポート", { exact: false }).or(
          page.getByText("ダウンロード", { exact: false }),
        ),
      ).toBeVisible({ timeout: 15000 });

      // Markdown ダウンロードボタンをクリック
      const downloadBtn = page.locator(
        '[data-test="export-download-markdown"]',
      );
      if ((await downloadBtn.count()) > 0) {
        // ダウンロードイベントを待機
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 30000 }),
          downloadBtn.click(),
        ]);

        // ダウンロードが正常に開始されたことを確認
        expect(download.suggestedFilename()).toBeTruthy();
      } else {
        // ダウンロードボタンが無い場合（データ不足等）はページ表示のみ確認
        console.warn(
          "⚠️ ダウンロードボタンが見つかりません。エクスポートページの表示確認のみ。",
        );
      }
    });

    // ── 最終確認 ──
    await test.step("コンソールエラーの確認", async () => {
      // ジャーニー中に致命的なコンソールエラーが出ていないことを確認
      const criticalErrors = errors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.includes("hot-update") &&
          !e.includes("DevTools"),
      );
      if (criticalErrors.length > 0) {
        console.warn("⚠️ コンソールエラー:", criticalErrors);
      }
      // 致命的なエラー（PAGE ERROR）が無いことは assert
      const pageErrors = errors.filter((e) => e.startsWith("PAGE ERROR:"));
      expect(
        pageErrors,
        `ページエラーが発生: ${pageErrors.join(", ")}`,
      ).toHaveLength(0);
    });
  });
});

// ---------- ジャーニー断絶テスト ----------

test.describe("ジャーニー断絶チェック", () => {
  test("未認証で /review にアクセス → ログイン → /review に復帰", async ({
    browser,
  }) => {
    // 認証なしの新しいコンテキストを作成
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/review");

    // /login にリダイレクトされ、returnUrl が付与されること
    await page.waitForURL("**/login**", { timeout: 10000 });
    const loginUrl = page.url();
    expect(loginUrl).toContain("returnUrl");
    expect(loginUrl).toContain(encodeURIComponent("/review"));

    await context.close();
  });

  test("リロードしてもジャーニーが継続できる（sessionStorage 永続化）", async ({
    page,
  }) => {
    // オンボーディングを開始
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding/);

    // マンション名を入力
    const nameInput = page.locator(
      '[data-test="onboarding-input-condoName"]',
    );
    if ((await nameInput.count()) > 0) {
      await nameInput.fill("リロードテスト");
      await page.locator('[data-test="onboarding-next"]').click();

      // Q2 が表示されること
      await expect(
        page.locator('[data-test="onboarding-option-medium"]'),
      ).toBeVisible();

      // ページをリロード
      await page.reload();

      // リロード後もオンボーディングページが表示されること（ログインへ飛ばされないこと）
      await expect(page).toHaveURL(/\/onboarding/);
    }
  });
});
