import { describe, test, expect, vi } from "vitest";
import {
  checkUserMessage,
  checkAssistantResponse,
  buildGuardrailedSystemPrompt,
  DISCLAIMER_MESSAGE,
} from "@/domains/chat/guardrails";

// logger のモック（テスト中にログ出力を抑制）
vi.mock("@/shared/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("非弁ガードレール — checkUserMessage", () => {
  // ========== 検知すべきケース（法的助言リクエスト）==========

  describe("法的助言パターンを検知する", () => {
    test.each([
      "滞納者に対して訴訟を起こしたい",
      "裁判所に申し立てをする方法",
      "損害賠償請求をしたい",
      "慰謝料をいくら請求できますか",
      "管理費を滞納している人への法的措置を取りたい",
      "弁護士に相談する前に知りたい",
      "差止請求はできますか",
      "内容証明を送りたい",
      "仮処分の申立てについて",
      "遺産分割で揉めている",
      "和解交渉の進め方",
      "督促状を送る方法",
    ])('"%s" → 法的助言リクエストとして検知', (input) => {
      const result = checkUserMessage(input);
      expect(result.legalAdviceRisk).toBe(true);
      expect(result.status).toBe("warning");
    });
  });

  describe("個別判断パターンを検知する", () => {
    test.each([
      "うちのマンションの場合どうすべきですか",
      "この件で裁判に勝てますか",
      "管理組合の行為は違法ですか",
      "具体的にいくら請求できますか",
      "理事長の責任を問えますか",
    ])('"%s" → 個別判断リクエストとして検知', (input) => {
      const result = checkUserMessage(input);
      expect(result.legalAdviceRisk).toBe(true);
      expect(result.status).toBe("warning");
    });
  });

  // ========== 検知しないべきケース（一般的な質問）==========

  describe("一般的な規約改正の質問は通過させる", () => {
    test.each([
      "管理規約の改正手続きを教えて",
      "駐車場の使用ルールはどうなっていますか",
      "総会の定足数は何人ですか",
      "修繕積立金の適正額はいくらですか",
      "ペットの飼育ルールについて",
      "理事会の開催頻度は",
      "共用部分の範囲を教えて",
      "管理費の値上げ手続き",
      "区分所有法の改正ポイントを教えて",
      "標準管理規約との違いを教えて",
      "議決権の行使方法について",
      "専有部分のリフォームに必要な手続き",
      "管理組合法人の設立方法",
      "長期修繕計画の作成ガイドラインについて",
      "置き配のルールを規約に入れたい",
      "EV充電設備の設置について",
    ])('"%s" → 法的助言ではないと判定', (input) => {
      const result = checkUserMessage(input);
      expect(result.legalAdviceRisk).toBe(false);
      expect(result.status).toBe("pass");
    });
  });
});

describe("非弁ガードレール — checkAssistantResponse", () => {
  describe("断定的な法的判断を検知する", () => {
    test.each([
      "これは違法です。すぐに対処してください。",
      "それは合法です。問題ありません。",
      "義務がありますので、必ず対応してください。",
      "損害賠償を請求できます。",
      "勝訴の可能性が高いと思われます。",
    ])('"%s" → 法的判断として検知', (input) => {
      const result = checkAssistantResponse(input);
      expect(result.legalAdviceRisk).toBe(true);
    });
  });

  describe("一般的な説明は通過させる", () => {
    test.each([
      "標準管理規約第15条では、駐車場の使用について定めています。",
      "改正区分所有法では、決議要件が緩和されます。",
      "一般的に、管理費の値上げには総会の普通決議が必要です。",
      "管理規約の改正には、区分所有者及び議決権の各4分の3以上の多数決が必要とされています。",
    ])('"%s" → 通過', (input) => {
      const result = checkAssistantResponse(input);
      expect(result.legalAdviceRisk).toBe(false);
    });
  });
});

describe("buildGuardrailedSystemPrompt", () => {
  test("弁護士法72条の制約を含むシステムプロンプトを生成する", () => {
    const prompt = buildGuardrailedSystemPrompt("あなたは管理規約のアシスタントです。");
    expect(prompt).toContain("弁護士法72条");
    expect(prompt).toContain("法的助言は一切行わない");
    expect(prompt).toContain("専門家にご相談ください");
    expect(prompt).toContain("あなたは管理規約のアシスタントです。");
  });
});

describe("DISCLAIMER_MESSAGE", () => {
  test("免責メッセージが適切な内容を含む", () => {
    expect(DISCLAIMER_MESSAGE).toContain("情報提供ツール");
    expect(DISCLAIMER_MESSAGE).toContain("専門家");
  });
});
