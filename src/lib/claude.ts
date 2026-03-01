import Anthropic from "@anthropic-ai/sdk";

// サーバーサイドのみで使用（API Route から呼び出す）
export function getClaudeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

// モデル定義
export const MODELS = {
  ANALYSIS: "claude-sonnet-4-5-20250929" as const, // ギャップ分析・ドラフト生成
  PARSE: "claude-haiku-4-5-20251001" as const, // 規約パース
  CHAT: "claude-sonnet-4-5-20250929" as const, // チャットQ&A
};
