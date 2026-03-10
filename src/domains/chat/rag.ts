/**
 * RAG パイプライン — Vertex AI Search → Claude
 *
 * ユーザーの質問に対して:
 * 1. Vertex AI Search で関連する標準管理規約・法令を検索
 * 2. 検索結果をコンテキストとして Claude に渡して回答を生成
 * 3. ガードレールで回答を検査
 */

import { getClaudeClient, MODELS, callWithRetry } from "@/shared/ai/claude";
import { searchStandardRules } from "@/shared/ai/search";
import {
  checkUserMessage,
  checkAssistantResponse,
  buildGuardrailedSystemPrompt,
  DISCLAIMER_MESSAGE,
} from "@/domains/chat/guardrails";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatReference,
  GuardrailResult,
  RagContext,
} from "@/domains/chat/types";
import { logger } from "@/shared/observability/logger";

// ---------- 設定 ----------

/** RAG 検索の取得件数 */
const RAG_TOP_K = 5;

/** 会話履歴の最大メッセージ数 */
const MAX_HISTORY_MESSAGES = 10;

/** チャットのシステムプロンプト */
const CHAT_SYSTEM_PROMPT = `あなたは「キヤクアシスト」のチャットアシスタントです。
マンション管理規約の改定を支援するために、以下の知識を使って質問に回答してください。

## あなたの役割
- 令和7年改正の標準管理規約（単棟型）の内容を説明する
- 改正区分所有法（2025年10月施行）のポイントを解説する
- 管理規約の条文について一般的な情報を提供する
- 規約改定の進め方についてアドバイスする

## 回答のスタイル
- 専門用語は平易な言葉で補足する
- 根拠となる条文を明示する
- 200〜400文字程度で簡潔に回答する
- 不明な点は正直に「わかりません」と答える`;

// ---------- 公開 API ----------

/**
 * RAG ベースのチャット応答を生成する
 *
 * @param request - チャットリクエスト
 * @returns チャットレスポンス
 */
export async function generateChatResponse(
  request: ChatRequest,
): Promise<ChatResponse> {
  logger.info(
    { projectId: request.projectId, messageLength: request.message.length },
    "チャット応答を生成",
  );

  // 1. ガードレール: ユーザーメッセージの事前チェック
  const inputCheck = checkUserMessage(request.message);
  if (inputCheck.status === "blocked") {
    return buildBlockedResponse(inputCheck);
  }

  // 2. RAG: 関連ドキュメントを検索
  const ragContext = await retrieveContext(request.message);

  // 3. Claude で回答を生成
  const answer = await generateAnswer(request, ragContext, inputCheck);

  // 4. ガードレール: AI 回答の事後チェック
  const outputCheck = checkAssistantResponse(answer.content);
  const finalGuardrail = mergeGuardrailResults(inputCheck, outputCheck);

  // ガードレール警告がある場合、免責メッセージを追加
  if (finalGuardrail.legalAdviceRisk) {
    answer.content += "\n\n" + DISCLAIMER_MESSAGE;
    answer.filtered = true;
  }

  return {
    message: answer,
    guardrailResult: finalGuardrail,
  };
}

// ---------- 内部処理 ----------

/**
 * Vertex AI Search で関連コンテキストを取得する
 */
async function retrieveContext(query: string): Promise<RagContext> {
  try {
    const results = await searchStandardRules(query, RAG_TOP_K);
    return {
      query,
      documents: results.map((r) => ({
        content: r.content,
        source: r.metadata["ref"] ?? "標準管理規約",
        relevanceScore: r.relevanceScore,
      })),
    };
  } catch (error) {
    logger.warn({ error }, "Vertex AI Search からの取得に失敗、コンテキストなしで回答");
    return { query, documents: [] };
  }
}

/**
 * Claude でチャット回答を生成する
 */
async function generateAnswer(
  request: ChatRequest,
  ragContext: RagContext,
  guardrailResult: GuardrailResult,
): Promise<ChatMessage> {
  const client = getClaudeClient();

  // コンテキストの構築
  const contextText = ragContext.documents.length > 0
    ? ragContext.documents
        .map((d) => `【${d.source}】\n${d.content}`)
        .join("\n\n---\n\n")
    : "（関連する資料が見つかりませんでした）";

  // ガードレール警告がある場合、追加の注意を促す
  const guardrailNote = guardrailResult.legalAdviceRisk
    ? "\n\n⚠️ ユーザーの質問に法的助言を求める意図が含まれている可能性があります。情報提供に徹し、法的判断は避けてください。"
    : "";

  const systemPrompt = buildGuardrailedSystemPrompt(CHAT_SYSTEM_PROMPT) + guardrailNote;

  // 会話履歴の構築（直近 N 件）
  const recentHistory = request.history.slice(-MAX_HISTORY_MESSAGES);
  const messages = [
    ...recentHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    {
      role: "user" as const,
      content: `## 関連資料\n${contextText}\n\n## 質問\n${request.message}`,
    },
  ];

  const response = await callWithRetry(async () => {
    return client.messages.create({
      model: MODELS.CHAT,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
  });

  // レスポンスからテキストを抽出
  const textContent = response.content.find((c) => c.type === "text");
  const answerText = textContent ? textContent.text : "回答を生成できませんでした。";

  // 参照情報の構築
  const references: ChatReference[] = ragContext.documents
    .filter((d) => d.relevanceScore >= 0.5)
    .map((d) => ({
      source: "standard_rules" as const,
      ref: d.source,
      excerpt: d.content.slice(0, 100),
    }));

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: answerText,
    timestamp: new Date().toISOString(),
    references,
  };
}

/**
 * ブロックされた場合のレスポンスを生成する
 */
function buildBlockedResponse(guardrailResult: GuardrailResult): ChatResponse {
  return {
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `申し訳ございませんが、この質問にはお答えすることができません。\n\n${guardrailResult.reason}\n\n${DISCLAIMER_MESSAGE}`,
      timestamp: new Date().toISOString(),
      filtered: true,
    },
    guardrailResult,
  };
}

/**
 * ガードレール結果をマージする
 */
function mergeGuardrailResults(
  input: GuardrailResult,
  output: GuardrailResult,
): GuardrailResult {
  // どちらかが blocked なら blocked
  if (input.status === "blocked" || output.status === "blocked") {
    return {
      status: "blocked",
      reason: input.reason || output.reason,
      legalAdviceRisk: true,
    };
  }
  // どちらかが warning なら warning
  if (input.status === "warning" || output.status === "warning") {
    return {
      status: "warning",
      reason: input.reason || output.reason,
      legalAdviceRisk: true,
    };
  }
  return { status: "pass", legalAdviceRisk: false };
}
