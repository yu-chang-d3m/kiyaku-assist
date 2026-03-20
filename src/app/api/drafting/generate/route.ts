/**
 * ドラフト一括生成 API
 *
 * POST /api/drafting/generate
 * 複数条文のドラフトを一括生成し、SSE（Server-Sent Events）で進捗を返却する。
 * サーバー側でリトリーバーを呼び出し、標準管理規約テキストを取得してから生成する。
 * 生成完了後、結果を Firestore に一括保存する。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { batchGenerateDrafts } from "@/domains/drafting/drafter";
import type { DraftRequest } from "@/domains/drafting/types";
import { batchRetrieve } from "@/domains/analysis/retriever";
import { batchSaveReviewArticles } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

// ---------- Zod スキーマ ----------

/** マンション属性スキーマ */
const condoContextSchema = z.object({
  condoName: z.string().min(1, "マンション名は必須です"),
  condoType: z.enum(["corporate", "non-corporate", "unknown"]),
  unitCount: z.enum(["small", "medium", "large", "xlarge"]),
});

/** ドラフト対象条文スキーマ（standardText はサーバー側で取得） */
const draftItemSchema = z.object({
  articleNum: z.string().min(1, "条番号は必須です"),
  category: z.string().min(1, "カテゴリは必須です"),
  currentText: z.string().nullable(),
  gapSummary: z.string().min(1, "ギャップ概要は必須です"),
  importance: z.enum(["mandatory", "recommended", "optional"]),
});

/** リクエストボディスキーマ */
const generateRequestSchema = z.object({
  projectId: z.string().min(1, "プロジェクト ID は必須です"),
  items: z.array(draftItemSchema).min(1, "ドラフト対象の条文を1件以上指定してください"),
  condoContext: condoContextSchema,
});

// ---------- ハンドラ ----------

export async function POST(request: NextRequest) {
  try {
    // リクエストボディの取得とバリデーション
    const body = await request.json();
    const parsed = generateRequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "ドラフト一括生成リクエストのバリデーション失敗",
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

    const { projectId, items, condoContext } = parsed.data;
    const total = items.length;

    logger.info(
      { projectId, total },
      "ドラフト一括生成を開始（SSE）",
    );

    // SSE ストリームを構築
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          send("progress", { current: 0, total, articleNum: "標準管理規約を検索中..." });

          // リトリーバーで標準管理規約テキストを一括取得
          const queryTexts = items.map((item) => item.currentText ?? item.gapSummary);
          const retrievalResults = await batchRetrieve(queryTexts);

          // items にリトリーバー結果を結合して DraftRequest[] を構築
          const draftRequests: DraftRequest[] = items.map((item, i) => ({
            articleNum: item.articleNum,
            category: item.category,
            currentText: item.currentText,
            standardText: retrievalResults[i]?.results[0]?.content ?? "",
            gapSummary: item.gapSummary,
            importance: item.importance,
            condoContext,
          }));

          logger.info(
            { projectId, retrievedCount: retrievalResults.filter(r => r.results.length > 0).length },
            "標準管理規約テキストの取得完了",
          );

          send("progress", { current: 0, total, articleNum: "ドラフト生成中..." });

          const batchResult = await batchGenerateDrafts(draftRequests);

          // 各完了ドラフトの進捗を送信
          for (let i = 0; i < batchResult.drafts.length; i++) {
            send("progress", {
              current: i + 1,
              total,
              articleNum: batchResult.drafts[i].articleNum,
            });
          }

          // Firestore に一括保存
          const reviewArticles = batchResult.drafts.map((draft) => {
            const originalItem = items.find(
              (item) => item.articleNum === draft.articleNum,
            );

            return {
              projectId,
              chapter: 0,
              articleNum: draft.articleNum,
              original: originalItem?.currentText ?? null,
              draft: draft.draft,
              summary: draft.summary,
              explanation: draft.explanation,
              importance: draft.importance,
              baseRef: draft.baseRef,
              decision: null as "adopted" | "modified" | "pending" | null,
              modificationHistory: [] as string[],
              memo: "",
              category: draft.category,
            };
          });

          if (reviewArticles.length > 0) {
            await batchSaveReviewArticles(projectId, reviewArticles);
            logger.info(
              { projectId, savedCount: reviewArticles.length },
              "ドラフト結果を Firestore に保存完了",
            );
          }

          // 完了イベントを送信
          send("complete", batchResult);
        } catch (error) {
          logger.error(
            { projectId, error },
            "ドラフト一括生成中にエラーが発生",
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
  } catch (error) {
    logger.error({ error }, "ドラフト一括生成 API でエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}
