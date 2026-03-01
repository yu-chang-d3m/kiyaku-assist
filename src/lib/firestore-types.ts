import type { Timestamp } from "firebase/firestore";

/**
 * プロジェクト（マンション管理規約改定案件）
 * Firestore パス: projects/{projectId}
 */
export interface Project {
  /** マンション名 */
  condoName: string;
  /** 管理組合の法人格 */
  condoType: "corporate" | "non-corporate" | "unknown";
  /** 規模区分 */
  unitCount: "small" | "medium" | "large" | "xlarge";
  /** 改定目標時期 */
  targetTiming: string;
  /** 現行規約の有無 */
  hasCurrentRules: string;
  /** 現在のステップ番号 */
  currentStep: number;
  /** 作成日時 */
  createdAt: Timestamp;
  /** 更新日時 */
  updatedAt: Timestamp;
}

/**
 * レビュー対象の条文
 * Firestore パス: projects/{projectId}/reviewArticles/{articleId}
 */
export interface ReviewArticle {
  /** 章番号 */
  chapter: number;
  /** 条番号（例: "第3条"） */
  articleNum: string;
  /** 現行規約の条文（新規の場合は null） */
  original: string | null;
  /** AI が生成した改定案 */
  draft: string;
  /** 改定内容の要約 */
  summary: string;
  /** 改定理由・解説 */
  explanation: string;
  /** 重要度 */
  importance: "mandatory" | "recommended" | "optional";
  /** 準拠する標準管理規約等の参照先 */
  baseRef: string;
  /** ユーザーの決定 */
  decision: "adopted" | "modified" | "pending" | null;
  /** 修正履歴 */
  modificationHistory: string[];
  /** ユーザーメモ */
  memo: string;
  /** カテゴリ（章名など） */
  category: string;
}
