/**
 * プロジェクト詳細 API（取得・更新）
 *
 * GET   /api/project/[id] — プロジェクト詳細を取得
 * PATCH /api/project/[id] — プロジェクトを部分更新
 */

import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject, deleteProject } from "@/shared/db/server-actions";
import { ProjectUpdateSchema } from "@/shared/db/schemas";
import { logger } from "@/shared/observability/logger";

/**
 * GET: プロジェクト詳細を取得する
 * 存在しない場合は 404 を返す。
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const existing = await getProject(id);
    if (!existing) {
      return NextResponse.json(
        { error: "プロジェクトが見つかりません" },
        { status: 404 },
      );
    }

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
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    // プロジェクトの存在確認
    const existing = await getProject(id);
    if (!existing) {
      return NextResponse.json(
        { error: "プロジェクトが見つかりません" },
        { status: 404 },
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
