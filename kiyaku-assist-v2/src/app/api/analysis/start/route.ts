/**
 * ギャップ分析開始 API（SSE ストリーミング）
 *
 * POST /api/analysis/start
 * 管理規約の条文リストを受け取り、標準管理規約との差分分析を実行する。
 * 進捗は Server-Sent Events (SSE) でリアルタイムに返却する。
 * 所有者のみアクセス可能。
 *
 * v2.1: バッチ分析対応 — 最大10条文をまとめて1回のClaude API呼び出しで分析し、
 * 処理速度を約4倍に改善。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { batchRetrieve } from "@/domains/analysis/retriever";
import { analyzeGaps, type DocumentType } from "@/domains/analysis/analyzer";
import { batchSaveReviewArticles, getProject, getStandardArticles } from "@/shared/db/server-actions";
import { inferChapterFromCategory } from "@/shared/db/chapter-utils";
import { logger } from "@/shared/observability/logger";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

/** リクエストボディのバリデーションスキーマ */
const analysisRequestSchema = z.object({
  projectId: z.string().min(1, "プロジェクトIDは必須です"),
  articles: z
    .array(
      z.object({
        articleNum: z.string().min(1, "条文番号は必須です"),
        category: z.string().default("その他"),
        currentText: z.string().nullable(),
      }),
    )
    .min(1, "条文は1件以上必要です"),
});

export async function POST(request: NextRequest) {
  // 認証チェック（ストリーム開始前）
  const auth = await verifyAuth(request);
  if (auth instanceof NextResponse) return auth;

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

  // プロジェクト所有者チェック
  const ownerCheck = await verifyProjectOwner(projectId, auth.uid);
  if (ownerCheck instanceof NextResponse) return ownerCheck;

  // Project から documentType を取得
  let documentType: DocumentType = "management-rules";
  try {
    const project = await getProject(projectId);
    if (project?.documentType) {
      documentType = project.documentType;
    }
  } catch (err) {
    logger.warn({ projectId, err }, "Project の取得に失敗、デフォルトの documentType を使用");
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller が閉じている場合は無視
        }
      };

      // SSE keepalive: 15秒ごとにコメントを送信して接続維持
      // （大量の条文を分析する場合、数分かかるため必須）
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

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
          2, // concurrency
          documentType,
        );

        logger.info(
          { projectId, analyzedCount: analysisResult.items.length },
          "ギャップ分析が完了",
        );

        // Phase 2.5: 標準条文マッチングで意味グループを付与
        const standardArticles = await getStandardArticles();
        const standardMap = new Map(
          standardArticles.map((a) => [a.articleNum, a]),
        );

        for (const item of analysisResult.items) {
          const std = standardMap.get(item.standardRef?.replace("標準管理規約 ", ""));
          if (std) {
            item.semanticGroup = std.semanticGroup;
            item.secondaryGroups = std.secondaryGroups;
            item.standardArticleNum = std.articleNum;
          }
        }

        logger.info(
          { projectId, standardCount: standardArticles.length },
          "標準条文マッチングで意味グループを付与",
        );

        // Phase 3: 分析結果を Firestore に ReviewArticle として保存
        // 成功した分析結果 + 失敗した条文（プレースホルダー）の両方を保存
        try {
          const reviewArticles = analysisResult.items.map((item) => ({
            projectId,
            chapter: inferChapterFromCategory(item.category),
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
            gapType: item.gapType,
            relatedLawRefs: item.relatedLawRefs,
            semanticGroup: item.semanticGroup,
            secondaryGroups: item.secondaryGroups,
            standardArticleNum: item.standardArticleNum,
          }));

          // 分析に失敗した条文もプレースホルダーとして保存
          // （items に含まれなかった条文を特定）
          const analyzedNums = new Set(analysisResult.items.map((i) => i.articleNum));
          const failedArticles = articles
            .filter((a) => !analyzedNums.has(a.articleNum))
            .map((a) => ({
              projectId,
              chapter: inferChapterFromCategory(a.category),
              articleNum: a.articleNum,
              original: a.currentText ?? null,
              draft: "",
              summary: "分析が完了していません（再分析が必要です）",
              explanation: "",
              importance: "recommended" as const,
              baseRef: "",
              decision: null as "adopted" | "modified" | "pending" | null,
              modificationHistory: [] as string[],
              memo: "",
              category: a.category,
            }));

          const allArticles = [...reviewArticles, ...failedArticles];
          await batchSaveReviewArticles(projectId, allArticles);
          logger.info(
            { projectId, savedCount: reviewArticles.length, failedCount: failedArticles.length },
            "分析結果を Firestore に保存完了（失敗分含む）",
          );

          if (failedArticles.length > 0) {
            send("progress", {
              current: total,
              total,
              articleNum: `${failedArticles.length} 件の条文は分析に失敗しました（レビュー画面から再分析可能）`,
            });
          }
        } catch (saveError) {
          logger.error(
            { projectId, error: saveError },
            "分析結果の Firestore 保存に失敗",
          );
          send("warning", {
            message: "分析結果の保存に失敗しました。結果はこの画面に表示されていますが、ページを離れるとデータが失われます。",
          });
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
        clearInterval(keepalive);
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
