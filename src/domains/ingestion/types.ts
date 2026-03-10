/**
 * Ingestion ドメインの型定義
 *
 * 現行規約のアップロード → パース → 構造化データへの変換を担う。
 */

/** 条文の構造化データ */
export interface ParsedArticle {
  /** 章番号（例: 1） */
  chapter: number;
  /** 章名（例: "総則"） */
  chapterTitle: string;
  /** 条番号（例: "第3条"） */
  articleNum: string;
  /** 条文タイトル（例: "規約の遵守義務"） */
  title: string;
  /** 条文本文 */
  body: string;
  /** 項のリスト */
  paragraphs: ParsedParagraph[];
}

/** 項の構造化データ */
export interface ParsedParagraph {
  /** 項番号（1始まり） */
  num: number;
  /** 項の本文 */
  body: string;
  /** 号のリスト */
  items: ParsedItem[];
}

/** 号の構造化データ */
export interface ParsedItem {
  /** 号番号（1始まり） */
  num: number;
  /** 号の本文 */
  body: string;
}

/** パース結果 */
export interface ParseResult {
  /** パースされた条文一覧 */
  articles: ParsedArticle[];
  /** メタデータ */
  metadata: ParseMetadata;
}

/** パースのメタデータ */
export interface ParseMetadata {
  /** 総条文数 */
  totalArticles: number;
  /** 総章数 */
  totalChapters: number;
  /** 検出された章名リスト */
  chapterNames: string[];
  /** パース時刻（ISO 8601） */
  parsedAt: string;
  /** 入力形式 */
  sourceFormat: "text" | "pdf";
  /** パース時の注意事項・警告 */
  warnings: string[];
}

/** パーサーのインターフェース */
export interface ArticleParser {
  /** テキストから条文を抽出してパースする */
  parse(content: string): Promise<ParseResult>;
}
