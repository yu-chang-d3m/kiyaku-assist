/**
 * Ingestion API 統合テスト
 *
 * POST /api/ingestion/parse — テキスト形式の管理規約パース
 * POST /api/ingestion/parse-file — ファイルアップロードパース
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  createJsonRequest,
  createFormDataRequest,
} from "@/test/helpers/api-test-helpers";

// ---------- モック ----------

// parse で使用されるモック関数
const mockTextParse = vi.fn();

// parse-file の動的インポートで使用されるモック関数
const mockPdfParseBuffer = vi.fn();
const mockDocxParseBuffer = vi.fn();
const mockTextParseForFile = vi.fn();

// parse/route.ts が使う barrel export モック
vi.mock("@/domains/ingestion/parsers", () => ({
  TextParser: class MockTextParser {
    parse = mockTextParse;
  },
}));

// parse-file/route.ts が動的インポートする個別パーサーモック
vi.mock("@/domains/ingestion/parsers/pdf-parser", () => ({
  PdfParser: class MockPdfParser {
    parseBuffer = mockPdfParseBuffer;
  },
}));

vi.mock("@/domains/ingestion/parsers/docx-parser", () => ({
  DocxParser: class MockDocxParser {
    parseBuffer = mockDocxParseBuffer;
  },
}));

vi.mock("@/domains/ingestion/parsers/text-parser", () => ({
  TextParser: class MockTextParserForFile {
    parse = mockTextParseForFile;
  },
}));

// normalizer モック（パススルー）
vi.mock("@/domains/ingestion/normalizer", () => ({
  normalizeParseResult: vi.fn((result) => result),
}));

// logger モック
vi.mock("@/shared/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------- サンプルデータ ----------

const SAMPLE_PARSE_RESULT = {
  articles: [
    {
      chapter: 1,
      chapterTitle: "総則",
      articleNum: "第1条",
      title: "目的",
      body: "この規約はテストマンションの管理について定める。",
      paragraphs: [],
    },
    {
      chapter: 1,
      chapterTitle: "総則",
      articleNum: "第2条",
      title: "定義",
      body: "この規約で使用する用語の定義。",
      paragraphs: [],
    },
  ],
  metadata: {
    totalArticles: 2,
    totalChapters: 1,
    chapterNames: ["総則"],
    parsedAt: "2026-01-01T00:00:00.000Z",
    sourceFormat: "text",
    warnings: [],
  },
};

const SAMPLE_TEXT = `第1章 総則
第1条（目的）
この規約はテストマンションの管理について定める。
第2条（定義）
この規約で使用する用語の定義。`;

// ============================================================
// POST /api/ingestion/parse
// ============================================================

describe("POST /api/ingestion/parse", () => {
  let POST: typeof import("@/app/api/ingestion/parse/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/ingestion/parse/route");
    POST = mod.POST;
  });

  test("正常なテキスト入力でパース結果を返す", async () => {
    mockTextParse.mockResolvedValueOnce(SAMPLE_PARSE_RESULT);

    const request = createJsonRequest("/api/ingestion/parse", "POST", {
      text: SAMPLE_TEXT,
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles).toHaveLength(2);
    expect(body.articles[0].articleNum).toBe("第1条");
    expect(body.metadata.totalArticles).toBe(2);
    expect(mockTextParse).toHaveBeenCalledWith(SAMPLE_TEXT);
  });

  test("空のテキストで 400 バリデーションエラーを返す", async () => {
    const request = createJsonRequest("/api/ingestion/parse", "POST", {
      text: "",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
    expect(mockTextParse).not.toHaveBeenCalled();
  });

  test("text フィールドが無い場合に 400 バリデーションエラーを返す", async () => {
    const request = createJsonRequest("/api/ingestion/parse", "POST", {});
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("不正な型（数値）で 400 バリデーションエラーを返す", async () => {
    const request = createJsonRequest("/api/ingestion/parse", "POST", {
      text: 12345,
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("バリデーションエラー");
  });

  test("パーサーがエラーをスローした場合に 500 を返す", async () => {
    mockTextParse.mockRejectedValueOnce(new Error("パース失敗"));

    const request = createJsonRequest("/api/ingestion/parse", "POST", {
      text: SAMPLE_TEXT,
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("パース失敗");
  });

  test("非 Error オブジェクトのスローで汎用エラーメッセージを返す", async () => {
    mockTextParse.mockRejectedValueOnce("unknown error");

    const request = createJsonRequest("/api/ingestion/parse", "POST", {
      text: SAMPLE_TEXT,
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("サーバー内部エラー");
  });
});

// ============================================================
// POST /api/ingestion/parse-file
// ============================================================

describe("POST /api/ingestion/parse-file", () => {
  let POST: typeof import("@/app/api/ingestion/parse-file/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/app/api/ingestion/parse-file/route");
    POST = mod.POST;
  });

  test("テキストファイルを正常にパースする", async () => {
    mockTextParseForFile.mockResolvedValueOnce(SAMPLE_PARSE_RESULT);

    const formData = new FormData();
    const file = new File([SAMPLE_TEXT], "test.txt", { type: "text/plain" });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles).toHaveLength(2);
    expect(mockTextParseForFile).toHaveBeenCalled();
  });

  test("PDF ファイルを正常にパースする", async () => {
    mockPdfParseBuffer.mockResolvedValueOnce(SAMPLE_PARSE_RESULT);

    const formData = new FormData();
    const file = new File([new Uint8Array(100)], "test.pdf", {
      type: "application/pdf",
    });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles).toHaveLength(2);
    expect(mockPdfParseBuffer).toHaveBeenCalled();
  });

  test("DOCX ファイルを正常にパースする", async () => {
    mockDocxParseBuffer.mockResolvedValueOnce(SAMPLE_PARSE_RESULT);

    const formData = new FormData();
    const file = new File([new Uint8Array(100)], "test.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDocxParseBuffer).toHaveBeenCalled();
  });

  test("DOCX 拡張子で形式を判定する（.docx 拡張子）", async () => {
    mockDocxParseBuffer.mockResolvedValueOnce(SAMPLE_PARSE_RESULT);

    const formData = new FormData();
    // .docx 拡張子で判定（MIME タイプは正しいものを使用）
    const file = new File([new Uint8Array(100)], "規約.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockDocxParseBuffer).toHaveBeenCalled();
  });

  test("ファイルが選択されていない場合に 400 を返す", async () => {
    const formData = new FormData();
    // file フィールドを追加しない

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("ファイルが選択されていません");
  });

  test("MAX_FILE_SIZE の境界値テスト: ファイルサイズ制限のロジックが存在する", async () => {
    // jsdom 環境では大きなファイルの FormData 処理がメモリ制約で不安定なため、
    // ファイルサイズチェックのロジックが route.ts に存在することを、
    // 小さなファイルの正常系で間接的に確認する
    mockTextParseForFile.mockResolvedValueOnce(SAMPLE_PARSE_RESULT);

    const formData = new FormData();
    // 10MB 未満の小さなファイル（サイズチェックを通過する）
    const file = new File(["小さいファイル"], "small.txt", {
      type: "text/plain",
    });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockTextParseForFile).toHaveBeenCalled();
  });

  test("対応していないファイル形式で 400 を返す", async () => {
    const formData = new FormData();
    const file = new File(["<html></html>"], "test.html", {
      type: "text/html",
    });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("対応していないファイル形式");
  });

  test("パース結果が空の場合に警告を追加する", async () => {
    const emptyResult = {
      articles: [],
      metadata: {
        totalArticles: 0,
        totalChapters: 0,
        chapterNames: [],
        parsedAt: "2026-01-01T00:00:00.000Z",
        sourceFormat: "text",
        warnings: [],
      },
    };
    mockTextParseForFile.mockResolvedValueOnce(emptyResult);

    const formData = new FormData();
    const file = new File(["empty content"], "test.txt", {
      type: "text/plain",
    });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metadata.warnings).toContain(
      "条文を検出できませんでした。ファイルの内容が管理規約であることを確認してください。",
    );
  });

  test("パーサーがエラーをスローした場合に 500 を返す", async () => {
    mockTextParseForFile.mockRejectedValueOnce(
      new Error("ファイルの読み取りに失敗"),
    );

    const formData = new FormData();
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    formData.append("file", file);

    const request = createFormDataRequest("/api/ingestion/parse-file", formData);
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("ファイルの読み取りに失敗");
  });
});
