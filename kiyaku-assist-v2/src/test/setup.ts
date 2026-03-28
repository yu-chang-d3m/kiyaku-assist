/**
 * テストセットアップ
 *
 * 全テストで共通の初期化処理を定義する。
 * - jest-dom マッチャーの拡張
 * - 環境変数のデフォルト設定
 * - console.error/warn の監視（予期しないエラーをテスト失敗にする）
 * - 各テスト後のモックリセット
 */

import '@testing-library/jest-dom';
import { afterEach, beforeAll, vi } from 'vitest';

// ---------- 環境変数のデフォルト ----------

beforeAll(() => {
  // @ts-expect-error -- NODE_ENV is typed as read-only but writable at runtime
  process.env.NODE_ENV = 'test';
  // テスト環境では API キーをダミー値に設定
  process.env.ANTHROPIC_API_KEY ??= 'test-api-key-dummy';
});

// ---------- console.error/warn の監視 ----------

/**
 * テスト中に予期しない console.error / console.warn が呼ばれた場合、
 * テストを失敗させる。特定のメッセージを許可するには allowedPatterns に追加する。
 */
const allowedPatterns: RegExp[] = [
  // React の既知の警告など、無視してよいパターンをここに追加
  /Warning.*ReactDOM\.render/,
  /act\(\.\.\.\)/,
];

function isAllowed(args: unknown[]): boolean {
  const message = args.map(String).join(' ');
  return allowedPatterns.some((pattern) => pattern.test(message));
}

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (!isAllowed(args)) {
      originalConsoleError(...args);
      throw new Error(
        `予期しない console.error が検出されました: ${args.map(String).join(' ')}`,
      );
    }
  };

  console.warn = (...args: unknown[]) => {
    if (!isAllowed(args)) {
      originalConsoleWarn(...args);
      throw new Error(
        `予期しない console.warn が検出されました: ${args.map(String).join(' ')}`,
      );
    }
  };
});

// ---------- 各テスト後のクリーンアップ ----------

afterEach(() => {
  // すべてのモックをリセット（実装は維持、呼び出し履歴をクリア）
  vi.restoreAllMocks();
  // タイマーモックをリセット
  vi.useRealTimers();
});
