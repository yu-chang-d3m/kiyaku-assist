/**
 * API ルートテスト用ヘルパー
 *
 * Next.js Route Handler を直接呼び出すためのユーティリティ。
 * HTTP リクエストを発行せず、エクスポートされた GET/POST/PATCH/DELETE 関数を直接テストする。
 */

import { NextRequest } from "next/server";

// ---------- Request 生成ヘルパー ----------

/**
 * JSON ボディ付きの NextRequest を生成する
 */
export function createJsonRequest(
  url: string,
  method: string,
  body: unknown,
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * クエリパラメータ付きの GET NextRequest を生成する
 */
export function createGetRequest(
  url: string,
  params?: Record<string, string>,
): NextRequest {
  const urlObj = new URL(url, "http://localhost:3000");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      urlObj.searchParams.set(key, value);
    }
  }
  return new NextRequest(urlObj, { method: "GET" });
}

/**
 * FormData 付きの NextRequest を生成する
 */
export function createFormDataRequest(
  url: string,
  formData: FormData,
): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    body: formData,
  });
}

// ---------- Route Handler 呼び出しヘルパー ----------

/**
 * 動的ルートパラメータの型（Next.js App Router 形式）
 * params は Promise<Record<string, string>> として渡す
 */
export function createRouteContext<T extends Record<string, string>>(
  params: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

// ---------- レスポンス検証ヘルパー ----------

/**
 * Response から JSON ボディを取得する
 */
export async function getJsonResponse<T = unknown>(
  response: Response,
): Promise<{ status: number; body: T }> {
  const body = (await response.json()) as T;
  return { status: response.status, body };
}

/**
 * Response からテキストボディを取得する
 */
export async function getTextResponse(
  response: Response,
): Promise<{ status: number; body: string; headers: Headers }> {
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

// ---------- テストデータファクトリ ----------

/**
 * テスト用の ReviewArticle を生成する
 */
export function createMockReviewArticle(
  overrides: Partial<{
    projectId: string;
    chapter: number;
    articleNum: string;
    original: string | null;
    draft: string;
    summary: string;
    explanation: string;
    importance: "mandatory" | "recommended" | "optional";
    baseRef: string;
    decision: "adopted" | "modified" | "pending" | null;
    modificationHistory: string[];
    memo: string;
    category: string;
  }> = {},
) {
  return {
    projectId: "test-project-001",
    chapter: 1,
    articleNum: "第3条",
    original: "現行の条文テキスト",
    draft: "改定案の条文テキスト",
    summary: "テスト要約",
    explanation: "テスト解説",
    importance: "mandatory" as const,
    baseRef: "標準管理規約第3条",
    decision: null as "adopted" | "modified" | "pending" | null,
    modificationHistory: [],
    memo: "",
    category: "総則",
    ...overrides,
  };
}

/**
 * テスト用の Project を生成する
 */
export function createMockProject(
  overrides: Partial<{
    id: string;
    userId: string;
    condoName: string;
    condoType: "corporate" | "non-corporate" | "unknown";
    unitCount: "small" | "medium" | "large" | "xlarge";
    targetTiming: string;
    hasCurrentRules: boolean;
    currentStep: number;
  }> = {},
) {
  return {
    id: "test-project-001",
    userId: "test-user-001",
    condoName: "テストマンション",
    condoType: "corporate" as const,
    unitCount: "medium" as const,
    targetTiming: "2026年4月",
    hasCurrentRules: true,
    currentStep: 0,
    ...overrides,
  };
}
