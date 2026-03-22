import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DraftRequest, DraftResult } from "@/domains/drafting/types";
import { SAMPLE_GAP_RESULTS } from "@/test/fixtures/sample-bylaws";

// ---------- モック ----------

// logger のモック（テスト中にログ出力を抑制）
vi.mock("@/shared/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Claude API のモック
const mockCallWithStructuredOutput = vi.fn();
vi.mock("@/shared/ai/claude", () => ({
  callWithStructuredOutput: (...args: unknown[]) =>
    mockCallWithStructuredOutput(...args),
  MODELS: { ANALYSIS: "claude-sonnet-4-5-20250929" },
}));

// キャッシュのモック
const mockGetCachedResponse = vi.fn();
const mockSetCachedResponse = vi.fn();
const mockGenerateCacheKey = vi.fn();
vi.mock("@/shared/ai/cache", () => ({
  getCachedResponse: (...args: unknown[]) => mockGetCachedResponse(...args),
  setCachedResponse: (...args: unknown[]) => mockSetCachedResponse(...args),
  generateCacheKey: (...args: unknown[]) => mockGenerateCacheKey(...args),
}));

// ---------- テストデータ ----------

/** 標準的なマンション属性コンテキスト */
const DEFAULT_CONDO_CONTEXT: DraftRequest["condoContext"] = {
  condoName: "テストマンション",
  condoType: "corporate",
  unitCount: "medium",
};

/** ギャップ分析結果からドラフトリクエストを生成するヘルパー */
function createDraftRequest(
  overrides: Partial<DraftRequest> = {},
): DraftRequest {
  return {
    articleNum: "第3条",
    category: "遵守義務",
    currentText:
      "区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。",
    standardText:
      "区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。\n2 区分所有者は、同居する者に対してこの規約及び総会の決議を遵守させなければならない。",
    gapSummary: "第2項（同居者への遵守義務）を追加する。",
    importance: "optional",
    condoContext: DEFAULT_CONDO_CONTEXT,
    ...overrides,
  };
}

/** Claude API が返す標準的なドラフト出力 */
function createMockDraftOutput(articleNum: string = "第3条") {
  return {
    draft: `${articleNum}（改定案）改定された条文テキスト`,
    summary: "改定内容の要約テスト",
    explanation: "改定理由の解説テスト",
    baseRef: `標準管理規約 ${articleNum}`,
  };
}

// ---------- テスト ----------

describe("Drafter — generateDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedResponse.mockResolvedValue(null);
    mockSetCachedResponse.mockResolvedValue(undefined);
    mockGenerateCacheKey.mockReturnValue("mock-cache-key");
    mockCallWithStructuredOutput.mockResolvedValue(
      createMockDraftOutput("第3条"),
    );
  });

  it("tool_use で構造化ドラフトを生成する", async () => {
    const { generateDraft } = await import("@/domains/drafting/drafter");
    const request = createDraftRequest();

    const result = await generateDraft(request);

    expect(result).toEqual<DraftResult>({
      articleNum: "第3条",
      draft: "第3条（改定案）改定された条文テキスト",
      summary: "改定内容の要約テスト",
      explanation: "改定理由の解説テスト",
      importance: "optional",
      baseRef: "標準管理規約 第3条",
      category: "遵守義務",
    });
  });

  it("callWithStructuredOutput に正しいパラメータを渡す", async () => {
    const { generateDraft } = await import("@/domains/drafting/drafter");
    const request = createDraftRequest();

    await generateDraft(request);

    expect(mockCallWithStructuredOutput).toHaveBeenCalledOnce();
    const callArgs = mockCallWithStructuredOutput.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-sonnet-4-5-20250929");
    expect(callArgs.system).toContain("マンション管理規約の専門家");
    expect(callArgs.system).toContain("管理組合法人");
    expect(callArgs.system).toContain("テストマンション");
    expect(callArgs.userMessage).toContain("第3条");
    expect(callArgs.userMessage).toContain("遵守義務");
    expect(callArgs.tool.name).toBe("output_draft");
  });

  it("新規追加（currentText が null）の場合、プロンプトが新規用になる", async () => {
    const { generateDraft } = await import("@/domains/drafting/drafter");
    const request = createDraftRequest({
      articleNum: "第47条",
      currentText: null,
      gapSummary: "電子議決権行使に関する条文を新設する",
    });

    await generateDraft(request);

    const callArgs = mockCallWithStructuredOutput.mock.calls[0][0];
    expect(callArgs.userMessage).toContain("現行規約にこの条文は存在しません");
    expect(callArgs.userMessage).toContain("新規条文のドラフトを生成");
  });

  it("非法人の場合、システムプロンプトに反映される", async () => {
    const { generateDraft } = await import("@/domains/drafting/drafter");
    const request = createDraftRequest({
      condoContext: {
        condoName: "非法人マンション",
        condoType: "non-corporate",
        unitCount: "small",
      },
    });

    await generateDraft(request);

    const callArgs = mockCallWithStructuredOutput.mock.calls[0][0];
    expect(callArgs.system).toContain("法人格を持たない");
    expect(callArgs.system).toContain("権利能力なき社団");
    expect(callArgs.system).toContain("小規模");
  });

  describe("キャッシュ動作", () => {
    it("キャッシュヒット時は API を呼ばずにキャッシュ結果を返す", async () => {
      const cachedResult: DraftResult = {
        articleNum: "第3条",
        draft: "キャッシュされたドラフト",
        summary: "キャッシュ要約",
        explanation: "キャッシュ解説",
        importance: "optional",
        baseRef: "標準管理規約 第3条",
        category: "遵守義務",
      };
      mockGetCachedResponse.mockResolvedValue(cachedResult);

      const { generateDraft } = await import("@/domains/drafting/drafter");
      const result = await generateDraft(createDraftRequest());

      expect(result).toEqual(cachedResult);
      expect(mockCallWithStructuredOutput).not.toHaveBeenCalled();
    });

    it("キャッシュミス時は API を呼び、結果をキャッシュ保存する", async () => {
      mockGetCachedResponse.mockResolvedValue(null);

      const { generateDraft } = await import("@/domains/drafting/drafter");
      await generateDraft(createDraftRequest());

      expect(mockCallWithStructuredOutput).toHaveBeenCalledOnce();
      expect(mockSetCachedResponse).toHaveBeenCalledWith(
        "mock-cache-key",
        expect.objectContaining({ articleNum: "第3条" }),
        30,
      );
    });

    it("generateCacheKey に正しい引数を渡す", async () => {
      const { generateDraft } = await import("@/domains/drafting/drafter");
      const request = createDraftRequest();

      await generateDraft(request);

      expect(mockGenerateCacheKey).toHaveBeenCalledWith(
        "draft",
        "第3条",
        request.currentText,
        request.standardText,
        "corporate",
        "medium",
      );
    });
  });

  describe("エラーハンドリング", () => {
    it("API エラーが伝播する", async () => {
      mockCallWithStructuredOutput.mockRejectedValue(
        new Error("API rate limit exceeded"),
      );

      const { generateDraft } = await import("@/domains/drafting/drafter");
      await expect(generateDraft(createDraftRequest())).rejects.toThrow(
        "API rate limit exceeded",
      );
    });
  });
});

describe("Drafter — batchGenerateDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedResponse.mockResolvedValue(null);
    mockSetCachedResponse.mockResolvedValue(undefined);
    mockGenerateCacheKey.mockReturnValue("mock-cache-key");
  });

  it("複数条文のドラフトを並列生成する", async () => {
    mockCallWithStructuredOutput
      .mockResolvedValueOnce(createMockDraftOutput("第3条"))
      .mockResolvedValueOnce(createMockDraftOutput("第47条"))
      .mockResolvedValueOnce(createMockDraftOutput("第25条"));

    const { batchGenerateDrafts } = await import("@/domains/drafting/drafter");
    const requests = [
      createDraftRequest({ articleNum: "第3条" }),
      createDraftRequest({ articleNum: "第47条", currentText: null }),
      createDraftRequest({ articleNum: "第25条" }),
    ];

    const result = await batchGenerateDrafts(requests, 3);

    expect(result.drafts).toHaveLength(3);
    expect(result.failures).toHaveLength(0);
    expect(result.generatedAt).toBeTruthy();
    expect(result.drafts.map((d) => d.articleNum)).toEqual([
      "第3条",
      "第47条",
      "第25条",
    ]);
  });

  it("concurrency に従いバッチ分割される", async () => {
    // 5件のリクエスト、concurrency=2 → 3バッチ (2+2+1)
    const requests = Array.from({ length: 5 }, (_, i) =>
      createDraftRequest({ articleNum: `第${i + 1}条` }),
    );

    for (let i = 0; i < 5; i++) {
      mockCallWithStructuredOutput.mockResolvedValueOnce(
        createMockDraftOutput(`第${i + 1}条`),
      );
    }

    const { batchGenerateDrafts } = await import("@/domains/drafting/drafter");
    const result = await batchGenerateDrafts(requests, 2);

    expect(result.drafts).toHaveLength(5);
    expect(result.failures).toHaveLength(0);
  });

  it("一部失敗時も他の結果は返す", async () => {
    mockCallWithStructuredOutput
      .mockResolvedValueOnce(createMockDraftOutput("第3条"))
      .mockRejectedValueOnce(new Error("API エラー"))
      .mockResolvedValueOnce(createMockDraftOutput("第25条"));

    const { batchGenerateDrafts } = await import("@/domains/drafting/drafter");
    const requests = [
      createDraftRequest({ articleNum: "第3条" }),
      createDraftRequest({ articleNum: "第47条" }),
      createDraftRequest({ articleNum: "第25条" }),
    ];

    const result = await batchGenerateDrafts(requests, 3);

    expect(result.drafts).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toEqual({
      articleNum: "第47条",
      error: "API エラー",
    });
  });

  it("全件失敗しても空の drafts を返す", async () => {
    mockCallWithStructuredOutput.mockRejectedValue(
      new Error("サービス停止中"),
    );

    const { batchGenerateDrafts } = await import("@/domains/drafting/drafter");
    const requests = [
      createDraftRequest({ articleNum: "第3条" }),
      createDraftRequest({ articleNum: "第47条" }),
    ];

    const result = await batchGenerateDrafts(requests, 2);

    expect(result.drafts).toHaveLength(0);
    expect(result.failures).toHaveLength(2);
  });

  it("空のリクエスト配列を渡すと空の結果を返す", async () => {
    const { batchGenerateDrafts } = await import("@/domains/drafting/drafter");
    const result = await batchGenerateDrafts([], 3);

    expect(result.drafts).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    expect(mockCallWithStructuredOutput).not.toHaveBeenCalled();
  });
});

describe("Drafter — generateDraftsWithStrategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetCachedResponse.mockResolvedValue(null);
    mockSetCachedResponse.mockResolvedValue(undefined);
    mockGenerateCacheKey.mockReturnValue("mock-cache-key");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** テスト用に sleep を自動消化するヘルパー */
  async function runWithFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
    const promise = fn();
    // sleep を消化するため定期的に advanceTimersByTimeAsync を呼ぶ
    for (let i = 0; i < 50; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    return promise;
  }

  describe("smart モード", () => {
    it("重要度の高い順にソートして処理する", async () => {
      const calledArticles: string[] = [];
      mockCallWithStructuredOutput.mockImplementation(async (params: { userMessage: string }) => {
        // userMessage から条番号を抽出して呼び出し順を記録
        const match = params.userMessage.match(/条番号: (第\d+条)/);
        if (match) calledArticles.push(match[1]);
        return createMockDraftOutput(match?.[1] ?? "不明");
      });

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );

      const requests = [
        createDraftRequest({
          articleNum: "第3条",
          importance: "optional",
        }),
        createDraftRequest({
          articleNum: "第47条",
          importance: "mandatory",
        }),
        createDraftRequest({
          articleNum: "第25条",
          importance: "recommended",
        }),
      ];

      const result = await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "smart"),
      );

      expect(result.drafts).toHaveLength(3);
      // mandatory → recommended → optional の順にソートされている
      // concurrency=2 なので [mandatory, recommended] が最初のバッチ
      expect(calledArticles[0]).toBe("第47条"); // mandatory
      expect(calledArticles[1]).toBe("第25条"); // recommended
      expect(calledArticles[2]).toBe("第3条"); // optional
    });

    it("2並列で処理される", async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      mockCallWithStructuredOutput.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        // 少しだけ待機して並列度を確認
        await new Promise((r) => setTimeout(r, 10));
        concurrentCalls--;
        return createMockDraftOutput();
      });

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );

      const requests = Array.from({ length: 4 }, (_, i) =>
        createDraftRequest({ articleNum: `第${i + 1}条` }),
      );

      await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "smart"),
      );

      // 2並列なので最大同時実行数は2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it("失敗した条文は自動リトライされる", async () => {
      let callCount = 0;
      mockCallWithStructuredOutput.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("一時的なエラー");
        }
        return createMockDraftOutput("第3条");
      });

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );
      const requests = [createDraftRequest({ articleNum: "第3条" })];

      const result = await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "smart"),
      );

      // リトライで成功
      expect(result.drafts).toHaveLength(1);
      expect(result.failures).toHaveLength(0);
      expect(callCount).toBe(2); // 初回 + リトライ
    });

    it("リトライも失敗した場合は failures に追加される", async () => {
      mockCallWithStructuredOutput.mockRejectedValue(
        new Error("永続的なエラー"),
      );

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );
      const requests = [createDraftRequest({ articleNum: "第3条" })];

      const result = await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "smart"),
      );

      expect(result.drafts).toHaveLength(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].articleNum).toBe("第3条");
    });

    it("進捗コールバックが呼ばれる", async () => {
      mockCallWithStructuredOutput.mockResolvedValue(createMockDraftOutput());

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );
      const onProgress = vi.fn();
      const requests = [
        createDraftRequest({ articleNum: "第3条", importance: "mandatory" }),
        createDraftRequest({ articleNum: "第47条", importance: "optional" }),
      ];

      await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "smart", onProgress),
      );

      expect(onProgress).toHaveBeenCalled();
      // 各条文の生成完了時にコールバックが呼ばれる
      const calls = onProgress.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      // コールバック引数: (completedCount, totalCount, articleNum, phase)
      for (const call of calls) {
        expect(call[1]).toBe(2); // totalCount
        expect(["generation", "retry"]).toContain(call[3]); // phase
      }
    });
  });

  describe("precise モード", () => {
    it("1件ずつ直列で処理する", async () => {
      const callOrder: string[] = [];
      mockCallWithStructuredOutput.mockImplementation(async (params: { userMessage: string }) => {
        const match = params.userMessage.match(/条番号: (第\d+条)/);
        if (match) callOrder.push(match[1]);
        return createMockDraftOutput(match?.[1] ?? "不明");
      });

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );
      const requests = [
        createDraftRequest({ articleNum: "第3条" }),
        createDraftRequest({ articleNum: "第47条" }),
        createDraftRequest({ articleNum: "第25条" }),
      ];

      const result = await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "precise"),
      );

      expect(result.drafts).toHaveLength(3);
      // precise モードはソートしない — リクエスト順で処理
      expect(callOrder).toEqual(["第3条", "第47条", "第25条"]);
    });

    it("失敗時は2秒待機後に1回リトライする", async () => {
      let callCount = 0;
      mockCallWithStructuredOutput.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("一時的なエラー");
        }
        return createMockDraftOutput("第3条");
      });

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );
      const requests = [createDraftRequest({ articleNum: "第3条" })];

      const result = await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "precise"),
      );

      expect(result.drafts).toHaveLength(1);
      expect(result.failures).toHaveLength(0);
      expect(callCount).toBe(2);
    });

    it("リトライも失敗した場合は failures に記録する", async () => {
      mockCallWithStructuredOutput.mockRejectedValue(
        new Error("永続的なエラー"),
      );

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );
      const requests = [createDraftRequest({ articleNum: "第3条" })];

      const result = await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "precise"),
      );

      expect(result.drafts).toHaveLength(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].articleNum).toBe("第3条");
      expect(result.failures[0].error).toBe("永続的なエラー");
    });

    it("進捗コールバックが各条文で呼ばれる", async () => {
      mockCallWithStructuredOutput.mockResolvedValue(createMockDraftOutput());

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );
      const onProgress = vi.fn();
      const requests = [
        createDraftRequest({ articleNum: "第3条" }),
        createDraftRequest({ articleNum: "第47条" }),
      ];

      await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "precise", onProgress),
      );

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(1, 2, "第3条", "generation");
      expect(onProgress).toHaveBeenCalledWith(2, 2, "第47条", "generation");
    });
  });

  describe("フィクスチャデータとの統合テスト", () => {
    it("SAMPLE_GAP_RESULTS からドラフトリクエストを生成して処理できる", async () => {
      // ギャップ分析結果から DraftRequest への変換
      const requests: DraftRequest[] = SAMPLE_GAP_RESULTS.map((gap) => ({
        articleNum: gap.articleNumber,
        category: gap.category,
        currentText: gap.currentText === "（規定なし）" ? null : gap.currentText,
        standardText: gap.standardText,
        gapSummary: gap.recommendation,
        importance:
          gap.severity === "critical"
            ? ("mandatory" as const)
            : gap.severity === "major"
              ? ("recommended" as const)
              : ("optional" as const),
        condoContext: DEFAULT_CONDO_CONTEXT,
      }));

      mockCallWithStructuredOutput.mockImplementation(
        async (params: { userMessage: string }) => {
          const match = params.userMessage.match(/条番号: (第\d+条)/);
          return createMockDraftOutput(match?.[1] ?? "不明");
        },
      );

      const { generateDraftsWithStrategy } = await import(
        "@/domains/drafting/drafter"
      );

      const result = await runWithFakeTimers(() =>
        generateDraftsWithStrategy(requests, "smart"),
      );

      // 5件全て成功
      expect(result.drafts).toHaveLength(5);
      expect(result.failures).toHaveLength(0);

      // smart モードでは mandatory が先に処理される
      // mandatory: 第47条, 第25条 → recommended: 第17条, 第15条 → optional: 第3条
      const articleNums = result.drafts.map((d) => d.articleNum);
      const mandatoryArticles = requests
        .filter((r) => r.importance === "mandatory")
        .map((r) => r.articleNum);
      const optionalArticles = requests
        .filter((r) => r.importance === "optional")
        .map((r) => r.articleNum);

      // mandatory が optional より先に完了している
      for (const mArticle of mandatoryArticles) {
        for (const oArticle of optionalArticles) {
          const mIdx = articleNums.indexOf(mArticle);
          const oIdx = articleNums.indexOf(oArticle);
          if (mIdx !== -1 && oIdx !== -1) {
            expect(mIdx).toBeLessThan(oIdx);
          }
        }
      }
    });
  });
});

describe("Drafter — BatchDraftResult 構造", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedResponse.mockResolvedValue(null);
    mockSetCachedResponse.mockResolvedValue(undefined);
    mockGenerateCacheKey.mockReturnValue("mock-cache-key");
    mockCallWithStructuredOutput.mockResolvedValue(createMockDraftOutput());
  });

  it("generatedAt が ISO 8601 形式の日時文字列である", async () => {
    const { batchGenerateDrafts } = await import("@/domains/drafting/drafter");
    const result = await batchGenerateDrafts(
      [createDraftRequest()],
      1,
    );

    expect(result.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    // 有効な日時としてパースできる
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  it("DraftResult に必要な全フィールドが含まれる", async () => {
    const { generateDraft } = await import("@/domains/drafting/drafter");
    const result = await generateDraft(createDraftRequest());

    expect(result).toHaveProperty("articleNum");
    expect(result).toHaveProperty("draft");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("explanation");
    expect(result).toHaveProperty("importance");
    expect(result).toHaveProperty("baseRef");
    expect(result).toHaveProperty("category");
  });
});

describe("Drafter — エッジケース", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedResponse.mockResolvedValue(null);
    mockSetCachedResponse.mockResolvedValue(undefined);
    mockGenerateCacheKey.mockReturnValue("mock-cache-key");
  });

  it("非 Error オブジェクトのエラーも文字列化して failures に記録する", async () => {
    mockCallWithStructuredOutput.mockRejectedValue("文字列エラー");

    const { batchGenerateDrafts } = await import("@/domains/drafting/drafter");
    const result = await batchGenerateDrafts(
      [createDraftRequest({ articleNum: "第3条" })],
      1,
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].error).toBe("文字列エラー");
  });

  it("規模区分ごとの説明がプロンプトに反映される", async () => {
    mockCallWithStructuredOutput.mockResolvedValue(createMockDraftOutput());

    const { generateDraft } = await import("@/domains/drafting/drafter");

    const testCases: Array<{
      unitCount: DraftRequest["condoContext"]["unitCount"];
      expected: string;
    }> = [
      { unitCount: "small", expected: "小規模" },
      { unitCount: "medium", expected: "中規模" },
      { unitCount: "large", expected: "大規模" },
      { unitCount: "xlarge", expected: "超大規模" },
    ];

    for (const { unitCount, expected } of testCases) {
      vi.clearAllMocks();
      mockGetCachedResponse.mockResolvedValue(null);
      mockSetCachedResponse.mockResolvedValue(undefined);
      mockGenerateCacheKey.mockReturnValue("mock-cache-key");
      mockCallWithStructuredOutput.mockResolvedValue(createMockDraftOutput());

      await generateDraft(
        createDraftRequest({
          condoContext: {
            condoName: "テスト",
            condoType: "corporate",
            unitCount,
          },
        }),
      );

      const callArgs = mockCallWithStructuredOutput.mock.calls[0][0];
      expect(callArgs.system).toContain(expected);
    }
  });
});
