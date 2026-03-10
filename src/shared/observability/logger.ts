/**
 * Pino ベースの構造化ログ
 *
 * - 開発環境: pino-pretty で見やすく表示
 * - 本番環境: JSON 形式で出力（Cloud Logging 対応）
 *
 * 使用例:
 * ```ts
 * import { logger } from "@/shared/observability/logger";
 *
 * logger.info({ projectId, step: "analysis" }, "ギャップ分析を開始");
 * logger.error({ error, articleNum }, "ドラフト生成に失敗");
 * ```
 */

import pino from "pino";

/** 現在の実行環境 */
const isDevelopment = process.env.NODE_ENV !== "production";

/**
 * アプリケーション全体で使用する構造化ロガー
 *
 * Pino を使用し、以下の設定で初期化:
 * - level: 開発時は debug、本番は info
 * - 開発時は pino-pretty でカラー表示（transport 設定）
 * - 本番時は JSON 出力（Cloud Logging でパース可能）
 * - サービス名とバージョンをベースコンテキストに含める
 */
export const logger = pino({
  level: isDevelopment ? "debug" : "info",
  // 本番環境では JSON、開発環境では pino-pretty
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
  // ベースコンテキスト（全ログに含まれる）
  base: {
    service: "kiyaku-assist",
    version: process.env.npm_package_version ?? "0.1.0",
  },
  // タイムスタンプのフォーマット
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * 子ロガーを作成する（ドメイン/モジュール単位のコンテキスト付与）
 *
 * @param context - ログに追加するコンテキスト情報
 * @returns 子ロガーインスタンス
 *
 * @example
 * ```ts
 * const log = createChildLogger({ domain: "analysis", projectId });
 * log.info("分析を開始");
 * ```
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
