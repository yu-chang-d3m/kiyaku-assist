/**
 * Claude API クライアント（サーバーサイド専用）
 *
 * Anthropic SDK のラッパー。以下の機能を提供:
 * - シングルトン Claude クライアント
 * - モデル定数
 * - tool_use による構造化出力取得
 * - exponential backoff + jitter によるリトライ
 * - コンテンツハッシュ生成（キャッシュキー用）
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { logger } from "@/shared/observability/logger";

// ---------- クライアント ----------

let _client: Anthropic | null = null;

/**
 * Claude API クライアントを取得する（シングルトン）
 *
 * サーバーサイドでのみ使用すること。
 * ANTHROPIC_API_KEY 環境変数が必須。
 */
export function getClaudeClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。",
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

// ---------- モデル定数 ----------

/** 用途別のモデル定義 */
export const MODELS = {
  /** ギャップ分析・ドラフト生成 */
  ANALYSIS: "claude-sonnet-4-5-20250929" as const,
  /** 規約パース（高速・低コスト） */
  PARSE: "claude-haiku-4-5-20251001" as const,
  /** チャット Q&A */
  CHAT: "claude-sonnet-4-5-20250929" as const,
} as const;

// ---------- 構造化出力（tool_use） ----------

/** tool_use で構造化出力を取得するためのパラメータ */
interface StructuredOutputParams {
  /** 使用するモデル */
  model: string;
  /** システムプロンプト */
  system: string;
  /** ユーザーメッセージ */
  userMessage: string;
  /** ツール定義（出力スキーマ） */
  tool: {
    name: string;
    description: string;
    input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  };
  /** 最大トークン数（デフォルト: 4096） */
  maxTokens?: number;
}

/**
 * Claude の tool_use 機能を使って構造化 JSON 出力を取得する
 *
 * tool_choice で特定のツールを強制呼び出しし、
 * 入力パラメータを構造化データとして受け取る。
 *
 * @typeParam T - 期待する出力の型
 * @param params - リクエストパラメータ
 * @returns パースされた構造化データ
 */
export async function callWithStructuredOutput<T>(
  params: StructuredOutputParams,
): Promise<T> {
  const client = getClaudeClient();
  const maxTokens = params.maxTokens ?? 4096;

  logger.info(
    { model: params.model, toolName: params.tool.name },
    "Claude API を呼び出し（構造化出力）",
  );

  const response = await callWithRetry(async () => {
    return client.messages.create({
      model: params.model,
      max_tokens: maxTokens,
      system: params.system,
      messages: [{ role: "user", content: params.userMessage }],
      tools: [params.tool],
      tool_choice: { type: "tool", name: params.tool.name },
    }, { timeout: 90_000 }); // 90秒タイムアウト
  });

  // tool_use ブロックから入力を抽出
  const toolUseBlock = response.content.find((block) => block.type === "tool_use");

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error(
      `Claude がツール ${params.tool.name} を呼び出しませんでした。` +
        `stop_reason: ${response.stop_reason}`,
    );
  }

  return toolUseBlock.input as T;
}

// ---------- リトライ ----------

/**
 * exponential backoff + jitter でリトライする
 *
 * @param fn - 実行する非同期関数
 * @param maxRetries - 最大リトライ回数（デフォルト: 3）
 * @returns 関数の戻り値
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) break;

      // レート制限（429）やサーバーエラー（5xx）の場合のみリトライ
      if (!isRetryableError(error)) {
        throw lastError;
      }

      // exponential backoff + jitter
      const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      logger.warn(
        { attempt: attempt + 1, maxRetries, delayMs: Math.round(delay) },
        "リトライ待機中",
      );

      await sleep(delay);
    }
  }

  throw lastError ?? new Error("リトライ回数の上限に達しました");
}

// ---------- ハッシュ ----------

/**
 * コンテンツの SHA-256 ハッシュを生成する（キャッシュキー用）
 *
 * @param content - ハッシュ対象のテキスト
 * @returns 16進数のハッシュ文字列
 */
export function sha256Hash(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

// ---------- ユーティリティ ----------

/** リトライ可能なエラーかどうかを判定 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.InternalServerError) return true;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return true;

  // overloaded エラー（529）
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 429 || status === 529 || status >= 500;
  }

  // タイムアウト系エラー
  if (error instanceof Error && error.message.includes("timeout")) return true;

  return false;
}

/** 指定ミリ秒待機する */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
