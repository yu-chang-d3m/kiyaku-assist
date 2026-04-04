/**
 * プロジェクト最終確定 API
 *
 * POST /api/project/[id]/finalize
 * プロジェクトの全条文を「最終確定」にする。
 * 法的必須（mandatory）で保留（pending）の条文がある場合は 400 エラーで拒否。
 * 所有者のみアクセス可能。
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/shared/db/admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "@/shared/observability/logger";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const ownerCheck = await verifyProjectOwner(id, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    const db = getAdminDb();

    // reviewArticles を全件取得
    const snap = await db
      .collection("projects")
      .doc(id)
      .collection("reviewArticles")
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { error: "レビュー対象の条文がありません" },
        { status: 400 },
      );
    }

    // 法的必須で保留の条文をチェック
    const pendingMandatory: string[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (
        data.importance === "mandatory" &&
        (data.decision === "pending" || data.decision === null || !data.decision)
      ) {
        pendingMandatory.push(data.articleNum as string);
      }
    }

    if (pendingMandatory.length > 0) {
      logger.warn(
        { projectId: id, pendingMandatory },
        "法的必須で未決定・保留の条文があるため最終確定を拒否",
      );
      return NextResponse.json(
        {
          error: `法的必須の条文に未決定・保留のものがあります（${pendingMandatory.join("、")}）。確定前に判断を完了してください。`,
          pendingMandatory,
        },
        { status: 400 },
      );
    }

    // 全条文に isFinalized: true, finalizedAt を設定（バッチ書き込み）
    const BATCH_LIMIT = 500;
    const now = FieldValue.serverTimestamp();

    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const doc of chunk) {
        batch.update(doc.ref, {
          isFinalized: true,
          finalizedAt: now,
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    // プロジェクト本体の version と finalizedAt を更新
    await db.collection("projects").doc(id).update({
      version: "finalized",
      finalizedAt: now,
      updatedAt: now,
    });

    logger.info(
      { projectId: id, articleCount: snap.size },
      "プロジェクトを最終確定",
    );

    return NextResponse.json({
      success: true,
      finalizedCount: snap.size,
    });
  } catch (error) {
    logger.error({ error }, "プロジェクト最終確定中にエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}
