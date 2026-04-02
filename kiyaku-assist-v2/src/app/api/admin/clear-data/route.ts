/**
 * 全プロジェクトデータ削除 API
 *
 * DELETE /api/admin/clear-data
 * 管理者認証必須（ADMIN_UIDS に含まれる UID のみ実行可能）。
 */

import { NextRequest, NextResponse } from "next/server";
import { clearAllProjects, clearAiCache } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";
import { verifyAdmin } from "@/shared/api/auth";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const projectCount = await clearAllProjects();
    const cacheCount = await clearAiCache();
    logger.info({ projectCount, cacheCount, uid: auth.uid }, "全データを削除");
    return NextResponse.json({
      ok: true,
      deletedProjects: projectCount,
      deletedCache: cacheCount,
    });
  } catch (error) {
    logger.error({ error }, "全データ削除に失敗");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
