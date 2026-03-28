/**
 * Playwright 認証セットアップ
 *
 * Firebase Auth は IndexedDB にセッションを保存するため、
 * Playwright の storageState（cookie + localStorage）だけでは認証状態を復元できない。
 *
 * そのため、このセットアップでは以下を行う:
 * 1. 認証情報を .auth/credentials.json に保存
 * 2. 空の storageState も保存（テスト実行の依存解決用）
 *
 * 各テストでは helpers/login.ts を使って都度ログインする。
 *
 * 環境変数:
 * - E2E_TEST_EMAIL: テスト用メールアドレス
 * - E2E_TEST_PASSWORD: テスト用パスワード
 */

import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";

const authDir = path.join(__dirname, "..", ".auth");
const authFile = path.join(authDir, "user.json");
const credFile = path.join(authDir, "credentials.json");

setup("認証情報を保存", async ({ page }) => {
  // .auth ディレクトリを作成
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    console.warn(
      "⚠️ E2E_TEST_EMAIL / E2E_TEST_PASSWORD が未設定のため認証セットアップをスキップします。",
    );
  }

  // 認証情報をファイルに保存（各テストで読み取ってログインする）
  fs.writeFileSync(
    credFile,
    JSON.stringify({ email: email || "", password: password || "" }),
  );

  // 空の storageState を保存（プロジェクト依存解決用）
  await page.context().storageState({ path: authFile });
});
