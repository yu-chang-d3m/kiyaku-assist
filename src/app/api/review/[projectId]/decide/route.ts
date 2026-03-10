/**
 * レビュー決定イベント適用 API
 *
 * POST /api/review/[projectId]/decide
 * 条文に対して決定イベント（ADOPT / MODIFY / RESET / ADD_MEMO）を適用し、
 * 状態遷移マシンで状態を更新して Firestore に保存する。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { applyEvent, createInitialState } from "@/domains/review/state-machine";
import { historyToStringArray } from "@/domains/review/history";
import {
  getReviewArticles,
  saveReviewArticle,
} from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

// ---------- Zod スキーマ ----------

/** イベントスキーマ（ADOPT / MODIFY / RESET / ADD_MEMO） */
const reviewEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ADOPT") }),
  z.object({
    type: z.literal("MODIFY"),
    newText: z.string().min(1, "修正テキストは必須です"),
    reason: z.string().min(1, "修正理由は必須です"),
  }),
  z.object({ type: z.literal("RESET") }),
  z.object({
    type: z.literal("ADD_MEMO"),
    memo: z.string().min(1, "メモは必須です"),
  }),
]);

/** リクエストボディスキーマ */
const decideRequestSchema = z.object({
  articleNum: z.string().min(1, "条番号は必須です"),
  event: reviewEventSchema,
});

// ---------- ハンドラ ----------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;

    // リクエストボディの取得とバリデーション
    const body = await request.json();
    const parsed = decideRequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "決定イベントリクエストのバリデーション失敗",
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

    const { articleNum, event } = parsed.data;

    logger.info(
      { projectId, articleNum, eventType: event.type },
      "決定イベントの適用を開始",
    );

    // Firestore から該当レビュー記事を取得
    const articles = await getReviewArticles(projectId);
    const existing = articles.find((a) => a.articleNum === articleNum);

    if (!existing) {
      return NextResponse.json(
        { error: `条文 ${articleNum} が見つかりません` },
        { status: 404 },
      );
    }

    // ReviewArticle → ReviewArticleState に変換
    const currentState = createInitialState(existing.articleNum, existing.draft);
    // 既存の decision と memo を復元
    currentState.decision = existing.decision;
    currentState.memo = existing.memo;

    // イベントを適用して新しい状態を取得
    const newState = applyEvent(currentState, event);

    // 修正履歴を文字列配列に変換（Firestore 保存用）
    const modificationHistory = historyToStringArray(newState);

    // Firestore に保存
    const updatedArticle = {
      projectId,
      chapter: existing.chapter,
      articleNum: existing.articleNum,
      original: existing.original,
      draft: newState.currentDraft,
      summary: existing.summary,
      explanation: existing.explanation,
      importance: existing.importance,
      baseRef: existing.baseRef,
      decision: newState.decision,
      modificationHistory,
      memo: newState.memo,
      category: existing.category,
    };

    await saveReviewArticle(projectId, updatedArticle);

    logger.info(
      { projectId, articleNum, newDecision: newState.decision },
      "決定イベントの適用完了",
    );

    return NextResponse.json({
      articleNum: newState.articleNum,
      decision: newState.decision,
      currentDraft: newState.currentDraft,
      memo: newState.memo,
      modificationHistory,
    });
  } catch (error) {
    logger.error({ error }, "決定イベントの適用中にエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}
