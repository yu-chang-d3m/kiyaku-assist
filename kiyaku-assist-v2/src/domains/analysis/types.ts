/**
 * Analysis ドメインの型定義
 *
 * 現行規約と標準管理規約のギャップ分析を担う。
 */

/** ギャップ分析の単位（1条文ごと） */
export interface GapAnalysisItem {
  /** 条番号 */
  articleNum: string;
  /** 章名 */
  category: string;
  /** 現行条文（存在しない場合は null） */
  currentText: string | null;
  /** 対応する標準管理規約の条文テキスト */
  standardText: string;
  /** 標準管理規約の参照先（例: "標準管理規約 第12条"） */
  standardRef: string;
  /** ギャップの概要 */
  gapSummary: string;
  /** ギャップの種類 */
  gapType: GapType;
  /** 重要度 */
  importance: "mandatory" | "recommended" | "optional";
  /** 改正の理由・背景 */
  rationale: string;
  /** 改正区分所有法との関連条文 */
  relatedLawRefs: string[];
}

/** ギャップの種類 */
export type GapType =
  | "missing"      // 現行規約に条文が存在しない
  | "outdated"     // 条文はあるが内容が古い
  | "partial"      // 一部のみ対応済み
  | "compliant"    // 準拠済み（変更不要）
  | "custom";      // マンション独自の条文

/** 分析結果の全体 */
export interface AnalysisResult {
  /** プロジェクト ID */
  projectId: string;
  /** ギャップ分析結果一覧 */
  items: GapAnalysisItem[];
  /** 分析サマリー */
  summary: AnalysisSummary;
  /** 分析実行時刻（ISO 8601） */
  analyzedAt: string;
}

/** 分析結果のサマリー */
export interface AnalysisSummary {
  /** 総条文数 */
  totalArticles: number;
  /** 要対応件数 */
  actionRequired: number;
  /** 準拠済み件数 */
  compliant: number;
  /** 重要度別の件数 */
  byImportance: {
    mandatory: number;
    recommended: number;
    optional: number;
  };
  /** ギャップ種類別の件数 */
  byGapType: Record<GapType, number>;
}

/** Retriever（Vertex AI Search）から返される検索結果 */
export interface RetrievalResult {
  /** 検索クエリ */
  query: string;
  /** 検索結果一覧 */
  results: RetrievedDocument[];
}

/** 検索で取得されたドキュメント */
export interface RetrievedDocument {
  /** ドキュメントの内容 */
  content: string;
  /** メタデータ（条番号、出典など） */
  metadata: Record<string, string>;
  /** 関連度スコア（0-1） */
  relevanceScore: number;
}
