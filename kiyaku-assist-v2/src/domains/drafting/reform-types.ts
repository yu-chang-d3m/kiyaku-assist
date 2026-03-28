/**
 * 改正案生成エンジンの型定義
 *
 * 標準条文 + マンション属性コンテキストから
 * 「このマンション用」の改正案テキストを生成する。
 */

import type { CondoContext } from "./types";

/** 改正案生成リクエスト（1条文分） */
export interface ReformDraftRequest {
  /** 条番号（ユーザー規約側） */
  articleNum: string;
  /** 現行条文（なければ null） */
  currentText: string | null;
  /** 対応する標準条文番号 */
  standardArticleNum: string;
  /** 標準条文の本文 */
  standardBody: string;
  /** 標準条文のコメント（解説） */
  standardComment: string;
  /** ギャップの概要 */
  gapSummary: string;
  /** ギャップの種類 */
  gapType: string;
  /** 重要度 */
  importance: "mandatory" | "recommended" | "optional";
  /** 意味グループ */
  semanticGroup: string;
  /** マンション属性 */
  condoContext: ExtendedCondoContext;
}

/** 拡張マンション属性コンテキスト */
export interface ExtendedCondoContext extends CondoContext {
  /** 築年数（オプション） */
  buildingAge?: number;
  /** 立地（オプション） */
  location?: string;
  /** 管理会社名（オプション） */
  managementCompany?: string;
}

/** 改正案生成結果（tool_use 出力） */
export interface ReformDraftOutput {
  /** 改正案条文テキスト */
  reformText: string;
  /** 改正内容の要約（100文字以内） */
  summary: string;
  /** 改正理由・解説（理事会説明用） */
  explanation: string;
  /** 詳細な改正背景（法改正の経緯、実務課題） */
  detailedBackground: string;
  /** 住民生活への影響 */
  impactOnResidents: string;
  /** 変更しなかった場合のリスク */
  riskIfUnchanged: string;
  /** 経過措置の要否と内容 */
  transitionalMeasure: string;
  /** 課題グループ名（同テーマの条文をグルーピングするキー） */
  issueGroup: string;
}

/** 改正案生成の進捗コールバック */
export type ReformProgressCallback = (progress: {
  completed: number;
  total: number;
  articleNum: string;
}) => void;
