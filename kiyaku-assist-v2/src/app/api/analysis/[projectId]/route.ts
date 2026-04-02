/**
 * プロジェクト分析結果取得 API
 *
 * GET /api/analysis/:projectId
 * 指定されたプロジェクトIDに紐づくレビュー済み条文の一覧を返す。
 * Firestore から getReviewArticles() で取得した結果をそのまま JSON で返却する。
 * 所有者のみアクセス可能。
 */

import { NextRequest, NextResponse } from "next/server";
import { getReviewArticles } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: "プロジェクトIDが指定されていません" },
        { status: 400 }
      );
    }

    const ownerCheck = await verifyProjectOwner(projectId, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    logger.info({ projectId }, "分析結果を取得");

    // Firestore からレビュー済み条文を取得
    const articles = await getReviewArticles(projectId);

    return NextResponse.json(articles);
  } catch (error) {
    logger.error({ error }, "分析結果の取得中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 }
    );
  }
}
