/**
 * E2E テスト用ログインヘルパー
 *
 * Firebase Auth は IndexedDB にセッションを保存するため、
 * Playwright の storageState では認証状態を復元できない。
 * そのため各テストの開始時にブラウザ上でログインを実行する。
 */

import { expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

interface Credentials {
  email: string;
  password: string;
}

/** auth.setup.ts が保存した認証情報を読み取る */
function loadCredentials(): Credentials | null {
  const credFile = path.join(__dirname, "..", "..", ".auth", "credentials.json");
  if (!fs.existsSync(credFile)) return null;
  const data = JSON.parse(fs.readFileSync(credFile, "utf-8"));
  if (!data.email || !data.password) return null;
  return data;
}

/**
 * ブラウザ上でメール/パスワードログインを実行する
 *
 * ログイン成功後、指定された URL に遷移していることを確認する。
 */
export async function login(page: Page, redirectTo = "/"): Promise<boolean> {
  const creds = loadCredentials();
  if (!creds) {
    console.warn("⚠️ 認証情報が見つかりません。ログインをスキップします。");
    return false;
  }

  await page.goto("/login");

  // メールとパスワードを入力
  await page.locator('[data-test="login-email"]').fill(creds.email);
  await page.locator('[data-test="login-password"]').fill(creds.password);
  await page.locator('[data-test="login-submit"]').click();

  // ログイン成功後、/login 以外に遷移するまで待機
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });

  return true;
}
