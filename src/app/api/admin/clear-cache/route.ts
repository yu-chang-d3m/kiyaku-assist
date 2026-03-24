/**
 * AI キャッシュ削除 API
 *
 * DELETE /api/admin/clear-cache
 */

import { NextResponse } from "next/server";
import { clearAiCache } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const count = await clearAiCache();
    logger.info({ count }, "AI キャッシュを削除");
    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    logger.error({ error }, "AI キャッシュ削除に失敗");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
