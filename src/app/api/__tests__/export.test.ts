/**
 * Export API 統合テスト
 *
 * POST /api/export — レビュー結果のエクスポート（Markdown / CSV）
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  createJsonRequest,
  getTextResponse,
  createMockReviewArticle,
} from "@/test/helpers/api-test-helpers";

// ---------- モック ----------

const mockGetReviewArticles = vi.fn();

vi.mock("@/shared/db/server-actions", () => ({
  getReviewArticles: (...args: unknown[]) => mockGetReviewArticles(...args),
}));

vi.mock("@/shared/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ジェネレーターは実モジュールを使用して統合テストとする
// （MarkdownGenerator / CsvGenerator のモックは不要）

// ---------- テストデータ ----------

const SAMPLE_REVIEW_ARTICLES = [
  createMockReviewArticle({
    chapter: 1,
    articleNum: "第3条",
    original: "区分所有者は規約を遵守しなければならない。",
    draft: "区分所有者は規約を遵守しなければならない。\n2 同居者にも遵守させなければならない。",
    summary: "同居者への遵守義務を追加",
    explanation: "標準管理規約に準拠し、第2項を追加。",
    importance: "mandatory",
    decision: "adopted",
    baseRef: "標準管理規約第3条",
    category: "総則",
  }),
  createMockReviewArticle({
    chapter: 1,
    articleNum: "第5条",
    original: null,
    draft: "置き配に関する規定。",
    summary: "置き配ルールの新設",
    explanation: "令和6年改正対応。",
    importance: "recommended",
    decision: "modified",
    baseRef: "標準管理規約第18条の2",
    category: "総則",
  }),
  createMockReviewArticle({
    chapter: 6,
    articleNum: "第47条",
    original: null,
    draft: "電子議決権行使に関する規定。",
    summary: "電子議決権の新設",
    explanation: "改正区分所有法対応。",
    importance: "mandatory",
    decision: "pending",
    baseRef: "改正区分所有法第39条第3項",
    category: "管理組合",
  }),
];

// ---------- テスト ----------

describe("POST /api/export", () => {
  let POST: typeof import("@/app/api/export/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/export/route");
    POST = mod.POST;
  });

  // --- Markdown エクスポート ---

  test("Markdown 形式でエクスポートする", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_REVIEW_ARTICLES);

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: false,
    });

    const response = await POST(request);
    const { status, body, headers } = await getTextResponse(response);

    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(headers.get("Content-Disposition")).toContain("attachment");
    expect(body).toContain("テストマンション");
    expect(body).toContain("第3条");
    expect(body).toContain("第5条");
    expect(body).toContain("第47条");
  });

  test("Markdown にタイムスタンプを含めることができる", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_REVIEW_ARTICLES);

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: true,
    });

    const response = await POST(request);
    const { body } = await getTextResponse(response);

    expect(body).toContain("生成日:");
  });

  // --- CSV エクスポート ---

  test("CSV 形式でエクスポートする", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_REVIEW_ARTICLES);

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "csv",
      includeTimestamp: false,
    });

    const response = await POST(request);
    const { status, body, headers } = await getTextResponse(response);

    expect(status).toBe(200);
    expect(headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(headers.get("Content-Disposition")).toContain("attachment");
    // BOM は Response.text() で保持される場合と失われる場合があるため、
    // ヘッダー行の存在で CSV 形式を検証する
    expect(body).toContain("章番号,章名,条番号");
  });

  // --- フィルタオプション ---

  test("decision フィルタで adopted のみ取得する", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_REVIEW_ARTICLES);

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: false,
      filter: { decisions: ["adopted"] },
    });

    const response = await POST(request);
    const { body } = await getTextResponse(response);

    expect(body).toContain("第3条");
    expect(body).not.toContain("第47条");
  });

  test("importance フィルタで recommended のみ取得する", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_REVIEW_ARTICLES);

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: false,
      filter: { importances: ["recommended"] },
    });

    const response = await POST(request);
    const { body } = await getTextResponse(response);

    expect(body).toContain("第5条");
    expect(body).not.toContain("第3条");
  });

  test("章番号フィルタで特定の章のみ取得する", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_REVIEW_ARTICLES);

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: false,
      filter: { chapters: [6] },
    });

    const response = await POST(request);
    const { body } = await getTextResponse(response);

    expect(body).toContain("第47条");
    expect(body).not.toContain("第3条");
  });

  // --- バリデーションエラー ---

  test("projectId が空の場合に 400 を返す", async () => {
    const request = createJsonRequest("/api/export", "POST", {
      projectId: "",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: false,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("format が不正な場合に 400 を返す", async () => {
    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "pdf",
      includeTimestamp: false,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("includeTimestamp が欠落している場合に 400 を返す", async () => {
    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  // --- エラーハンドリング ---

  test("レビュー記事がゼロ件の場合に 404 を返す", async () => {
    mockGetReviewArticles.mockResolvedValueOnce([]);

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: false,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("エクスポート対象のレビュー記事がありません");
  });

  test("Firestore エラーで 500 を返す", async () => {
    mockGetReviewArticles.mockRejectedValueOnce(
      new Error("Firestore 接続エラー"),
    );

    const request = createJsonRequest("/api/export", "POST", {
      projectId: "test-project-001",
      condoName: "テストマンション",
      format: "markdown",
      includeTimestamp: false,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Firestore 接続エラー");
  });
});
