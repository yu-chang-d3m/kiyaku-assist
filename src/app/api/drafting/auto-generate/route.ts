/**
 * 自動ドラフト一括生成 API（SSE ストリーミング）
 *
 * POST /api/drafting/auto-generate
 * 分析完了後に自動実行。Firestore の ReviewArticle を読み取り、
 * ドラフト未生成の条文に対してドラフトを生成し、Firestore に保存する。
 *
 * リクエストボディ:
 *   projectId: string
 *   mode: "smart" | "precise" (デフォルト: "smart")
 *   condoContext: { condoName, condoType, unitCount }
 *
 * SSE イベント:
 *   progress: { current, total, articleNum, phase }
 *   complete: { drafts: DraftResult[], failures: DraftFailure[], generatedAt }
 *   error: { message }
 */

import { NextRequest } from "next/server";
import * as z from "zod/v4";
import {
  getReviewArticles,
  batchSaveReviewArticles,
} from "@/shared/db/server-actions";
import { retrieveRelatedStandards } from "@/domains/analysis/retriever";
import { generateDraftsWithStrategy } from "@/domains/drafting/drafter";
import type { DraftRequest } from "@/domains/drafting/types";
import { logger } from "@/shared/observability/logger";

const autoGenerateSchema = z.object({
  projectId: z.string().min(1),
  mode: z.enum(["smart", "precise"]).default("smart"),
  condoContext: z.object({
    condoName: z.string().min(1),
    condoType: z.enum(["corporate", "non-corporate", "unknown"]),
    unitCount: z.enum(["small", "medium", "large", "xlarge"]),
  }),
});

export async function POST(request: NextRequest) {
  let validatedData: z.infer<typeof autoGenerateSchema>;
  try {
    const body = await request.json();
    const parsed = autoGenerateSchema.safeParse(body);
    if (!parsed.success) {
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

  const { projectId, mode, condoContext } = validatedData;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      try {
        // 1. Firestore から ReviewArticle を取得
        const articles = await getReviewArticles(projectId);

        // ドラフト未生成の条文をフィルタ
        const needsDraft = articles.filter(
          (a) => !a.draft || a.draft.trim() === "",
        );

        if (needsDraft.length === 0) {
          send("complete", {
            drafts: [],
            failures: [],
            generatedAt: new Date().toISOString(),
          });
          return;
        }

        const total = needsDraft.length;
        logger.info({ projectId, mode, total }, "自動ドラフト生成を開始");

        send("progress", {
          current: 0,
          total,
          articleNum: "標準管理規約を検索中...",
          phase: "retrieval",
        });

        // 2. リトリーバーで標準管理規約テキストを取得
        const retrievalPromises = needsDraft.map(async (article) => {
          const queryText = article.original ?? article.summary;
          const retrieval = await retrieveRelatedStandards(queryText);
          return {
            article,
            standardText: retrieval.results[0]?.content ?? "",
          };
        });

        // 並列で取得（3並列）
        const articlesWithStandard: Array<{
          article: (typeof needsDraft)[0];
          standardText: string;
        }> = [];
        for (let i = 0; i < retrievalPromises.length; i += 3) {
          const batch = retrievalPromises.slice(i, i + 3);
          const results = await Promise.all(batch);
          articlesWithStandard.push(...results);
        }

        send("progress", {
          current: 0,
          total,
          articleNum: "ドラフト生成を開始...",
          phase: "generation",
        });

        // 3. DraftRequest を構築
        const draftRequests: DraftRequest[] = articlesWithStandard.map(
          ({ article, standardText }) => ({
            articleNum: article.articleNum,
            category: article.category,
            currentText: article.original,
            standardText,
            gapSummary: article.summary,
            importance: article.importance,
            condoContext,
          }),
        );

        // 4. 重要度別バッチ戦略でドラフト生成
        const result = await generateDraftsWithStrategy(
          draftRequests,
          mode,
          (completedCount, totalCount, articleNum, phase) => {
            send("progress", {
              current: completedCount,
              total: totalCount,
              articleNum,
              phase,
            });
          },
        );

        // 5. 成功したドラフトを Firestore にバッチ保存
        const reviewUpdates = result.drafts
          .map((draft) => {
            const original = articles.find(
              (a) => a.articleNum === draft.articleNum,
            );
            if (!original) return null;

            const aiRecommendation =
              draft.importance === "optional"
                ? ("pending" as const)
                : ("adopted" as const);

            return {
              projectId,
              chapter: original.chapter,
              articleNum: draft.articleNum,
              original: original.original,
              draft: draft.draft,
              summary: draft.summary,
              explanation: draft.explanation,
              importance: draft.importance,
              baseRef: draft.baseRef,
              decision: null as "adopted" | "modified" | "pending" | null,
              modificationHistory: [] as string[],
              memo: original.memo || "",
              category: draft.category,
              aiRecommendation,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        if (reviewUpdates.length > 0) {
          await batchSaveReviewArticles(projectId, reviewUpdates);
        }

        logger.info(
          {
            projectId,
            successCount: result.drafts.length,
            failureCount: result.failures.length,
          },
          "自動ドラフト生成完了",
        );

        send("complete", result);
      } catch (error) {
        logger.error(
          { projectId, error },
          "自動ドラフト生成中にエラーが発生",
        );
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
