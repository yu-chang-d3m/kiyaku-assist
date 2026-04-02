/**
 * プロジェクト API（一覧・作成）
 *
 * GET  /api/project           — 認証ユーザーのプロジェクト一覧を取得
 * POST /api/project            — 新規プロジェクトを作成
 */

import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/shared/db/server-actions";
import { ProjectCreateSchema } from "@/shared/db/schemas";
import { logger } from "@/shared/observability/logger";
import { verifyAuth } from "@/shared/api/auth";

export const dynamic = "force-dynamic";

/**
 * GET: 認証ユーザーに紐づくプロジェクト一覧を返す
 *
 * トークンの uid をそのまま使用し、クエリパラメータの userId は不要になった。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    logger.info({ userId: auth.uid }, "プロジェクト一覧を取得");

    const projects = await listProjects(auth.uid);

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
 *
 * リクエストボディの userId はトークンの uid で上書きする。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    // リクエストボディの取得
    const body = await request.json();

    // トークンの uid を userId として強制上書き
    body.userId = auth.uid;

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
