/**
 * Firestore データモデル
 *
 * アプリケーション全体で使用するデータ構造の型定義。
 * Firestore ドキュメントの読み書き時にこれらの型を使用する。
 */


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
  /** 文書種別（管理規約/使用細則/会則・その他） */
  documentType?: "management-rules" | "usage-rules" | "other-bylaws";
  /** 現在のステップ番号 */
  currentStep: number;
  /** 管理会社案がインポート済みか */
  hasManagementDraft?: boolean;
  /** 築年数（表紙・エクスポート用） */
  buildingAge?: number;
  /** 所在地（表紙・エクスポート用） */
  location?: string;
  /** 管理会社名（表紙・エクスポート用） */
  managementCompany?: string;
  /** 作成日時（ISO 文字列） */
  createdAt: string;
  /** 更新日時（ISO 文字列） */
  updatedAt: string;
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
  decision: "adopted" | "modified" | "keep-current" | "adopt-management" | "pending" | null;
  /** 修正履歴 */
  modificationHistory: string[];
  /** ユーザーメモ */
  memo: string;
  /** カテゴリ（章名など） */
  category: string;
  /** AI による推奨判断 */
  aiRecommendation?: "adopted" | "modified" | "pending" | null;
  /** ギャップの種類 */
  gapType?: "missing" | "outdated" | "partial" | "compliant" | "custom";
  /** 改正区分所有法との関連条文 */
  relatedLawRefs?: string[];
  /** 住民生活への影響 */
  impactOnResidents?: string;
  /** 変更しなかった場合のリスク */
  riskIfUnchanged?: string;
  /** 経過措置の要否と内容 */
  transitionalMeasure?: string;
  /** 標準管理規約との対比説明 */
  standardRuleComparison?: string;

  // --- Phase 1 追加（意味分類 + 改正案生成） ---

  /** 改正案テキスト（このマンション用にカスタマイズされた条文） */
  reformText?: string;
  /** プライマリ意味グループ */
  semanticGroup?: string;
  /** セカンダリ意味グループ */
  secondaryGroups?: string[];
  /** 対応する標準条文番号 */
  standardArticleNum?: string;
  /** 詳細な改正背景 */
  detailedBackground?: string;
  /** 課題グループ */
  issueGroup?: string;

  // --- Phase 3 追加（管理会社案） ---

  /** 管理会社案テキスト（null = なし） */
  managementDraft?: string | null;

  /** 更新日時（Firestore サーバータイムスタンプ） */
  updatedAt?: string;
}

// ---------- AI キャッシュ ----------

/**
 * AI レスポンスのキャッシュ
 * Firestore パス: aiCache/{cacheKey}
 *
 * 注意: Timestamp は Admin SDK の firebase-admin/firestore 経由で保存される。
 * 実際の読み書きは src/shared/ai/cache.ts の CacheEntry を使用する。
 */
export interface CachedResponse {
  /** キャッシュキー（SHA-256 ハッシュ） */
  cacheKey: string;
  /** キャッシュされたレスポンスデータ */
  response: unknown;
  /** 作成日時（ISO 文字列 or Timestamp） */
  createdAt: string | unknown;
  /** 有効期限（ISO 文字列 or Timestamp） */
  expiresAt: string | unknown;
}

// ---------- 標準管理規約条文 ----------

/**
 * パース済み国交省標準管理規約の条文（Firestore 格納用）
 * Firestore パス: standardArticles/{articleNum}
 *
 * プロジェクトに依存しないグローバルコレクション。
 * seed-standard API で初期投入する。
 */
export interface StandardArticleFirestore {
  /** 条文番号（例: "第1条"）— ドキュメント ID としても使用 */
  articleNum: string;
  /** 条文タイトル（例: "目的"） */
  title: string;
  /** 条文本文（項・号を含む全テキスト） */
  body: string;
  /** 章番号 */
  chapter: number;
  /** 章名（例: "総則"） */
  chapterTitle: string;
  /** コメント（解説テキスト） */
  comment: string;
  /** プライマリ意味グループ */
  semanticGroup: string;
  /** セカンダリ意味グループ */
  secondaryGroups: string[];
  /** 作成日時（ISO 文字列 or Timestamp） */
  createdAt: string | unknown;
}

// ---------- ユーティリティ型 ----------

/** Firestore に保存する際の型（Timestamp を除外） */
export type CreateProject = Omit<Project, "id" | "createdAt" | "updatedAt">;

/** プロジェクトの部分更新用型 */
export type UpdateProject = Partial<Omit<Project, "id" | "userId" | "createdAt" | "updatedAt">>;
