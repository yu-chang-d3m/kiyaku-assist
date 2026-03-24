/**
 * パース結果 API
 *
 * GET  /api/project/[id]/parsed-bylaws — パース結果を取得
 * POST /api/project/[id]/parsed-bylaws — パース結果を保存
 */

import { NextRequest, NextResponse } from "next/server";
import {
  saveParsedBylawsToFirestore,
  loadParsedBylawsFromFirestore,
} from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await loadParsedBylawsFromFirestore(id);
    if (!data) {
      return NextResponse.json({ data: null });
    }
    return NextResponse.json({ data });
  } catch (error) {
    logger.error({ error }, "パース結果の取得中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    await saveParsedBylawsToFirestore(id, body.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error }, "パース結果の保存中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
