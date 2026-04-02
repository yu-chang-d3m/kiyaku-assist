/**
 * 統合分析 API（SSE ストリーミング）
 *
 * POST /api/analysis/unified-start
 *
 * 3フェーズで処理:
 *   Phase 1: 意味分類（ユーザー条文 → 12グループにマッピング）
 *   Phase 2: ギャップ分析（標準条文との差分分析）
 *   Phase 3: 改正案生成（マンション用にカスタマイズ）
 *
 * 進捗は Server-Sent Events で返却する。
 * 所有者のみアクセス可能。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { batchRetrieve } from "@/domains/analysis/retriever";
import { analyzeGaps, type DocumentType } from "@/domains/analysis/analyzer";
import { batchGenerateReformDrafts } from "@/domains/drafting/reform-generator";
import type { ReformDraftRequest } from "@/domains/drafting/reform-types";
import {
  batchSaveReviewArticles,
  getProject,
  getStandardArticles,
} from "@/shared/db/server-actions";
import { inferChapterFromCategory } from "@/shared/db/chapter-utils";
import { logger } from "@/shared/observability/logger";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

// ---------- バリデーション ----------

const requestSchema = z.object({
  projectId: z.string().min(1),
  articles: z
    .array(
      z.object({
        articleNum: z.string().min(1),
        category: z.string().min(1),
        currentText: z.string().nullable(),
      }),
    )
    .min(1),
});

// ---------- ハンドラ ----------

export async function POST(request: NextRequest) {
  // 認証チェック（ストリーム開始前）
  const auth = await verifyAuth(request);
  if (auth instanceof NextResponse) return auth;

  let validatedData: z.infer<typeof requestSchema>;
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: parsed.error.issues.map((i) => i.message).join(", "),
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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          /* closed */
        }
      };

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      try {
        const total = articles.length;

        // プロジェクト情報を取得
        const project = await getProject(projectId);
        const documentType: DocumentType =
          project?.documentType ?? "management-rules";
        const condoContext = {
          condoName: project?.condoName ?? "マンション",
          condoType: project?.condoType ?? ("unknown" as const),
          unitCount: project?.unitCount ?? ("medium" as const),
        };

        // Firestore から標準条文を取得
        send("progress", {
          phase: "init",
          current: 0,
          total,
          message: "標準条文データを読み込み中…",
        });

        const standardArticles = await getStandardArticles();
        const standardMap = new Map(
          standardArticles.map((a) => [a.articleNum, a]),
        );

        logger.info(
          { projectId, totalArticles: total, standardCount: standardArticles.length },
          "統合分析を開始",
        );

        // ============================
        // Phase 1: ギャップ分析
        // ============================
        send("progress", {
          phase: "analysis",
          current: 0,
          total,
          message: "Phase 1/2: ギャップ分析中…",
        });

        // 関連条文をバッチ検索
        const retrievalResults = await batchRetrieve(
          articles.map((a) => a.currentText ?? ""),
        );

        const articlesWithDocs = articles.map((article, i) => ({
          articleNum: article.articleNum,
          category: article.category,
          currentText: article.currentText,
          relatedDocs: retrievalResults[i]?.results ?? [],
        }));

        const analysisResult = await analyzeGaps(
          projectId,
          articlesWithDocs,
          (completedCount, totalCount, batchArticleNums) => {
            send("progress", {
              phase: "analysis",
              current: completedCount,
              total: totalCount,
              message: `Phase 1/2: ${batchArticleNums[0]}〜${batchArticleNums[batchArticleNums.length - 1]} 分析完了`,
            });
          },
          2,
          documentType,
        );

        // 標準条文マッチングで意味グループを付与
        for (const item of analysisResult.items) {
          const std = standardMap.get(item.standardRef?.replace("標準管理規約 ", ""));
          if (std) {
            item.semanticGroup = std.semanticGroup;
            item.secondaryGroups = std.secondaryGroups;
            item.standardArticleNum = std.articleNum;
          }
        }

        logger.info(
          { analyzedCount: analysisResult.items.length },
          "Phase 1 完了: ギャップ分析",
        );

        // ============================
        // Phase 2: 改正案生成
        // ============================
        send("progress", {
          phase: "reform",
          current: 0,
          total: analysisResult.items.length,
          message: "Phase 2/2: 改正案を生成中…",
        });

        // 改正案生成リクエストを構築（compliant 以外）
        const reformRequests: ReformDraftRequest[] = analysisResult.items
          .filter((item) => item.gapType !== "compliant")
          .map((item) => {
            const std = standardMap.get(item.standardArticleNum ?? "");
            return {
              articleNum: item.articleNum,
              currentText: item.currentText,
              standardArticleNum: item.standardArticleNum ?? item.standardRef,
              standardBody: std?.body ?? item.standardText,
              standardComment: std?.comment ?? "",
              gapSummary: item.gapSummary,
              gapType: item.gapType,
              importance: item.importance,
              semanticGroup: item.semanticGroup ?? "misc",
              condoContext,
            };
          });

        const reformResults = await batchGenerateReformDrafts(
          reformRequests,
          (progress) => {
            send("progress", {
              phase: "reform",
              current: progress.completed,
              total: progress.total,
              message: `Phase 2/2: ${progress.articleNum} 改正案生成完了`,
            });
          },
        );

        // ============================
        // Phase 3: Firestore に保存
        // ============================
        send("progress", {
          phase: "save",
          current: 0,
          total,
          message: "分析結果を保存中…",
        });

        const reviewArticles = analysisResult.items.map((item) => {
          const reform = reformResults.get(item.articleNum);
          return {
            projectId,
            chapter: inferChapterFromCategory(item.category),
            articleNum: item.articleNum,
            original: item.currentText ?? null,
            draft: reform?.reformText ?? "",
            summary: reform?.summary ?? item.gapSummary,
            explanation: reform?.explanation ?? item.rationale,
            importance: item.importance,
            baseRef: item.standardRef,
            decision: null as "adopted" | "modified" | "pending" | null,
            modificationHistory: [] as string[],
            memo: "",
            category: item.category,
            gapType: item.gapType,
            relatedLawRefs: item.relatedLawRefs,
            reformText: reform?.reformText,
            semanticGroup: item.semanticGroup,
            secondaryGroups: item.secondaryGroups,
            standardArticleNum: item.standardArticleNum,
            detailedBackground: reform?.detailedBackground,
            issueGroup: reform?.issueGroup,
            impactOnResidents: reform?.impactOnResidents,
            riskIfUnchanged: reform?.riskIfUnchanged,
            transitionalMeasure: reform?.transitionalMeasure,
          };
        });

        // 分析に失敗した条文のプレースホルダー
        const analyzedNums = new Set(
          analysisResult.items.map((i) => i.articleNum),
        );
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

        await batchSaveReviewArticles(projectId, [
          ...reviewArticles,
          ...failedArticles,
        ]);

        logger.info(
          {
            projectId,
            savedCount: reviewArticles.length,
            reformCount: reformResults.size,
            failedCount: failedArticles.length,
          },
          "統合分析完了、Firestore に保存",
        );

        send("complete", {
          ...analysisResult,
          reformGenerated: reformResults.size,
        });
      } catch (error) {
        logger.error({ projectId, error }, "統合分析中にエラー");
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
