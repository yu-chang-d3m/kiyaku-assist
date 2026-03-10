/**
 * プロジェクト API（一覧・作成）
 *
 * GET  /api/project?userId=xxx — ユーザーのプロジェクト一覧を取得
 * POST /api/project            — 新規プロジェクトを作成
 */

import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/shared/db/server-actions";
import { ProjectCreateSchema } from "@/shared/db/schemas";
import { logger } from "@/shared/observability/logger";

/**
 * GET: ユーザーに紐づくプロジェクト一覧を返す
 */
export async function GET(request: NextRequest) {
  try {
    // クエリパラメータから userId を取得
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "クエリパラメータ userId は必須です" },
        { status: 400 },
      );
    }

    logger.info({ userId }, "プロジェクト一覧を取得");

    const projects = await listProjects(userId);

    return NextResponse.json(projects);
  } catch (error) {
    logger.error({ error }, "プロジェクト一覧の取得中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}

/**
 * POST: 新規プロジェクトを作成し、ドキュメント ID を返す
 */
export async function POST(request: NextRequest) {
  try {
    // リクエストボディの取得
    const body = await request.json();

    // Zod バリデーション
    const parsed = ProjectCreateSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "プロジェクト作成リクエストのバリデーション失敗",
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

    logger.info(
      { userId: parsed.data.userId, condoName: parsed.data.condoName },
      "プロジェクトを作成",
    );

    const id = await createProject(parsed.data);

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    logger.error({ error }, "プロジェクト作成中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
