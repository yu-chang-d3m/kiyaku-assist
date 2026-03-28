/**
 * 管理会社案の型定義
 *
 * 管理会社（日本ハウジング等）が提出した規約改正案を構造化する。
 * 既存の ParseResult と組み合わせて使用する。
 */

import type { ParsedArticle } from "@/domains/ingestion/types";

/** 管理会社案の個別条文 */
export interface ManagementDraftArticle {
  /** 条番号（例: "第3条"） */
  articleNum: string;
  /** 条文タイトル（例: "規約の遵守義務"） */
  title: string;
  /** 条文本文 */
  body: string;
  /** 章番号 */
  chapter: number;
  /** 章名 */
  chapterTitle: string;
  /** マッチした ReviewArticle の articleNum（null = 対応なし） */
  matchedArticleNum: string | null;
  /** マッチ信頼度 (0-1) */
  matchConfidence: number;
}

/** 管理会社案パース全体の結果 */
export interface ManagementDraftResult {
  /** パースされた条文一覧 */
  articles: ManagementDraftArticle[];
  /** メタデータ */
  metadata: {
    /** ソースファイル名 */
    sourceFileName: string;
    /** 総条文数 */
    totalArticles: number;
    /** マッチ成功数 */
    matchedArticles: number;
    /** パース日時 */
    parsedAt: string;
    /** 警告メッセージ */
    warnings: string[];
  };
}

/** 管理会社案パース進捗コールバック */
export type ManagementDraftProgressCallback = (event: {
  phase: "parse" | "match" | "save";
  current: number;
  total: number;
  message: string;
}) => void;

/** ParsedArticle から ManagementDraftArticle への変換ヘルパー */
export function toManagementDraftArticle(
  parsed: ParsedArticle,
): ManagementDraftArticle {
  return {
    articleNum: parsed.articleNum,
    title: parsed.title ?? "",
    body: parsed.body,
    chapter: parsed.chapter,
    chapterTitle: parsed.chapterTitle ?? "",
    matchedArticleNum: null,
    matchConfidence: 0,
  };
}
