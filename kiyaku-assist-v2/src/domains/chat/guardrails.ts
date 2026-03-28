/**
 * 非弁ガードレール（弁護士法72条）
 *
 * チャット応答が法的助言に該当しないよう、
 * ユーザーの質問と AI の回答を検査する。
 *
 * 弁護士法72条:
 * 「弁護士又は弁護士法人でない者は、報酬を得る目的で
 *  訴訟事件、非訟事件及び審査請求...その他一般の法律事件に関して
 *  鑑定、代理、仲裁若しくは和解その他の法律事務を取り扱い、
 *  又はこれらの周旋をすることを業とすることができない」
 */

import type { GuardrailResult } from "@/domains/chat/types";
import { logger } from "@/shared/observability/logger";

// ---------- 検出パターン ----------

/** 法的助言を求める質問のパターン */
const LEGAL_ADVICE_PATTERNS = [
  /訴訟|訴え|裁判|提訴/,
  /弁護士に相談|法的措置|法的手段/,
  /損害賠償|慰謝料/,
  /違法|違反.*罰則|罰金/,
  /契約.*無効|解除.*請求/,
  /差止|仮処分|保全/,
  /遺産|相続|遺言/,
  /示談|和解.*交渉/,
  /内容証明|督促/,
] as const;

/** 個別具体的な判断を求めるパターン */
const SPECIFIC_JUDGMENT_PATTERNS = [
  /うちのマンションの場合.*(?:どうすべき|すべきですか|義務がある)/,
  /(?:勝てますか|負けますか|認められますか)/,
  /(?:違法ですか|合法ですか|問題ありますか)/,
  /具体的に.*(?:いくら|何円|金額)/,
  /(?:責任.*ありますか|責任を問えますか)/,
] as const;

/** ガードレール適用時の免責メッセージ */
export const DISCLAIMER_MESSAGE = `
---
**ご注意**: 本サービスは管理規約の改定作業を支援する情報提供ツールです。
法的助言や個別具体的な法律判断は行いません。
法的な判断が必要な場合は、マンション管理士や弁護士等の専門家にご相談ください。
`.trim();

// ---------- 公開 API ----------

/**
 * ユーザーの質問を検査する（事前チェック）
 *
 * @param message - ユーザーの質問テキスト
 * @returns ガードレール判定結果
 */
export function checkUserMessage(message: string): GuardrailResult {
  // 法的助言パターンのチェック
  for (const pattern of LEGAL_ADVICE_PATTERNS) {
    if (pattern.test(message)) {
      logger.warn({ pattern: pattern.source }, "法的助言パターンを検出");
      return {
        status: "warning",
        reason: "法的助言に該当する可能性がある質問が検出されました",
        legalAdviceRisk: true,
      };
    }
  }

  // 個別具体的な判断パターンのチェック
  for (const pattern of SPECIFIC_JUDGMENT_PATTERNS) {
    if (pattern.test(message)) {
      logger.warn({ pattern: pattern.source }, "個別判断パターンを検出");
      return {
        status: "warning",
        reason: "個別具体的な法的判断を求める質問が検出されました",
        legalAdviceRisk: true,
      };
    }
  }

  return {
    status: "pass",
    legalAdviceRisk: false,
  };
}

/**
 * AI の回答を検査する（事後チェック）
 *
 * @param response - AI の回答テキスト
 * @returns ガードレール判定結果
 */
export function checkAssistantResponse(response: string): GuardrailResult {
  // AI が断定的な法的判断を述べているパターン
  const assertivePatterns = [
    /(?:これは|それは).*(?:違法です|合法です|問題ありません)/,
    /(?:義務があります|権利があります)(?:ので|から)/,
    /(?:損害賠償|慰謝料).*(?:請求できます|認められます)/,
    /(?:勝訴|敗訴).*(?:可能性が高い|見込み)/,
  ];

  for (const pattern of assertivePatterns) {
    if (pattern.test(response)) {
      logger.warn(
        { pattern: pattern.source },
        "AI の回答に断定的な法的判断を検出",
      );
      return {
        status: "warning",
        reason: "回答に法的助言に該当しうる表現が含まれています",
        legalAdviceRisk: true,
      };
    }
  }

  return {
    status: "pass",
    legalAdviceRisk: false,
  };
}

/**
 * ガードレール付きのシステムプロンプトを生成する
 */
export function buildGuardrailedSystemPrompt(basePrompt: string): string {
  return `${basePrompt}

## 重要な制約（弁護士法72条対応）
- あなたは法律の専門家ではありません。法的助言は一切行わないでください。
- 「〜すべきです」「〜する義務があります」「〜は違法です」等の断定的な法的判断は避けてください。
- 法的な判断が必要な質問には、「マンション管理士や弁護士等の専門家にご相談ください」と案内してください。
- 提供する情報は、標準管理規約や区分所有法の条文内容の説明に留めてください。
- 個別具体的なケースへの当てはめ判断は行わないでください。
- 回答の末尾に必ず以下の免責事項を付記してください:
  「※ 本回答は情報提供を目的としたものであり、法的助言ではありません。」`;
}
