/**
 * Drafting ドメインの型定義
 *
 * ギャップ分析結果をもとに改定条文ドラフトを生成する。
 */

/** ドラフト生成リクエスト（1条文分） */
export interface DraftRequest {
  /** 条番号 */
  articleNum: string;
  /** 章名 */
  category: string;
  /** 現行条文（新規追加の場合は null） */
  currentText: string | null;
  /** 標準管理規約の対応条文 */
  standardText: string;
  /** ギャップ分析の概要 */
  gapSummary: string;
  /** 重要度 */
  importance: "mandatory" | "recommended" | "optional";
  /** マンション属性（法人格、規模など） */
  condoContext: CondoContext;
}

/** マンション属性コンテキスト */
export interface CondoContext {
  /** マンション名 */
  condoName: string;
  /** 管理組合の法人格 */
  condoType: "corporate" | "non-corporate" | "unknown";
  /** 規模区分 */
  unitCount: "small" | "medium" | "large" | "xlarge";
}

/** ドラフト生成結果（1条文分） */
export interface DraftResult {
  /** 条番号 */
  articleNum: string;
  /** 生成されたドラフト本文 */
  draft: string;
  /** 改定内容の要約 */
  summary: string;
  /** 改定理由・解説（組合員向け） */
  explanation: string;
  /** 重要度 */
  importance: "mandatory" | "recommended" | "optional";
  /** 準拠する標準管理規約等の参照先 */
  baseRef: string;
  /** 章名 */
  category: string;
}

/** バッチドラフト生成結果 */
export interface BatchDraftResult {
  /** 生成されたドラフト一覧 */
  drafts: DraftResult[];
  /** 生成に失敗した条文（リトライ対象） */
  failures: DraftFailure[];
  /** 生成時刻（ISO 8601） */
  generatedAt: string;
}

/** ドラフト生成失敗 */
export interface DraftFailure {
  /** 条番号 */
  articleNum: string;
  /** エラー内容 */
  error: string;
}

/** 生成モード: smart = 重要度別最適化, precise = 1件ずつ丁寧に */
export type DraftGenerationMode = "smart" | "precise";

/** ドラフト生成進捗コールバック */
export type DraftProgressCallback = (
  completedCount: number,
  totalCount: number,
  articleNum: string,
  phase: "retrieval" | "generation" | "retry",
) => void;
