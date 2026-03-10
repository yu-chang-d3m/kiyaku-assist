/**
 * 条文番号・構造の正規化
 *
 * パーサーが抽出した生データを正規化し、一貫した形式に揃える。
 * - 全角数字 → 半角数字
 * - 条番号フォーマットの統一
 * - 空白・改行の正規化
 */

import type { ParsedArticle, ParseResult } from "@/domains/ingestion/types";

// ---------- 正規化ルール ----------

/** 全角数字を半角に変換 */
function normalizeFullWidthNumbers(text: string): string {
  return text.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

/** 全角カッコを半角に正規化 */
function normalizeParentheses(text: string): string {
  return text.replace(/（/g, "(").replace(/）/g, ")");
}

/** 連続する空白を1つに圧縮（全角スペースも対象） */
function normalizeWhitespace(text: string): string {
  return text.replace(/[\s　]+/g, " ").trim();
}

/** 条番号の正規化（例: "第３条の２" → "第3条の2"） */
function normalizeArticleNum(articleNum: string): string {
  return normalizeFullWidthNumbers(articleNum);
}

// ---------- 単一条文の正規化 ----------

/** 条文1件を正規化 */
function normalizeArticle(article: ParsedArticle): ParsedArticle {
  return {
    ...article,
    articleNum: normalizeArticleNum(article.articleNum),
    title: normalizeWhitespace(article.title),
    body: normalizeWhitespace(article.body),
    chapterTitle: normalizeWhitespace(article.chapterTitle),
    paragraphs: article.paragraphs.map((p) => ({
      ...p,
      body: normalizeWhitespace(p.body),
      items: p.items.map((item) => ({
        ...item,
        body: normalizeWhitespace(item.body),
      })),
    })),
  };
}

// ---------- 公開 API ----------

/**
 * パース結果全体を正規化する
 *
 * @param result - パーサーから返された生の ParseResult
 * @returns 正規化済みの ParseResult
 */
export function normalizeParseResult(result: ParseResult): ParseResult {
  return {
    ...result,
    articles: result.articles.map(normalizeArticle),
    metadata: {
      ...result.metadata,
      chapterNames: result.metadata.chapterNames.map(normalizeWhitespace),
    },
  };
}

/**
 * 条番号を比較用のソートキーに変換する
 *
 * 例: "第3条" → [3, 0], "第12条の2" → [12, 2]
 */
export function articleNumToSortKey(articleNum: string): [number, number] {
  const normalized = normalizeFullWidthNumbers(articleNum);
  const match = normalized.match(/第(\d+)条(?:の(\d+))?/);
  if (!match) return [0, 0];
  return [parseInt(match[1], 10), match[2] ? parseInt(match[2], 10) : 0];
}

/**
 * 条文を条番号順にソートする
 */
export function sortArticles(articles: ParsedArticle[]): ParsedArticle[] {
  return [...articles].sort((a, b) => {
    const [aMain, aSub] = articleNumToSortKey(a.articleNum);
    const [bMain, bSub] = articleNumToSortKey(b.articleNum);
    if (aMain !== bMain) return aMain - bMain;
    return aSub - bSub;
  });
}

// 内部ユーティリティも公開（テスト用）
export {
  normalizeFullWidthNumbers,
  normalizeParentheses,
  normalizeWhitespace,
  normalizeArticleNum,
};
