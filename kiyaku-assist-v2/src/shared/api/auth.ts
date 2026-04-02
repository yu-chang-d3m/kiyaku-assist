/**
 * API Route 認証ユーティリティ
 *
 * Firebase Authentication の ID トークンを検証し、
 * リクエストユーザーの uid を取得する。
 *
 * 使い方:
 *   const auth = await verifyAuth(request);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.uid でアクセス制御
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getAdminDb } from "@/shared/db/admin";

// firebase-admin/auth の getAuth() は App インスタンスが必要。
// getAdminDb() を呼ぶことで Admin App が初期化される副作用を利用する。
// getAdminApp は export されていないため、getAdminDb 経由で初期化を保証する。

/** 認証成功時の戻り値 */
export interface AuthResult {
  uid: string;
}

/**
 * Authorization ヘッダーの Bearer トークンを検証する
 *
 * @returns 成功時: { uid: string }、失敗時: NextResponse (401)
 */
export async function verifyAuth(
  request: NextRequest,
): Promise<AuthResult | NextResponse> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "認証が必要です。ログインしてください。" },
      { status: 401 },
    );
  }

  const idToken = authHeader.slice(7); // "Bearer " の後ろ

  try {
    // Admin SDK 初期化を保証（getAdminDb 内部で getAdminApp が呼ばれる）
    getAdminDb();

    const decodedToken = await getAuth().verifyIdToken(idToken);
    return { uid: decodedToken.uid };
  } catch {
    return NextResponse.json(
      { error: "認証トークンが無効です。再ログインしてください。" },
      { status: 401 },
    );
  }
}

/**
 * 管理者権限を検証する
 *
 * verifyAuth に加えて、環境変数 ADMIN_UIDS（カンマ区切り）に含まれる UID かを確認する。
 * ADMIN_UIDS が未設定の場合は全拒否（フェイルクローズ）。
 *
 * @returns 成功時: { uid: string }、失敗時: NextResponse (401 or 403)
 */
export async function verifyAdmin(
  request: NextRequest,
): Promise<AuthResult | NextResponse> {
  const auth = await verifyAuth(request);
  if (auth instanceof NextResponse) return auth;

  const adminUids =
    process.env.ADMIN_UIDS?.split(",").map((s) => s.trim()).filter(Boolean) ??
    [];

  if (!adminUids.includes(auth.uid)) {
    return NextResponse.json(
      { error: "管理者権限が必要です" },
      { status: 403 },
    );
  }

  return auth;
}

/**
 * プロジェクトの所有者であることを検証する
 *
 * プロジェクト ID からプロジェクトを取得し、userId がトークンの uid と一致するか確認する。
 *
 * @returns 成功時: true、失敗時: NextResponse (403 or 404)
 */
export async function verifyProjectOwner(
  projectId: string,
  uid: string,
): Promise<true | NextResponse> {
  const db = getAdminDb();
  const snap = await db.collection("projects").doc(projectId).get();

  if (!snap.exists) {
    return NextResponse.json(
      { error: "プロジェクトが見つかりません" },
      { status: 404 },
    );
  }

  const project = snap.data();
  if (project?.userId !== uid) {
    return NextResponse.json(
      { error: "このプロジェクトへのアクセス権限がありません" },
      { status: 403 },
    );
  }

  return true;
}
