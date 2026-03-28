/**
 * Review API 統合テスト
 *
 * GET   /api/review/[projectId]           — レビュー記事一覧取得
 * PATCH /api/review/[projectId]           — レビュー記事部分更新
 * POST  /api/review/[projectId]/decide    — 決定イベント適用
 * GET   /api/review/[projectId]/progress  — レビュー進捗取得
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  createJsonRequest,
  createGetRequest,
  createRouteContext,
  createMockReviewArticle,
} from "@/test/helpers/api-test-helpers";

// ---------- モック ----------

const mockGetReviewArticles = vi.fn();
const mockSaveReviewArticle = vi.fn();

vi.mock("@/shared/db/server-actions", () => ({
  getReviewArticles: (...args: unknown[]) => mockGetReviewArticles(...args),
  saveReviewArticle: (...args: unknown[]) => mockSaveReviewArticle(...args),
}));

vi.mock("@/shared/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------- テストデータ ----------

const PROJECT_ID = "test-project-001";
const CONTEXT = createRouteContext({ projectId: PROJECT_ID });

const SAMPLE_ARTICLES = [
  createMockReviewArticle({
    projectId: PROJECT_ID,
    chapter: 1,
    articleNum: "第3条",
    decision: "adopted",
    memo: "承認済み",
  }),
  createMockReviewArticle({
    projectId: PROJECT_ID,
    chapter: 1,
    articleNum: "第5条",
    decision: null,
    importance: "recommended",
    category: "総則",
  }),
  createMockReviewArticle({
    projectId: PROJECT_ID,
    chapter: 6,
    articleNum: "第47条",
    decision: "pending",
    importance: "mandatory",
    category: "管理組合",
  }),
];

// ============================================================
// GET /api/review/[projectId]
// ============================================================

describe("GET /api/review/[projectId]", () => {
  let GET: typeof import("@/app/api/review/[projectId]/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/review/[projectId]/route");
    GET = mod.GET;
  });

  test("レビュー記事一覧を正常に取得する", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_ARTICLES);

    const request = createGetRequest(`/api/review/${PROJECT_ID}`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles).toHaveLength(3);
    expect(body.articles[0].articleNum).toBe("第3条");
    expect(mockGetReviewArticles).toHaveBeenCalledWith(PROJECT_ID);
  });

  test("空のレビュー記事一覧を返す", async () => {
    mockGetReviewArticles.mockResolvedValueOnce([]);

    const request = createGetRequest(`/api/review/${PROJECT_ID}`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles).toHaveLength(0);
  });

  test("Firestore エラーで 500 を返す", async () => {
    mockGetReviewArticles.mockRejectedValueOnce(
      new Error("Firestore 接続エラー"),
    );

    const request = createGetRequest(`/api/review/${PROJECT_ID}`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Firestore 接続エラー");
  });
});

// ============================================================
// PATCH /api/review/[projectId]
// ============================================================

describe("PATCH /api/review/[projectId]", () => {
  let PATCH: typeof import("@/app/api/review/[projectId]/route").PATCH;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/review/[projectId]/route");
    PATCH = mod.PATCH;
  });

  test("レビュー記事の decision を更新する", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_ARTICLES);
    mockSaveReviewArticle.mockResolvedValueOnce(undefined);

    const request = createJsonRequest(`/api/review/${PROJECT_ID}`, "PATCH", {
      articleNum: "第3条",
      decision: "modified",
    });
    const response = await PATCH(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.article.articleNum).toBe("第3条");
    expect(body.article.decision).toBe("modified");
    expect(mockSaveReviewArticle).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ articleNum: "第3条", decision: "modified" }),
    );
  });

  test("レビュー記事のメモを更新する", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_ARTICLES);
    mockSaveReviewArticle.mockResolvedValueOnce(undefined);

    const request = createJsonRequest(`/api/review/${PROJECT_ID}`, "PATCH", {
      articleNum: "第3条",
      memo: "要検討事項あり",
    });
    const response = await PATCH(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.article.memo).toBe("要検討事項あり");
  });

  test("レビュー記事の draft を更新する", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_ARTICLES);
    mockSaveReviewArticle.mockResolvedValueOnce(undefined);

    const request = createJsonRequest(`/api/review/${PROJECT_ID}`, "PATCH", {
      articleNum: "第3条",
      draft: "修正後のドラフト",
    });
    const response = await PATCH(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.article.draft).toBe("修正後のドラフト");
  });

  test("articleNum が空の場合に 400 を返す", async () => {
    const request = createJsonRequest(`/api/review/${PROJECT_ID}`, "PATCH", {
      articleNum: "",
      decision: "adopted",
    });
    const response = await PATCH(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("不正な decision 値で 400 を返す", async () => {
    const request = createJsonRequest(`/api/review/${PROJECT_ID}`, "PATCH", {
      articleNum: "第3条",
      decision: "invalid",
    });
    const response = await PATCH(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("存在しない条文で 404 を返す", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_ARTICLES);

    const request = createJsonRequest(`/api/review/${PROJECT_ID}`, "PATCH", {
      articleNum: "第999条",
      decision: "adopted",
    });
    const response = await PATCH(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("第999条");
  });

  test("Firestore エラーで 500 を返す", async () => {
    mockGetReviewArticles.mockRejectedValueOnce(
      new Error("Firestore 書き込みエラー"),
    );

    const request = createJsonRequest(`/api/review/${PROJECT_ID}`, "PATCH", {
      articleNum: "第3条",
      decision: "adopted",
    });
    const response = await PATCH(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Firestore 書き込みエラー");
  });
});

// ============================================================
// POST /api/review/[projectId]/decide
// ============================================================

describe("POST /api/review/[projectId]/decide", () => {
  let POST: typeof import("@/app/api/review/[projectId]/decide/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/review/[projectId]/decide/route");
    POST = mod.POST;
  });

  test("ADOPT イベントで条文を採用状態にする", async () => {
    const articles = [
      createMockReviewArticle({
        projectId: PROJECT_ID,
        articleNum: "第3条",
        decision: null,
        draft: "改定案テキスト",
      }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);
    mockSaveReviewArticle.mockResolvedValueOnce(undefined);

    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: { type: "ADOPT" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("adopted");
    expect(body.articleNum).toBe("第3条");
    expect(mockSaveReviewArticle).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ decision: "adopted" }),
    );
  });

  test("MODIFY イベントで条文を修正状態にする", async () => {
    const articles = [
      createMockReviewArticle({
        projectId: PROJECT_ID,
        articleNum: "第3条",
        decision: null,
        draft: "元の改定案テキスト",
      }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);
    mockSaveReviewArticle.mockResolvedValueOnce(undefined);

    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: {
          type: "MODIFY",
          newText: "修正後テキスト",
          reason: "表現を調整",
        },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("modified");
    expect(body.currentDraft).toBe("修正後テキスト");
    expect(body.modificationHistory).toHaveLength(1);
  });

  test("RESET イベントで保留状態に戻す", async () => {
    const articles = [
      createMockReviewArticle({
        projectId: PROJECT_ID,
        articleNum: "第3条",
        decision: "adopted",
        draft: "改定案テキスト",
      }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);
    mockSaveReviewArticle.mockResolvedValueOnce(undefined);

    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: { type: "RESET" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("pending");
  });

  test("ADD_MEMO イベントでメモを設定する", async () => {
    const articles = [
      createMockReviewArticle({
        projectId: PROJECT_ID,
        articleNum: "第3条",
        decision: null,
        draft: "改定案テキスト",
      }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);
    mockSaveReviewArticle.mockResolvedValueOnce(undefined);

    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: { type: "ADD_MEMO", memo: "次回理事会で議論" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.memo).toBe("次回理事会で議論");
  });

  test("articleNum が空の場合に 400 を返す", async () => {
    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "",
        event: { type: "ADOPT" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("不正なイベントタイプで 400 を返す", async () => {
    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: { type: "INVALID" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("MODIFY イベントで newText が空の場合に 400 を返す", async () => {
    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: { type: "MODIFY", newText: "", reason: "理由" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("MODIFY イベントで reason が空の場合に 400 を返す", async () => {
    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: { type: "MODIFY", newText: "テキスト", reason: "" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("存在しない条文で 404 を返す", async () => {
    mockGetReviewArticles.mockResolvedValueOnce(SAMPLE_ARTICLES);

    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第999条",
        event: { type: "ADOPT" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("第999条");
  });

  test("Firestore エラーで 500 を返す", async () => {
    mockGetReviewArticles.mockRejectedValueOnce(
      new Error("Firestore 接続エラー"),
    );

    const request = createJsonRequest(
      `/api/review/${PROJECT_ID}/decide`,
      "POST",
      {
        articleNum: "第3条",
        event: { type: "ADOPT" },
      },
    );
    const response = await POST(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Firestore 接続エラー");
  });
});

// ============================================================
// GET /api/review/[projectId]/progress
// ============================================================

describe("GET /api/review/[projectId]/progress", () => {
  let GET: typeof import("@/app/api/review/[projectId]/progress/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/review/[projectId]/progress/route");
    GET = mod.GET;
  });

  test("レビュー進捗を正常に取得する", async () => {
    const articles = [
      createMockReviewArticle({ articleNum: "第1条", decision: "adopted" }),
      createMockReviewArticle({ articleNum: "第2条", decision: "modified" }),
      createMockReviewArticle({ articleNum: "第3条", decision: "pending" }),
      createMockReviewArticle({ articleNum: "第4条", decision: null }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);

    const request = createGetRequest(`/api/review/${PROJECT_ID}/progress`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress.total).toBe(4);
    expect(body.progress.adopted).toBe(1);
    expect(body.progress.modified).toBe(1);
    expect(body.progress.pending).toBe(1);
    expect(body.progress.undecided).toBe(1);
    expect(body.progress.progressPercent).toBe(50); // (1+1)/4 = 50%
  });

  test("全件 adopted で進捗 100% を返す", async () => {
    const articles = [
      createMockReviewArticle({ articleNum: "第1条", decision: "adopted" }),
      createMockReviewArticle({ articleNum: "第2条", decision: "adopted" }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);

    const request = createGetRequest(`/api/review/${PROJECT_ID}/progress`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(body.progress.progressPercent).toBe(100);
    expect(body.progress.adopted).toBe(2);
  });

  test("レビュー記事がゼロ件の場合に進捗 0% を返す", async () => {
    mockGetReviewArticles.mockResolvedValueOnce([]);

    const request = createGetRequest(`/api/review/${PROJECT_ID}/progress`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress.total).toBe(0);
    expect(body.progress.progressPercent).toBe(0);
  });

  test("全件未決定で進捗 0% を返す", async () => {
    const articles = [
      createMockReviewArticle({ articleNum: "第1条", decision: null }),
      createMockReviewArticle({ articleNum: "第2条", decision: null }),
      createMockReviewArticle({ articleNum: "第3条", decision: null }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);

    const request = createGetRequest(`/api/review/${PROJECT_ID}/progress`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(body.progress.total).toBe(3);
    expect(body.progress.undecided).toBe(3);
    expect(body.progress.progressPercent).toBe(0);
  });

  test("modified も進捗に含まれる", async () => {
    const articles = [
      createMockReviewArticle({ articleNum: "第1条", decision: "modified" }),
      createMockReviewArticle({ articleNum: "第2条", decision: "modified" }),
    ];
    mockGetReviewArticles.mockResolvedValueOnce(articles);

    const request = createGetRequest(`/api/review/${PROJECT_ID}/progress`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(body.progress.progressPercent).toBe(100);
  });

  test("Firestore エラーで 500 を返す", async () => {
    mockGetReviewArticles.mockRejectedValueOnce(
      new Error("Firestore 接続エラー"),
    );

    const request = createGetRequest(`/api/review/${PROJECT_ID}/progress`);
    const response = await GET(request, CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Firestore 接続エラー");
  });
});
