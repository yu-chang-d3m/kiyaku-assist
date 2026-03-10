/**
 * Export ドメインの型定義
 *
 * レビュー結果から各種出力形式（Markdown、CSV）を生成する。
 */

/** エクスポート対象の条文データ */
export interface ExportArticle {
  /** 章番号 */
  chapter: number;
  /** 章名 */
  chapterTitle: string;
  /** 条番号 */
  articleNum: string;
  /** 現行規約の条文（新規の場合は null） */
  original: string | null;
  /** 改定案の条文 */
  draft: string;
  /** 改定内容の要約 */
  summary: string;
  /** 改定理由・解説 */
  explanation: string;
  /** 重要度 */
  importance: "mandatory" | "recommended" | "optional";
  /** ユーザーの決定 */
  decision: "adopted" | "modified" | "pending" | null;
  /** 準拠する標準管理規約等の参照先 */
  baseRef: string;
}

/** エクスポート設定 */
export interface ExportOptions {
  /** マンション名 */
  condoName: string;
  /** 出力フォーマット */
  format: "markdown" | "csv";
  /** 対象条文のフィルタ（未指定で全件） */
  filter?: ExportFilter;
  /** 生成日時を含めるか */
  includeTimestamp: boolean;
}

/** エクスポートフィルタ */
export interface ExportFilter {
  /** 決定状態でフィルタ */
  decisions?: Array<"adopted" | "modified" | "pending" | null>;
  /** 重要度でフィルタ */
  importances?: Array<"mandatory" | "recommended" | "optional">;
  /** 章番号でフィルタ */
  chapters?: number[];
}

/** エクスポート結果 */
export interface ExportResult {
  /** 生成されたコンテンツ */
  content: string;
  /** ファイル名 */
  filename: string;
  /** MIME タイプ */
  mimeType: string;
  /** 含まれる条文数 */
  articleCount: number;
}

/** ジェネレーターのインターフェース */
export interface ExportGenerator {
  /** 条文データからエクスポートファイルを生成する */
  generate(articles: ExportArticle[], options: ExportOptions): ExportResult;
}
