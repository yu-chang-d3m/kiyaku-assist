/**
 * 全プロジェクトデータ削除 API
 *
 * DELETE /api/admin/clear-data
 */

import { NextResponse } from "next/server";
import { clearAllProjects, clearAiCache } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const projectCount = await clearAllProjects();
    const cacheCount = await clearAiCache();
    logger.info({ projectCount, cacheCount }, "全データを削除");
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
