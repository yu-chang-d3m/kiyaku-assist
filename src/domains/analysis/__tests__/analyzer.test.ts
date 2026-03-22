/**
 * Analyzer モジュールのユニットテスト
 *
 * analyzeArticle / analyzeBatchArticles / analyzeGaps の
 * 正常系・キャッシュ・エラーハンドリング・フォールバックをテストする。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RetrievedDocument, GapAnalysisItem } from "@/domains/analysis/types";
import { SAMPLE_PARSED_BYLAWS } from "@/test/fixtures/sample-bylaws";

// ---------- モック ----------

// logger のモック
vi.mock("@/shared/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// キャッシュモック
const mockGetCachedResponse = vi.fn<(key: string) => Promise<unknown | null>>();
const mockSetCachedResponse = vi.fn<(key: string, data: unknown, ttl: number) => Promise<void>>();
const mockGenerateCacheKey = vi.fn<(...inputs: string[]) => string>();

vi.mock("@/shared/ai/cache", () => ({
  getCachedResponse: (...args: unknown[]) => mockGetCachedResponse(args[0] as string),
  setCachedResponse: (...args: unknown[]) =>
    mockSetCachedResponse(args[0] as string, args[1], args[2] as number),
  generateCacheKey: (...args: unknown[]) => mockGenerateCacheKey(...(args as string[])),
}));

// Claude API モック
const mockCallWithStructuredOutput = vi.fn();

vi.mock("@/shared/ai/claude", () => ({
  callWithStructuredOutput: (...args: unknown[]) => mockCallWithStructuredOutput(...args),
  MODELS: {
    ANALYSIS: "claude-sonnet-4-5-20250929",
    PARSE: "claude-haiku-4-5-20251001",
    CHAT: "claude-sonnet-4-5-20250929",
  },
}));

// ---------- テストヘルパー ----------

/** テスト用の RetrievedDocument を生成する */
function makeRelatedDoc(overrides: Partial<RetrievedDocument> = {}): RetrievedDocument {
  return {
    content: "区分所有者は、円滑な共同生活を維持するため…",
    metadata: { ref: "標準管理規約 第3条" },
    relevanceScore: 0.95,
    ...overrides,
  };
}

/** 単一条文分析の典型的な Claude 返却値を生成 */
function makeSingleAnalysisOutput(overrides: Partial<{
  gapType: string;
  importance: string;
  gapSummary: string;
  rationale: string;
  relatedLawRefs: string[];
}> = {}) {
  return {
    gapType: "partial",
    importance: "recommended",
    gapSummary: "同居者への遵守義務規定が不足している",
    rationale: "標準管理規約では第2項で同居者への義務を明記しており、追加が推奨される",
    relatedLawRefs: ["区分所有法第46条第2項"],
    ...overrides,
  };
}

/** バッチ分析の典型的な Claude 返却値を生成 */
function makeBatchAnalysisOutput(articleNums: string[]) {
  return {
    items: articleNums.map((num) => ({
      articleNum: num,
      gapType: "outdated",
      importance: "mandatory",
      gapSummary: `${num}のギャップ概要`,
      rationale: `${num}の改正理由`,
      relatedLawRefs: ["改正区分所有法第47条"],
    })),
  };
}

// ---------- テスト用条文データ ----------

const sampleArticle = SAMPLE_PARSED_BYLAWS.chapters[0].articles[2]; // 第3条

function makeArticleInput(overrides: Partial<{
  articleNum: string;
  category: string;
  currentText: string | null;
  relatedDocs: RetrievedDocument[];
}> = {}) {
  return {
    articleNum: sampleArticle.number,
    category: sampleArticle.chapter,
    currentText: sampleArticle.content,
    relatedDocs: [makeRelatedDoc()],
    ...overrides,
  };
}

// ---------- テスト本体 ----------

// analyzeGaps のインポート（モック設定後に行う）
let analyzeGaps: typeof import("@/domains/analysis/analyzer").analyzeGaps;

beforeEach(async () => {
  vi.clearAllMocks();

  // キャッシュキー生成はデフォルトで固定値を返す
  mockGenerateCacheKey.mockImplementation((...inputs: string[]) => `cache_${inputs[0]}_${inputs[1]}`);

  // キャッシュはデフォルトでミス
  mockGetCachedResponse.mockResolvedValue(null);
  mockSetCachedResponse.mockResolvedValue(undefined);

  // Claude API はデフォルトで単一分析の正常応答
  mockCallWithStructuredOutput.mockResolvedValue(makeSingleAnalysisOutput());

  // モジュールを動的にインポート（vi.mock が適用された状態で）
  const mod = await import("@/domains/analysis/analyzer");
  analyzeGaps = mod.analyzeGaps;
});

// ========== analyzeArticle（内部関数）を analyzeGaps 経由でテスト ==========

describe("analyzeGaps — 単一条文分析（analyzeArticle 経由）", () => {
  it("1条文を分析し、正しい GapAnalysisItem を返す", async () => {
    // analyzeGaps は内部で analyzeBatchArticles を呼ぶので batch 形式で返す
    mockCallWithStructuredOutput.mockResolvedValueOnce({
      items: [{
        articleNum: "第3条",
        gapType: "partial",
        importance: "recommended",
        gapSummary: "同居者への遵守義務規定が不足している",
        rationale: "標準管理規約では第2項で同居者への義務を明記しており、追加が推奨される",
        relatedLawRefs: ["区分所有法第46条第2項"],
      }],
    });

    const result = await analyzeGaps("proj-1", [makeArticleInput()]);

    expect(result.projectId).toBe("proj-1");
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.articleNum).toBe("第3条");
    expect(item.gapType).toBe("partial");
    expect(item.importance).toBe("recommended");
    expect(item.gapSummary).toBe("同居者への遵守義務規定が不足している");
    expect(item.rationale).toBe("標準管理規約では第2項で同居者への義務を明記しており、追加が推奨される");
    expect(item.relatedLawRefs).toEqual(["区分所有法第46条第2項"]);
    expect(item.currentText).toBe(sampleArticle.content);
    expect(item.standardText).toBe(makeRelatedDoc().content);
    expect(item.standardRef).toBe("標準管理規約 第3条");
  });

  it("currentText が null の場合（新規追加候補）も正しく処理する", async () => {
    mockCallWithStructuredOutput.mockResolvedValueOnce({
      items: [{
        articleNum: "第17条",
        gapType: "missing",
        importance: "mandatory",
        gapSummary: "条文が存在しない",
        rationale: "新規追加が必要",
        relatedLawRefs: [],
      }],
    });

    const result = await analyzeGaps("proj-1", [
      makeArticleInput({ currentText: null, articleNum: "第17条" }),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].currentText).toBeNull();
    expect(result.items[0].gapType).toBe("missing");
  });

  it("relatedDocs が空の場合、standardText と standardRef は空文字になる", async () => {
    mockCallWithStructuredOutput.mockResolvedValueOnce({
      items: [{
        articleNum: "第3条",
        gapType: "partial",
        importance: "recommended",
        gapSummary: "ギャップあり",
        rationale: "理由",
        relatedLawRefs: [],
      }],
    });

    const result = await analyzeGaps("proj-1", [
      makeArticleInput({ relatedDocs: [] }),
    ]);

    expect(result.items[0].standardText).toBe("");
    expect(result.items[0].standardRef).toBe("");
  });
});

// ========== キャッシュ ==========

describe("analyzeGaps — キャッシュ動作", () => {
  it("キャッシュヒット時は Claude API を呼ばない", async () => {
    const cachedItem: GapAnalysisItem = {
      articleNum: "第3条",
      category: "第1章",
      currentText: sampleArticle.content,
      standardText: "標準条文テキスト",
      standardRef: "標準管理規約 第3条",
      gapSummary: "キャッシュ済みのギャップ概要",
      gapType: "compliant",
      importance: "optional",
      rationale: "キャッシュ済みの理由",
      relatedLawRefs: [],
    };
    mockGetCachedResponse.mockResolvedValueOnce(cachedItem);

    const result = await analyzeGaps("proj-1", [makeArticleInput()]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].gapSummary).toBe("キャッシュ済みのギャップ概要");
    expect(mockCallWithStructuredOutput).not.toHaveBeenCalled();
  });

  it("キャッシュミス時は Claude API を呼び、結果をキャッシュに保存する", async () => {
    mockGetCachedResponse.mockResolvedValue(null);
    mockCallWithStructuredOutput.mockResolvedValueOnce({
      items: [{
        articleNum: "第3条",
        gapType: "partial",
        importance: "recommended",
        gapSummary: "ギャップあり",
        rationale: "理由",
        relatedLawRefs: [],
      }],
    });

    await analyzeGaps("proj-1", [makeArticleInput()]);

    expect(mockCallWithStructuredOutput).toHaveBeenCalledTimes(1);
    expect(mockSetCachedResponse).toHaveBeenCalledTimes(1);
    expect(mockSetCachedResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ articleNum: "第3条" }),
      30,
    );
  });

  it("一部がキャッシュヒット、一部がミスの場合は混在して返す", async () => {
    const cachedItem: GapAnalysisItem = {
      articleNum: "第1条",
      category: "第1章",
      currentText: "キャッシュ済み条文",
      standardText: "",
      standardRef: "",
      gapSummary: "キャッシュ済み",
      gapType: "compliant",
      importance: "optional",
      rationale: "キャッシュ済み理由",
      relatedLawRefs: [],
    };

    // バッチ内で1件目がキャッシュヒット、2件目がミス
    let callCount = 0;
    mockGetCachedResponse.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return cachedItem;
      return null;
    });

    // 2件目はバッチ分析の返却値
    mockCallWithStructuredOutput.mockResolvedValueOnce({
      items: [{
        articleNum: "第3条",
        gapType: "partial",
        importance: "recommended",
        gapSummary: "API分析結果",
        rationale: "API理由",
        relatedLawRefs: [],
      }],
    });

    const result = await analyzeGaps("proj-1", [
      makeArticleInput({ articleNum: "第1条", currentText: "キャッシュ済み条文" }),
      makeArticleInput({ articleNum: "第3条" }),
    ]);

    expect(result.items).toHaveLength(2);
    // キャッシュ済み + API結果が混在
    const articleNums = result.items.map((i) => i.articleNum);
    expect(articleNums).toContain("第1条");
    expect(articleNums).toContain("第3条");
  });
});

// ========== バッチ分析（analyzeBatchArticles） ==========

describe("analyzeGaps — バッチ分析", () => {
  it("複数条文をバッチで分析し、全結果を返す", async () => {
    const articleNums = ["第1条", "第2条", "第3条"];
    mockCallWithStructuredOutput.mockResolvedValueOnce(makeBatchAnalysisOutput(articleNums));

    const articles = articleNums.map((num) =>
      makeArticleInput({ articleNum: num }),
    );

    const result = await analyzeGaps("proj-batch", articles);

    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.articleNum)).toEqual(articleNums);
    expect(result.summary.totalArticles).toBe(3);
    // 全て outdated → actionRequired = 3, compliant = 0
    expect(result.summary.actionRequired).toBe(3);
    expect(result.summary.compliant).toBe(0);
  });

  it("BATCH_SIZE (10) 超の場合、複数バッチに分割される", async () => {
    const articleNums = Array.from({ length: 12 }, (_, i) => `第${i + 1}条`);
    const articles = articleNums.map((num) => makeArticleInput({ articleNum: num }));

    // concurrency=1 で順次実行し、各バッチの結果を正しくマッピング
    mockCallWithStructuredOutput
      .mockResolvedValueOnce(makeBatchAnalysisOutput(articleNums.slice(0, 10)))
      .mockResolvedValueOnce(makeBatchAnalysisOutput(articleNums.slice(10)));

    const result = await analyzeGaps("proj-large", articles, undefined, 1);

    expect(result.items).toHaveLength(12);
    // 2回の API 呼び出し（10件バッチ + 2件バッチ）
    expect(mockCallWithStructuredOutput).toHaveBeenCalledTimes(2);
  });

  it("バッチ結果に一部条文が欠けた場合、単一条文分析にフォールバックする", async () => {
    const articles = [
      makeArticleInput({ articleNum: "第1条" }),
      makeArticleInput({ articleNum: "第2条" }),
      makeArticleInput({ articleNum: "第3条" }),
    ];

    // バッチ結果で第2条が欠落
    mockCallWithStructuredOutput
      .mockResolvedValueOnce({
        items: [
          {
            articleNum: "第1条",
            gapType: "compliant",
            importance: "optional",
            gapSummary: "準拠済み",
            rationale: "問題なし",
            relatedLawRefs: [],
          },
          {
            articleNum: "第3条",
            gapType: "partial",
            importance: "recommended",
            gapSummary: "一部対応",
            rationale: "追加推奨",
            relatedLawRefs: [],
          },
        ],
      })
      // フォールバック: 第2条の単一分析
      .mockResolvedValueOnce(
        makeSingleAnalysisOutput({ gapSummary: "フォールバック分析結果" }),
      );

    const result = await analyzeGaps("proj-fallback", articles);

    expect(result.items).toHaveLength(3);
    const article2 = result.items.find((i) => i.articleNum === "第2条");
    expect(article2).toBeDefined();
    expect(article2!.gapSummary).toBe("フォールバック分析結果");
  });
});

// ========== エラーハンドリング ==========

describe("analyzeGaps — エラーハンドリング", () => {
  it("バッチ全体が失敗した場合、errors に記録されるが他バッチは続行する", async () => {
    // 20件 → 2バッチ（10+10）、concurrency=1 で順次実行
    const articleNums = Array.from({ length: 20 }, (_, i) => `第${i + 1}条`);
    const articles = articleNums.map((num) => makeArticleInput({ articleNum: num }));

    mockCallWithStructuredOutput
      .mockRejectedValueOnce(new Error("API エラー"))
      .mockResolvedValueOnce(makeBatchAnalysisOutput(articleNums.slice(10)));

    const result = await analyzeGaps("proj-error", articles, undefined, 1);

    // バッチ1は失敗（0件）、バッチ2は成功（10件）
    expect(result.items).toHaveLength(10);
    expect(result.items[0].articleNum).toBe("第11条");
  });

  it("onBatchComplete コールバックが進捗を正しく報告する", async () => {
    const articles = [
      makeArticleInput({ articleNum: "第1条" }),
      makeArticleInput({ articleNum: "第2条" }),
    ];

    mockCallWithStructuredOutput.mockResolvedValueOnce(
      makeBatchAnalysisOutput(["第1条", "第2条"]),
    );

    const onBatchComplete = vi.fn();

    await analyzeGaps("proj-cb", articles, onBatchComplete, 1);

    expect(onBatchComplete).toHaveBeenCalledTimes(1);
    expect(onBatchComplete).toHaveBeenCalledWith(2, 2, ["第1条", "第2条"]);
  });

  it("バッチ失敗時も onBatchComplete が呼ばれる", async () => {
    const articles = [makeArticleInput({ articleNum: "第1条" })];

    mockCallWithStructuredOutput.mockRejectedValueOnce(new Error("タイムアウト"));

    const onBatchComplete = vi.fn();

    await analyzeGaps("proj-err-cb", articles, onBatchComplete, 1);

    expect(onBatchComplete).toHaveBeenCalledTimes(1);
    expect(onBatchComplete).toHaveBeenCalledWith(1, 1, ["第1条"]);
  });

  it("フォールバック単一分析も失敗した場合、その条文はスキップされる", async () => {
    const articles = [
      makeArticleInput({ articleNum: "第1条" }),
      makeArticleInput({ articleNum: "第2条" }),
    ];

    // バッチ結果で第2条が欠落
    mockCallWithStructuredOutput
      .mockResolvedValueOnce({
        items: [{
          articleNum: "第1条",
          gapType: "compliant",
          importance: "optional",
          gapSummary: "OK",
          rationale: "問題なし",
          relatedLawRefs: [],
        }],
      })
      // フォールバックも失敗
      .mockRejectedValueOnce(new Error("フォールバック失敗"));

    const result = await analyzeGaps("proj-skip", articles);

    // 第2条はスキップされ、第1条のみ
    expect(result.items).toHaveLength(1);
    expect(result.items[0].articleNum).toBe("第1条");
  });
});

// ========== サマリー生成 ==========

describe("analyzeGaps — サマリー生成", () => {
  it("ギャップ種類別・重要度別のカウントが正しい", async () => {
    const articles = [
      makeArticleInput({ articleNum: "第1条" }),
      makeArticleInput({ articleNum: "第2条" }),
      makeArticleInput({ articleNum: "第3条" }),
      makeArticleInput({ articleNum: "第4条" }),
    ];

    mockCallWithStructuredOutput.mockResolvedValueOnce({
      items: [
        { articleNum: "第1条", gapType: "compliant", importance: "optional", gapSummary: "", rationale: "", relatedLawRefs: [] },
        { articleNum: "第2条", gapType: "missing", importance: "mandatory", gapSummary: "", rationale: "", relatedLawRefs: [] },
        { articleNum: "第3条", gapType: "outdated", importance: "mandatory", gapSummary: "", rationale: "", relatedLawRefs: [] },
        { articleNum: "第4条", gapType: "partial", importance: "recommended", gapSummary: "", rationale: "", relatedLawRefs: [] },
      ],
    });

    const result = await analyzeGaps("proj-summary", articles);

    expect(result.summary).toEqual({
      totalArticles: 4,
      actionRequired: 3,   // missing + outdated + partial
      compliant: 1,
      byImportance: { mandatory: 2, recommended: 1, optional: 1 },
      byGapType: { missing: 1, outdated: 1, partial: 1, compliant: 1, custom: 0 },
    });
  });

  it("全て compliant の場合、actionRequired は 0 になる", async () => {
    const articles = [
      makeArticleInput({ articleNum: "第1条" }),
      makeArticleInput({ articleNum: "第2条" }),
    ];

    mockCallWithStructuredOutput.mockResolvedValueOnce({
      items: [
        { articleNum: "第1条", gapType: "compliant", importance: "optional", gapSummary: "", rationale: "", relatedLawRefs: [] },
        { articleNum: "第2条", gapType: "compliant", importance: "optional", gapSummary: "", rationale: "", relatedLawRefs: [] },
      ],
    });

    const result = await analyzeGaps("proj-all-ok", articles);

    expect(result.summary.actionRequired).toBe(0);
    expect(result.summary.compliant).toBe(2);
  });

  it("分析対象が 0 件の場合、空の結果を返す", async () => {
    const result = await analyzeGaps("proj-empty", []);

    expect(result.items).toHaveLength(0);
    expect(result.summary.totalArticles).toBe(0);
    expect(mockCallWithStructuredOutput).not.toHaveBeenCalled();
  });
});

// ========== analyzedAt ==========

describe("analyzeGaps — メタデータ", () => {
  it("analyzedAt が ISO 8601 形式の文字列を返す", async () => {
    mockCallWithStructuredOutput.mockResolvedValueOnce(
      makeBatchAnalysisOutput(["第1条"]),
    );

    const result = await analyzeGaps("proj-meta", [makeArticleInput({ articleNum: "第1条" })]);

    // ISO 8601 パターンチェック
    expect(result.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(result.analyzedAt).toString()).not.toBe("Invalid Date");
  });
});

// ========== concurrency ==========

describe("analyzeGaps — concurrency 制御", () => {
  it("concurrency=1 の場合、バッチが順次実行される", async () => {
    const callOrder: number[] = [];
    const articleNums1 = Array.from({ length: 10 }, (_, i) => `第${i + 1}条`);
    const articleNums2 = Array.from({ length: 5 }, (_, i) => `第${i + 11}条`);
    const articles = [...articleNums1, ...articleNums2].map((num) =>
      makeArticleInput({ articleNum: num }),
    );

    mockCallWithStructuredOutput
      .mockImplementationOnce(async () => {
        callOrder.push(1);
        return makeBatchAnalysisOutput(articleNums1);
      })
      .mockImplementationOnce(async () => {
        callOrder.push(2);
        return makeBatchAnalysisOutput(articleNums2);
      });

    await analyzeGaps("proj-seq", articles, undefined, 1);

    expect(callOrder).toEqual([1, 2]);
    expect(mockCallWithStructuredOutput).toHaveBeenCalledTimes(2);
  });
});
