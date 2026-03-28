/**
 * 意味的分類エンジン — 型定義
 *
 * 管理規約の条文を12の意味グループに分類し、
 * 異なるソース（国交省標準/現行規約/管理会社案）間で
 * 意味ベースの対応付けを行うための型。
 */

// ---------- 意味グループ ID ----------

/** 12の固定意味グループ */
export type SemanticGroupId =
  | "general" // 総則・目的・定義
  | "ownership" // 専有部分・共用部分の範囲
  | "usage" // 用法・生活ルール
  | "maintenance" // 管理・修繕・長期修繕計画
  | "governance" // 管理組合運営・総会・理事会
  | "finance" // 会計・管理費・修繕積立金
  | "digitalization" // 電子化対応（電磁的方法・WEB総会等）
  | "absent-owner" // 所有者不明・不在対策
  | "disaster" // 災害対応・復旧・建替え
  | "lifestyle" // 生活利便性（置き配・EV充電等）
  | "legal-compliance" // 法令遵守・義務・罰則
  | "misc"; // 雑則・附則・経過措置

/** 全グループ ID の配列（定数定義用） */
export const SEMANTIC_GROUP_IDS: readonly SemanticGroupId[] = [
  "general",
  "ownership",
  "usage",
  "maintenance",
  "governance",
  "finance",
  "digitalization",
  "absent-owner",
  "disaster",
  "lifestyle",
  "legal-compliance",
  "misc",
] as const;

// ---------- タクソノミー構造 ----------

/** サブテーマ */
export interface SubTheme {
  /** 一意ID（例: "digitalization-voting"） */
  id: string;
  /** 表示名（例: "電子議決権行使"） */
  label: string;
  /** 説明 */
  description: string;
}

/** 意味グループの定義 */
export interface SemanticGroup {
  /** グループ ID */
  id: SemanticGroupId;
  /** 表示名（例: "電子化対応"） */
  label: string;
  /** 概要説明 */
  description: string;
  /** 表示優先度（1=最高、法改正必須対応が上位） */
  priority: number;
  /** サブテーマリスト */
  subThemes: SubTheme[];
  /** 関連法令条文（例: ["改正区分所有法第39条"]） */
  relatedLawSections: string[];
}

// ---------- 標準条文 ----------

/** パース済み国交省標準管理規約の条文 */
export interface StandardArticle {
  /** 条文番号（例: "第1条"） */
  articleNum: string;
  /** 条文タイトル（例: "目的"） */
  title: string;
  /** 条文本文（項・号を含む全テキスト） */
  body: string;
  /** 章番号 */
  chapter: number;
  /** 章名（例: "総則"） */
  chapterTitle: string;
  /** コメント（解説テキスト）。標準規約のコメントセクションから紐付け */
  comment: string;
  /** プライマリ意味グループ */
  semanticGroup: SemanticGroupId;
  /** セカンダリ意味グループ（関連するが主ではないグループ） */
  secondaryGroups: SemanticGroupId[];
}

// ---------- マッピング ----------

/** ユーザー規約条文 → 標準条文の対応付け結果 */
export interface ArticleMapping {
  /** ユーザー規約の条文番号 */
  userArticleNum: string;
  /** 対応する標準条文番号（対応なし = null） */
  standardArticleNum: string | null;
  /** 割り当てられた意味グループ */
  semanticGroup: SemanticGroupId;
  /** セカンダリ意味グループ */
  secondaryGroups: SemanticGroupId[];
  /** マッピング信頼度 (0.0〜1.0) */
  confidence: number;
}

/** タクソノミーマッピングのバッチ入力 */
export interface TaxonomyMappingRequest {
  /** マッピング対象の条文テキスト */
  articles: Array<{
    articleNum: string;
    title: string;
    bodyExcerpt: string;
  }>;
  /** 利用可能なグループID一覧（LLMへのコンテキスト） */
  availableGroups: Array<{
    id: SemanticGroupId;
    label: string;
    description: string;
  }>;
}

/** LLMマッピング結果（tool_use 出力） */
export interface TaxonomyMappingResult {
  articleNum: string;
  primaryGroup: SemanticGroupId;
  secondaryGroups: SemanticGroupId[];
}
