/**
 * レビュー進捗取得 API
 *
 * GET /api/review/[projectId]/progress
 * プロジェクト全体のレビュー進捗（採用/修正/保留/未決定の件数と進捗率）を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createInitialState,
  calculateProgress,
} from "@/domains/review/state-machine";
import { getReviewArticles } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

// ---------- ハンドラ ----------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    logger.info({ projectId }, "レビュー進捗の取得を開始");

    // レビュー記事を全件取得
    const articles = await getReviewArticles(projectId);

    // ReviewArticle → ReviewArticleState に変換
    const states = articles.map((article) => {
      const state = createInitialState(article.articleNum, article.draft);
      // 既存の decision と memo を復元
      state.decision = article.decision;
      state.memo = article.memo;
      return state;
    });

    // 進捗を計算
    const progress = calculateProgress(states);

    logger.info(
      { projectId, progress },
      "レビュー進捗の取得完了",
    );

    return NextResponse.json({ progress });
  } catch (error) {
    logger.error({ error }, "レビュー進捗の取得中にエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}
