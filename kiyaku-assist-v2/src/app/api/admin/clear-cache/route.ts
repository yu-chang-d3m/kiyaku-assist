/**
 * AI キャッシュ削除 API
 *
 * DELETE /api/admin/clear-cache
 * 管理者認証必須（ADMIN_UIDS に含まれる UID のみ実行可能）。
 */

import { NextRequest, NextResponse } from "next/server";
import { clearAiCache } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";
import { verifyAdmin } from "@/shared/api/auth";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const count = await clearAiCache();
    logger.info({ count, uid: auth.uid }, "AI キャッシュを削除");
    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    logger.error({ error }, "AI キャッシュ削除に失敗");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
