/**
 * Review ドメインの型定義
 *
 * 条文ごとのレビュー（採用/修正/保留）状態管理と修正履歴を担う。
 */

/** 条文の決定状態 */
export type ArticleDecision = "adopted" | "modified" | "pending" | null;

/** 状態遷移イベント */
export type ReviewEvent =
  | { type: "ADOPT" }
  | { type: "MODIFY"; newText: string; reason: string }
  | { type: "RESET" }
  | { type: "ADD_MEMO"; memo: string };

/** 修正履歴エントリ */
export interface ModificationEntry {
  /** 修正前のテキスト */
  before: string;
  /** 修正後のテキスト */
  after: string;
  /** 修正理由 */
  reason: string;
  /** 修正日時（ISO 8601） */
  modifiedAt: string;
}

/** レビュー記事の状態 */
export interface ReviewArticleState {
  /** 条番号 */
  articleNum: string;
  /** 現在の決定状態 */
  decision: ArticleDecision;
  /** 現在のドラフトテキスト */
  currentDraft: string;
  /** 修正履歴 */
  history: ModificationEntry[];
  /** ユーザーメモ */
  memo: string;
}

/** レビュー全体の進捗 */
export interface ReviewProgress {
  /** 総条文数 */
  total: number;
  /** 採用済み */
  adopted: number;
  /** 修正済み */
  modified: number;
  /** 保留 */
  pending: number;
  /** 未決定 */
  undecided: number;
  /** 進捗率（0-100） */
  progressPercent: number;
}
