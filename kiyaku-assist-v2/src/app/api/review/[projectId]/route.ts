/**
 * レビュー記事 API
 *
 * GET    /api/review/[projectId] — プロジェクトのレビュー状態を全件取得（所有者のみ）
 * PATCH  /api/review/[projectId] — 単一条文のレビュー記事を部分更新（所有者のみ）
 * DELETE /api/review/[projectId] — 指定した条文を一括削除（所有者のみ）
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import {
  getReviewArticles,
  updateReviewArticle,
  deleteReviewArticles,
} from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

export const dynamic = "force-dynamic";

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
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await params;

    const ownerCheck = await verifyProjectOwner(projectId, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

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
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await params;

    const ownerCheck = await verifyProjectOwner(projectId, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

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

    // 更新フィールドのみ組み立て（未指定フィールドは既存値を保持）
    const updateFields: Record<string, unknown> = {};
    if (draft !== undefined) updateFields.draft = draft;
    if (decision !== undefined) updateFields.decision = decision;
    if (memo !== undefined) updateFields.memo = memo;

    await updateReviewArticle(projectId, articleNum, updateFields);

    logger.info(
      { projectId, articleNum },
      "レビュー記事を更新完了",
    );

    // レスポンスには既存データ + 更新フィールドをマージして返す
    const merged = { ...existing, ...updateFields };
    return NextResponse.json({ article: merged });
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

/** DELETE リクエストボディスキーマ */
const deleteRequestSchema = z.object({
  articleNums: z.array(z.string().min(1)).min(1, "削除対象の条番号が必要です"),
});

/**
 * DELETE: 指定した条番号のレビュー記事を一括削除する
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await params;

    const ownerCheck = await verifyProjectOwner(projectId, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    const body = await request.json();
    const parsed = deleteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "バリデーションエラー: " +
            parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    }

    const { articleNums } = parsed.data;

    const deleted = await deleteReviewArticles(projectId, articleNums);

    logger.info(
      { projectId, deleted, articleNums },
      "レビュー記事を一括削除完了",
    );

    return NextResponse.json({ deleted });
  } catch (error) {
    logger.error({ error }, "レビュー記事の削除中にエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}
