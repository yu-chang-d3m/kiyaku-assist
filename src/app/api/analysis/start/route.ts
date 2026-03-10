/**
 * ギャップ分析開始 API（SSE ストリーミング）
 *
 * POST /api/analysis/start
 * 管理規約の条文リストを受け取り、標準管理規約との差分分析を実行する。
 * 進捗は Server-Sent Events (SSE) でリアルタイムに返却する。
 */

import { NextRequest } from "next/server";
import * as z from "zod/v4";
import { retrieveRelatedStandards } from "@/domains/analysis/retriever";
import { analyzeGaps } from "@/domains/analysis/analyzer";
import { logger } from "@/shared/observability/logger";

/** リクエストボディのバリデーションスキーマ */
const analysisRequestSchema = z.object({
  projectId: z.string().min(1, "プロジェクトIDは必須です"),
  articles: z
    .array(
      z.object({
        articleNum: z.string().min(1, "条文番号は必須です"),
        category: z.string().min(1, "カテゴリは必須です"),
        currentText: z.string().nullable(),
      }),
    )
    .min(1, "条文は1件以上必要です"),
});

export async function POST(request: NextRequest) {
  let validatedData: z.infer<typeof analysisRequestSchema>;
  try {
    const body = await request.json();
    const parsed = analysisRequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "分析リクエストのバリデーション失敗",
      );
      return new Response(
        JSON.stringify({
          error:
            "バリデーションエラー: " +
            parsed.error.issues.map((i) => i.message).join(", "),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    validatedData = parsed.data;
  } catch {
    return new Response(
      JSON.stringify({ error: "リクエストボディの解析に失敗しました" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { projectId, articles } = validatedData;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const total = articles.length;
        logger.info({ projectId, totalArticles: total }, "ギャップ分析を開始");

        // 各条文に対して関連標準条文を取得（進捗を送信）
        const articlesWithDocs = [];
        for (let i = 0; i < articles.length; i++) {
          const article = articles[i];
          send("progress", {
            current: i + 1,
            total,
            articleNum: article.articleNum,
          });

          const retrievalResult = await retrieveRelatedStandards(
            article.currentText ?? "",
          );

          articlesWithDocs.push({
            articleNum: article.articleNum,
            category: article.category,
            currentText: article.currentText,
            relatedDocs: retrievalResult.results,
          });
        }

        // 分析を一括実行
        const analysisResult = await analyzeGaps(projectId, articlesWithDocs);

        logger.info(
          { projectId, analyzedCount: analysisResult.items.length },
          "ギャップ分析が完了",
        );

        send("complete", analysisResult);
      } catch (error) {
        logger.error({ projectId, error }, "ギャップ分析中にエラーが発生");
        send("error", {
          message:
            error instanceof Error
              ? error.message
              : "不明なエラーが発生しました",
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
