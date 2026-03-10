/**
 * プロジェクト分析結果取得 API
 *
 * GET /api/analysis/:projectId
 * 指定されたプロジェクトIDに紐づくレビュー済み条文の一覧を返す。
 * Firestore から getReviewArticles() で取得した結果をそのまま JSON で返却する。
 */

import { NextRequest, NextResponse } from "next/server";
import { getReviewArticles } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: "プロジェクトIDが指定されていません" },
        { status: 400 }
      );
    }

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
