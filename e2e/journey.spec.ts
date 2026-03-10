import { test, expect } from "@playwright/test";

test.describe("ユーザージャーニー", () => {
  test("ランディングページが表示される", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/キヤクアシスト/);
  });

  test.skip("オンボーディング → ガイド → アップロードの遷移", async ({ page }) => {
    // Phase 2 で実装
  });
});
