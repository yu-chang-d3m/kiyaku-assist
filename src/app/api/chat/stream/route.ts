/**
 * チャットストリーミング API（SSE）
 *
 * POST /api/chat/stream
 * Server-Sent Events を使用して、チャット応答をストリーミングで返却する。
 * 現時点では generateChatResponse() の結果を擬似ストリーミングで送信する。
 *
 * SSE イベント:
 *   - thinking: 処理ステータスの通知（searching / generating）
 *   - message: 生成されたチャットレスポンス（ChatResponse）
 *   - done: ストリーム完了
 *   - error: エラー発生時のメッセージ
 */

import { NextRequest } from "next/server";
import * as z from "zod/v4";
import { generateChatResponse } from "@/domains/chat/rag";
import { logger } from "@/shared/observability/logger";

/** リクエストボディのバリデーションスキーマ */
const streamChatRequestSchema = z.object({
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
  // リクエストボディの取得とバリデーション（ストリーム開始前に行う）
  let validatedData: z.infer<typeof streamChatRequestSchema>;
  try {
    const body = await request.json();
    const parsed = streamChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "ストリーミングチャットリクエストのバリデーション失敗",
      );
      return new Response(
        JSON.stringify({
          error:
            "バリデーションエラー: " +
            parsed.error.issues.map((i) => i.message).join(", "),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    validatedData = parsed.data;
  } catch {
    return new Response(
      JSON.stringify({ error: "リクエストボディの解析に失敗しました" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { projectId, message, history } = validatedData;

  // SSE ストリームの作成
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      /** SSE イベントを送信するヘルパー */
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      try {
        logger.info(
          { projectId, messageLength: message.length },
          "ストリーミングチャット開始",
        );

        // 検索中ステータスを通知
        send("thinking", { status: "searching" });

        // 生成中ステータスを通知
        send("thinking", { status: "generating" });

        // RAG ベースのチャット応答を生成（擬似ストリーミング）
        const response = await generateChatResponse({
          projectId,
          message,
          history,
        });

        // 生成結果を送信
        send("message", response);

        // 完了通知
        send("done", {});

        logger.info({ projectId }, "ストリーミングチャット完了");
      } catch (error) {
        logger.error(
          { projectId, error },
          "ストリーミングチャット中にエラーが発生",
        );

        send("error", {
          message:
            error instanceof Error ? error.message : "不明なエラーが発生しました",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
