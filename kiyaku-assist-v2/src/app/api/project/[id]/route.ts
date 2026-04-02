/**
 * プロジェクト詳細 API（取得・更新・削除）
 *
 * GET    /api/project/[id] — プロジェクト詳細を取得（所有者のみ）
 * PATCH  /api/project/[id] — プロジェクトを部分更新（所有者のみ）
 * DELETE /api/project/[id] — プロジェクトを削除（所有者のみ）
 */

import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject, deleteProject } from "@/shared/db/server-actions";
import { ProjectUpdateSchema } from "@/shared/db/schemas";
import { logger } from "@/shared/observability/logger";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

/**
 * GET: プロジェクト詳細を取得する
 * 所有者のみアクセス可能。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const ownerCheck = await verifyProjectOwner(id, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    logger.info({ projectId: id }, "プロジェクト詳細を取得");

    const project = await getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: "プロジェクトが見つかりません" },
        { status: 404 },
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    logger.error({ error }, "プロジェクト詳細の取得中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}

/**
 * DELETE: プロジェクトとその関連データを削除する
 * 所有者のみ削除可能。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const ownerCheck = await verifyProjectOwner(id, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    logger.info({ projectId: id }, "プロジェクトを削除");

    await deleteProject(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "プロジェクト削除中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}

/**
 * PATCH: プロジェクトを部分更新する
 * 所有者のみ更新可能。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const ownerCheck = await verifyProjectOwner(id, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    // リクエストボディの取得
    const body = await request.json();

    // Zod バリデーション
    const parsed = ProjectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "プロジェクト更新リクエストのバリデーション失敗",
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

    logger.info({ projectId: id }, "プロジェクトを更新");

    await updateProject(id, parsed.data);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "プロジェクト更新中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
