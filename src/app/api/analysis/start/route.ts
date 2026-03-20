/**
 * ギャップ分析開始 API（SSE ストリーミング）
 *
 * POST /api/analysis/start
 * 管理規約の条文リストを受け取り、標準管理規約との差分分析を実行する。
 * 進捗は Server-Sent Events (SSE) でリアルタイムに返却する。
 *
 * v2.1: バッチ分析対応 — 最大10条文をまとめて1回のClaude API呼び出しで分析し、
 * 処理速度を約4倍に改善。
 */

import { NextRequest } from "next/server";
import * as z from "zod/v4";
import { batchRetrieve } from "@/domains/analysis/retriever";
import { analyzeGaps } from "@/domains/analysis/analyzer";
import { batchSaveReviewArticles } from "@/shared/db/server-actions";
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
        logger.info({ projectId, totalArticles: total }, "ギャップ分析を開始（バッチモード）");

        // Phase 1: 関連条文をバッチ検索（3 並列）
        send("progress", {
          current: 0,
          total,
          articleNum: "関連条文を検索中...",
        });

        const retrievalResults = await batchRetrieve(
          articles.map((a) => a.currentText ?? ""),
        );

        // 条文データと検索結果を結合
        const articlesWithDocs = articles.map((article, i) => ({
          articleNum: article.articleNum,
          category: article.category,
          currentText: article.currentText,
          relatedDocs: retrievalResults[i]?.results ?? [],
        }));

        // Phase 2: バッチ分析（進捗コールバック付き）
        const analysisResult = await analyzeGaps(
          projectId,
          articlesWithDocs,
          (completedCount, totalCount, batchArticleNums) => {
            const first = batchArticleNums[0];
            const last = batchArticleNums[batchArticleNums.length - 1];
            send("progress", {
              current: completedCount,
              total: totalCount,
              articleNum: `${first}〜${last} 分析完了`,
            });
          },
        );

        logger.info(
          { projectId, analyzedCount: analysisResult.items.length },
          "ギャップ分析が完了",
        );

        // Phase 3: 分析結果を Firestore に ReviewArticle として保存
        try {
          const reviewArticles = analysisResult.items.map((item) => ({
            projectId,
            chapter: 0,
            articleNum: item.articleNum,
            original: item.currentText ?? null,
            draft: "",
            summary: item.gapSummary,
            explanation: item.rationale,
            importance: item.importance,
            baseRef: item.standardRef,
            decision: null as "adopted" | "modified" | "pending" | null,
            modificationHistory: [] as string[],
            memo: "",
            category: item.category,
          }));

          await batchSaveReviewArticles(projectId, reviewArticles);
          logger.info(
            { projectId, savedCount: reviewArticles.length },
            "分析結果を Firestore に保存完了",
          );
        } catch (saveError) {
          logger.error(
            { projectId, error: saveError },
            "分析結果の Firestore 保存に失敗（結果は SSE で返却済み）",
          );
        }

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
