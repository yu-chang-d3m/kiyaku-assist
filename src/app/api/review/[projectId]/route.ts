/**
 * レビュー記事 API
 *
 * GET  /api/review/[projectId] — プロジェクトのレビュー状態を全件取得
 * PATCH /api/review/[projectId] — 単一条文のレビュー記事を部分更新
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import {
  getReviewArticles,
  saveReviewArticle,
} from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

// ---------- Zod スキーマ ----------

/** PATCH リクエストボディスキーマ */
const patchRequestSchema = z.object({
  articleNum: z.string().min(1, "条番号は必須です"),
  decision: z.enum(["adopted", "modified", "pending"]).nullable().optional(),
  memo: z.string().optional(),
  draft: z.string().optional(),
});

// ---------- ハンドラ ----------

/**
 * GET: プロジェクトのレビュー記事を全件取得する
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    logger.info({ projectId }, "レビュー記事の取得を開始");

    const articles = await getReviewArticles(projectId);

    logger.info(
      { projectId, count: articles.length },
      "レビュー記事の取得完了",
    );

    return NextResponse.json({ articles });
  } catch (error) {
    logger.error({ error }, "レビュー記事の取得中にエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH: 単一条文のレビュー記事を部分更新する
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    // リクエストボディの取得とバリデーション
    const body = await request.json();
    const parsed = patchRequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "レビュー記事更新リクエストのバリデーション失敗",
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

    const { articleNum, decision, memo, draft } = parsed.data;

    // 既存のレビュー記事を取得して更新対象を見つける
    const articles = await getReviewArticles(projectId);
    const existing = articles.find((a) => a.articleNum === articleNum);

    if (!existing) {
      return NextResponse.json(
        { error: `条文 ${articleNum} が見つかりません` },
        { status: 404 },
      );
    }

    // 更新フィールドを反映
    const updated = {
      projectId,
      chapter: existing.chapter,
      articleNum: existing.articleNum,
      original: existing.original,
      draft: draft ?? existing.draft,
      summary: existing.summary,
      explanation: existing.explanation,
      importance: existing.importance,
      baseRef: existing.baseRef,
      decision: decision !== undefined ? decision : existing.decision,
      modificationHistory: existing.modificationHistory,
      memo: memo !== undefined ? memo : existing.memo,
      category: existing.category,
    };

    await saveReviewArticle(projectId, updated);

    logger.info(
      { projectId, articleNum },
      "レビュー記事を更新完了",
    );

    return NextResponse.json({ article: updated });
  } catch (error) {
    logger.error({ error }, "レビュー記事の更新中にエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}
