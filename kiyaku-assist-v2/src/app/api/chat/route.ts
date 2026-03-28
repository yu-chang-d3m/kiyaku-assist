/**
 * チャット API
 *
 * POST /api/chat
 * RAG ベースのチャット応答を生成する。
 * ユーザーの質問に対して Vertex AI Search で関連資料を検索し、
 * Claude で回答を生成して返却する。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { generateChatResponse } from "@/domains/chat/rag";
import { logger } from "@/shared/observability/logger";

/** リクエストボディのバリデーションスキーマ */
const chatRequestSchema = z.object({
  projectId: z.string().min(1, "プロジェクトIDは必須です"),
  message: z.string().min(1, "メッセージは空にできません"),
  history: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      timestamp: z.string(),
      references: z
        .array(
          z.object({
            source: z.enum(["standard_rules", "current_rules", "law", "commentary"]),
            ref: z.string(),
            excerpt: z.string(),
          }),
        )
        .optional(),
      filtered: z.boolean().optional(),
    }),
  ),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディの取得
    const body = await request.json();

    // Zod バリデーション
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "チャットリクエストのバリデーション失敗",
      );
      return NextResponse.json(
        {
          error:
            "バリデーションエラー: " +
            parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    }

    const { projectId, message, history } = parsed.data;

    logger.info({ projectId, messageLength: message.length }, "チャット API 呼び出し");

    // RAG ベースのチャット応答を生成
    const response = await generateChatResponse({
      projectId,
      message,
      history,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, "チャット応答の生成中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
