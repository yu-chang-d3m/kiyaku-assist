/**
 * Firestore データモデル
 *
 * アプリケーション全体で使用するデータ構造の型定義。
 * Firestore ドキュメントの読み書き時にこれらの型を使用する。
 */

import type { Timestamp } from "firebase/firestore";

// ---------- プロジェクト ----------

/**
 * プロジェクト（マンション管理規約改定案件）
 * Firestore パス: projects/{projectId}
 */
export interface Project {
  /** ドキュメント ID（読み取り時のみ） */
  id?: string;
  /** ユーザー ID（Firebase Auth UID） */
  userId: string;
  /** マンション名 */
  condoName: string;
  /** 管理組合の法人格 */
  condoType: "corporate" | "non-corporate" | "unknown";
  /** 規模区分 */
  unitCount: "small" | "medium" | "large" | "xlarge";
  /** 改定目標時期 */
  targetTiming: string;
  /** 現行規約の有無 */
  hasCurrentRules: boolean;
  /** 現在のステップ番号 */
  currentStep: number;
  /** 作成日時 */
  createdAt: Timestamp;
  /** 更新日時 */
  updatedAt: Timestamp;
}

// ---------- レビュー記事 ----------

/**
 * レビュー対象の条文
 * Firestore パス: projects/{projectId}/reviewArticles/{articleId}
 */
export interface ReviewArticle {
  /** ドキュメント ID（読み取り時のみ） */
  id?: string;
  /** プロジェクト ID */
  projectId: string;
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
  /** AI による推奨判断 */
  aiRecommendation?: "adopted" | "modified" | "pending" | null;
}

// ---------- AI キャッシュ ----------

/**
 * AI レスポンスのキャッシュ
 * Firestore パス: aiCache/{cacheKey}
 */
export interface CachedResponse {
  /** キャッシュキー（SHA-256 ハッシュ） */
  cacheKey: string;
  /** キャッシュされたレスポンスデータ */
  response: unknown;
  /** 作成日時 */
  createdAt: Timestamp;
  /** 有効期限 */
  expiresAt: Timestamp;
}

// ---------- ユーティリティ型 ----------

/** Firestore に保存する際の型（Timestamp を除外） */
export type CreateProject = Omit<Project, "id" | "createdAt" | "updatedAt">;

/** プロジェクトの部分更新用型 */
export type UpdateProject = Partial<Omit<Project, "id" | "userId" | "createdAt" | "updatedAt">>;
