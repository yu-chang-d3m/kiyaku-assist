import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateChatResponse } from "@/domains/chat/rag";
import { DISCLAIMER_MESSAGE } from "@/domains/chat/guardrails";
import type { ChatRequest, ChatResponse } from "@/domains/chat/types";
import {
  createMockClaudeClient,
  createMockClaudeTextResponse,
} from "@/test/mocks/claude";

// ---------- モック設定 ----------

// logger のモック（テスト中にログ出力を抑制）
vi.mock("@/shared/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Vertex AI Search のモック
const mockSearchStandardRules = vi.fn();
vi.mock("@/shared/ai/search", () => ({
  searchStandardRules: (...args: unknown[]) => mockSearchStandardRules(...args),
}));

// Claude クライアントのモック
const mockClaudeClient = createMockClaudeClient();
vi.mock("@/shared/ai/claude", () => ({
  getClaudeClient: () => mockClaudeClient,
  MODELS: { CHAT: "claude-sonnet-4-5-20250929" },
  callWithRetry: async (fn: () => Promise<unknown>) => fn(),
}));

// ---------- テスト用ヘルパー ----------

/** 標準的なチャットリクエストを生成 */
function buildRequest(
  message: string,
  history: ChatRequest["history"] = [],
): ChatRequest {
  return {
    projectId: "test-project-001",
    message,
    history,
  };
}

/** 検索結果のサンプルデータ */
const SAMPLE_SEARCH_RESULTS = [
  {
    content:
      "区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。",
    metadata: { ref: "標準管理規約 第3条" },
    relevanceScore: 0.95,
  },
  {
    content:
      "管理組合は、別に定めるところにより、特定の区分所有者に駐車場の使用を認めることができる。",
    metadata: { ref: "標準管理規約 第15条" },
    relevanceScore: 0.88,
  },
  {
    content:
      "理事会は、理事長、副理事長、会計担当理事、理事及び監事をもって構成する。",
    metadata: { ref: "標準管理規約 第50条" },
    relevanceScore: 0.42, // 低スコア — 参照に含まれないはず
  },
];

// ---------- テスト ----------

describe("RAG パイプライン — generateChatResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // デフォルト: 検索結果ありで正常応答
    mockSearchStandardRules.mockResolvedValue(SAMPLE_SEARCH_RESULTS);
    mockClaudeClient._mockCreate.mockResolvedValue(
      createMockClaudeTextResponse(
        "標準管理規約第3条では、区分所有者は規約及び総会の決議を誠実に遵守する義務があると定めています。\n※ 本回答は情報提供を目的としたものであり、法的助言ではありません。",
      ),
    );
  });

  // ========== 正常フロー ==========

  describe("正常フロー: 検索 → 生成 → 返却", () => {
    it("検索結果をコンテキストとして Claude に渡し回答を生成する", async () => {
      const request = buildRequest("管理規約の遵守義務について教えて");
      const response = await generateChatResponse(request);

      // 検索が呼ばれたことを確認
      expect(mockSearchStandardRules).toHaveBeenCalledWith(
        "管理規約の遵守義務について教えて",
        5,
      );

      // Claude が呼ばれたことを確認
      expect(mockClaudeClient._mockCreate).toHaveBeenCalledOnce();

      // レスポンスが正しい構造を持つことを確認
      expect(response.message.role).toBe("assistant");
      expect(response.message.content).toContain("標準管理規約第3条");
      expect(response.message.id).toBeDefined();
      expect(response.message.timestamp).toBeDefined();
      expect(response.guardrailResult.status).toBe("pass");
      expect(response.guardrailResult.legalAdviceRisk).toBe(false);
    });

    it("検索結果のコンテキストが Claude への messages に含まれる", async () => {
      const request = buildRequest("駐車場の使用ルールは？");
      await generateChatResponse(request);

      const createCall = mockClaudeClient._mockCreate.mock.calls[0][0];
      const lastMessage = createCall.messages[createCall.messages.length - 1];

      // ユーザーメッセージに検索コンテキストが含まれている
      expect(lastMessage.role).toBe("user");
      expect(lastMessage.content).toContain("関連資料");
      expect(lastMessage.content).toContain("標準管理規約 第3条");
      expect(lastMessage.content).toContain("標準管理規約 第15条");
      expect(lastMessage.content).toContain("駐車場の使用ルールは？");
    });

    it("関連度スコア 0.5 以上の検索結果のみ参照情報に含まれる", async () => {
      const request = buildRequest("理事会の構成を教えて");
      const response = await generateChatResponse(request);

      // スコア 0.95 と 0.88 の 2 件だけが参照に含まれる（0.42 は除外）
      expect(response.message.references).toHaveLength(2);
      expect(response.message.references![0].ref).toBe("標準管理規約 第3条");
      expect(response.message.references![1].ref).toBe("標準管理規約 第15条");
    });

    it("会話履歴が Claude への messages に含まれる", async () => {
      const history = [
        {
          id: "msg-1",
          role: "user" as const,
          content: "管理規約について教えて",
          timestamp: "2026-03-22T10:00:00Z",
        },
        {
          id: "msg-2",
          role: "assistant" as const,
          content: "管理規約とは、マンションの共同生活に関するルールです。",
          timestamp: "2026-03-22T10:00:01Z",
        },
      ];
      const request = buildRequest("もう少し詳しく教えて", history);
      await generateChatResponse(request);

      const createCall = mockClaudeClient._mockCreate.mock.calls[0][0];
      // 履歴 2 件 + 新しいユーザーメッセージ 1 件 = 3 件
      expect(createCall.messages).toHaveLength(3);
      expect(createCall.messages[0].role).toBe("user");
      expect(createCall.messages[0].content).toBe("管理規約について教えて");
      expect(createCall.messages[1].role).toBe("assistant");
    });

    it("システムプロンプトにガードレール制約が含まれる", async () => {
      const request = buildRequest("規約改正の手続きは？");
      await generateChatResponse(request);

      const createCall = mockClaudeClient._mockCreate.mock.calls[0][0];
      expect(createCall.system).toContain("キヤクアシスト");
      expect(createCall.system).toContain("弁護士法72条");
    });

    it("metadata に ref がない場合はデフォルト出典名を使用する", async () => {
      mockSearchStandardRules.mockResolvedValue([
        {
          content: "テスト条文の内容",
          metadata: {}, // ref なし
          relevanceScore: 0.8,
        },
      ]);

      const request = buildRequest("テスト質問");
      const response = await generateChatResponse(request);

      expect(response.message.references).toHaveLength(1);
      expect(response.message.references![0].ref).toBe("標準管理規約");
    });
  });

  // ========== ガードレール: 入力ブロック ==========

  describe("ガードレール: ブロック対象の入力", () => {
    it("法的助言パターンの質問は warning で免責メッセージ付き回答を返す", async () => {
      // checkUserMessage は "訴訟" を含む質問に warning を返す
      const request = buildRequest("滞納者に対して訴訟を起こしたい");
      const response = await generateChatResponse(request);

      // warning の場合は検索・生成は行われるがガードレールが付く
      expect(response.guardrailResult.legalAdviceRisk).toBe(true);
      expect(response.message.content).toContain(DISCLAIMER_MESSAGE);
      expect(response.message.filtered).toBe(true);
    });

    it("個別判断パターンの質問は warning となり免責メッセージが追加される", async () => {
      const request = buildRequest(
        "うちのマンションの場合どうすべきですか",
      );
      const response = await generateChatResponse(request);

      expect(response.guardrailResult.status).toBe("warning");
      expect(response.guardrailResult.legalAdviceRisk).toBe(true);
      expect(response.message.content).toContain(DISCLAIMER_MESSAGE);
    });

    it("法的助言パターン検出時もシステムプロンプトに注意喚起が追加される", async () => {
      const request = buildRequest("損害賠償請求をしたい");
      await generateChatResponse(request);

      const createCall = mockClaudeClient._mockCreate.mock.calls[0][0];
      expect(createCall.system).toContain(
        "法的助言を求める意図が含まれている可能性",
      );
    });
  });

  // ========== ガードレール: 出力 warning ==========

  describe("ガードレール: AI 回答の事後チェック", () => {
    it("AI が断定的な法的判断を含む回答をした場合 warning + 免責メッセージが追加される", async () => {
      mockClaudeClient._mockCreate.mockResolvedValue(
        createMockClaudeTextResponse(
          "これは違法です。すぐに対処してください。",
        ),
      );

      const request = buildRequest("管理費の徴収方法について教えて");
      const response = await generateChatResponse(request);

      expect(response.guardrailResult.status).toBe("warning");
      expect(response.guardrailResult.legalAdviceRisk).toBe(true);
      expect(response.message.content).toContain(DISCLAIMER_MESSAGE);
      expect(response.message.filtered).toBe(true);
    });

    it("入力・出力の両方で warning の場合もマージされて warning となる", async () => {
      mockClaudeClient._mockCreate.mockResolvedValue(
        createMockClaudeTextResponse(
          "義務がありますので、対応してください。",
        ),
      );

      // 入力も法的助言パターン
      const request = buildRequest("弁護士に相談する前に知りたい");
      const response = await generateChatResponse(request);

      expect(response.guardrailResult.status).toBe("warning");
      expect(response.guardrailResult.legalAdviceRisk).toBe(true);
      expect(response.message.filtered).toBe(true);
    });

    it("AI 回答がガードレールを通過した場合は免責メッセージが追加されない", async () => {
      mockClaudeClient._mockCreate.mockResolvedValue(
        createMockClaudeTextResponse(
          "標準管理規約では、管理費の徴収について規定しています。",
        ),
      );

      const request = buildRequest("管理費の徴収方法について教えて");
      const response = await generateChatResponse(request);

      expect(response.guardrailResult.status).toBe("pass");
      expect(response.message.content).not.toContain(DISCLAIMER_MESSAGE);
      expect(response.message.filtered).toBeUndefined();
    });
  });

  // ========== 検索結果なし ==========

  describe("検索結果が空の場合", () => {
    it("検索結果が空でも Claude による回答が生成される", async () => {
      mockSearchStandardRules.mockResolvedValue([]);

      const request = buildRequest("何かの質問");
      const response = await generateChatResponse(request);

      expect(response.message.role).toBe("assistant");
      expect(response.message.content).toBeDefined();
      expect(response.message.references).toHaveLength(0);
    });

    it("検索結果が空の場合、コンテキストに「資料が見つかりませんでした」が含まれる", async () => {
      mockSearchStandardRules.mockResolvedValue([]);

      const request = buildRequest("何かの質問");
      await generateChatResponse(request);

      const createCall = mockClaudeClient._mockCreate.mock.calls[0][0];
      const lastMessage = createCall.messages[createCall.messages.length - 1];
      expect(lastMessage.content).toContain(
        "関連する資料が見つかりませんでした",
      );
    });
  });

  // ========== 検索エラーのグレースフルハンドリング ==========

  describe("検索エラー時のグレースフルハンドリング", () => {
    it("Vertex AI Search がエラーの場合でも回答を返す（コンテキストなし）", async () => {
      mockSearchStandardRules.mockRejectedValue(
        new Error("Vertex AI Search API エラー: 503"),
      );

      const request = buildRequest("管理規約について教えて");
      const response = await generateChatResponse(request);

      // エラーが発生してもレスポンスは返される
      expect(response.message.role).toBe("assistant");
      expect(response.message.content).toBeDefined();
      expect(response.message.references).toHaveLength(0);

      // Claude は呼ばれている（コンテキストなしで）
      expect(mockClaudeClient._mockCreate).toHaveBeenCalledOnce();
    });

    it("検索エラー時はコンテキストに「資料が見つかりませんでした」が含まれる", async () => {
      mockSearchStandardRules.mockRejectedValue(
        new Error("ネットワークエラー"),
      );

      const request = buildRequest("質問テスト");
      await generateChatResponse(request);

      const createCall = mockClaudeClient._mockCreate.mock.calls[0][0];
      const lastMessage = createCall.messages[createCall.messages.length - 1];
      expect(lastMessage.content).toContain(
        "関連する資料が見つかりませんでした",
      );
    });
  });

  // ========== レスポンス構造の検証 ==========

  describe("レスポンス構造の検証", () => {
    it("ChatResponse は必須フィールドをすべて持つ", async () => {
      const request = buildRequest("テスト質問");
      const response = await generateChatResponse(request);

      // ChatResponse の構造
      expect(response).toHaveProperty("message");
      expect(response).toHaveProperty("guardrailResult");

      // ChatMessage の構造
      expect(response.message).toHaveProperty("id");
      expect(response.message).toHaveProperty("role");
      expect(response.message).toHaveProperty("content");
      expect(response.message).toHaveProperty("timestamp");

      // GuardrailResult の構造
      expect(response.guardrailResult).toHaveProperty("status");
      expect(response.guardrailResult).toHaveProperty("legalAdviceRisk");
    });

    it("timestamp が ISO 8601 形式である", async () => {
      const request = buildRequest("テスト質問");
      const response = await generateChatResponse(request);

      const parsed = new Date(response.message.timestamp);
      expect(parsed.toISOString()).toBe(response.message.timestamp);
    });

    it("参照の excerpt は最大 100 文字に切り詰められる", async () => {
      mockSearchStandardRules.mockResolvedValue([
        {
          content: "あ".repeat(200),
          metadata: { ref: "テスト条文" },
          relevanceScore: 0.9,
        },
      ]);

      const request = buildRequest("テスト質問");
      const response = await generateChatResponse(request);

      expect(response.message.references![0].excerpt).toHaveLength(100);
    });

    it("Claude がテキストブロックを返さない場合はフォールバックメッセージを返す", async () => {
      mockClaudeClient._mockCreate.mockResolvedValue({
        id: "msg_mock",
        type: "message",
        role: "assistant",
        content: [], // テキストブロックなし
        model: "claude-sonnet-4-5-20250929",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 0 },
      });

      const request = buildRequest("テスト質問");
      const response = await generateChatResponse(request);

      expect(response.message.content).toBe("回答を生成できませんでした。");
    });
  });

  // ========== 会話履歴の制限 ==========

  describe("会話履歴の制限", () => {
    it("会話履歴が MAX_HISTORY_MESSAGES（10件）を超えた場合は直近のみ送信される", async () => {
      const history = Array.from({ length: 14 }, (_, i) => ({
        id: `msg-${i}`,
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `メッセージ ${i}`,
        timestamp: `2026-03-22T10:00:${String(i).padStart(2, "0")}Z`,
      }));

      const request = buildRequest("最新の質問", history);
      await generateChatResponse(request);

      const createCall = mockClaudeClient._mockCreate.mock.calls[0][0];
      // 直近 10 件 + 新しいユーザーメッセージ 1 件 = 11 件
      expect(createCall.messages).toHaveLength(11);
      // 最初のメッセージは history[4]（= "メッセージ 4"）であること
      expect(createCall.messages[0].content).toBe("メッセージ 4");
    });
  });
});
