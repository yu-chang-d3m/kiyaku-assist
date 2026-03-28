/**
 * 標準管理規約パーサー
 *
 * 国交省 R7 標準管理規約 Markdown（pdftotext -layout 出力）を
 * 条文単位に構造化し、コメント（解説）を各条文に紐付ける。
 *
 * 入力: data/mlit/mlit_standard_rules_r7_2025.md（326KB / 4888行）
 * 構造:
 *   - 行 1〜1577: 条文本体（第1章〜第8章 + 附則）
 *   - 行 1578〜1699: 別表（別表第1〜第5）— パース対象外
 *   - 行 1700〜: コメント（「全般関係」「第X条関係」パターン）
 */

import type { StandardArticle, SemanticGroupId } from "./types";

// ---------- 正規表現パターン ----------

/** 章の検出（例: "第１章 総則"） */
const CHAPTER_RE = /^第([０-９\d]+)\s*章\s+(.+)$/;

/** 条の検出（例: "第1条 この規約は…"、"（目的）" + "第1条 …"）
 * \s+ で条番号と本文の間に1文字以上のスペースを要求し、
 * 「第27条に定める費用」等の条文間参照との誤マッチを防ぐ。
 */
const ARTICLE_RE =
  /^(第[０-９\d]+条(?:の[０-９\d]+)?)\s+(?:[（(]([^）)]+)[）)]\s*)?(.*)/;

/** タイトル行（括弧のみの行、例: "（目的）"） */
const TITLE_ONLY_RE = /^[（(]([^）)]+)[）)]$/;

/** ページヘッダー（除去対象） */
const PAGE_HEADER_RE = /令和７年改正マンション標準管理規約/;

/**
 * （ア）/（イ）バリアントの汎用検出
 * 標準規約では複数の（ア）/（イ）バリアントが存在する:
 *   - 電磁的方法（14箇所）: （ア）利用不可 / （イ）利用可能
 *   - 住宅宿泊事業（1箇所）: （ア）可能 / （イ）禁止
 * 全て（イ）を採用する（電磁的方法は法改正対応、民泊は保守的選択）。
 */
const VARIANT_A_RE = /^[（(]ア[）)]/;
const VARIANT_B_RE = /^[（(]イ[）)]/;

/** 〔※管理組合における…〕形式の注記（バリアント説明、スキップ） */
const VARIANT_NOTE_RE = /^〔※/;

/** ページ番号（除去対象） */
const PAGE_NUMBER_RE = /^\s*-\s*\d+\s*-\s*$/;

/** 別表の開始 */
const APPENDIX_TABLE_RE = /^別表第[０-９\d]/;

/** 附則の開始 */
const APPENDIX_RE = /^附\s+則$/;

/** コメントセクション開始の検出 */
const COMMENT_SECTION_START_RE =
  /^マンション標準管理規約（単棟型）コメント$/;

/** コメントの条文参照パターン（例: "第２条関係"、"第19条の２関係"） */
const COMMENT_ARTICLE_RE = /^(第[０-９\d]+条(?:の[０-９\d]+)?)\s*関係$/;

/** 全般関係（コメントセクションの冒頭） */
const COMMENT_GENERAL_RE = /^全般関係$/;

// ---------- ユーティリティ ----------

/** 全角数字を半角に正規化 */
function normalizeFullWidth(s: string): string {
  return s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

/** 条文番号を正規化（例: "第２条" → "第2条"） */
function normalizeArticleNum(raw: string): string {
  return normalizeFullWidth(raw.replace(/\s+/g, ""));
}

/** 章番号を数値に変換 */
function parseChapterNum(raw: string): number {
  return parseInt(normalizeFullWidth(raw), 10);
}

/** ノイズ行の判定 */
function isNoiseLine(line: string): boolean {
  if (PAGE_HEADER_RE.test(line)) return true;
  if (PAGE_NUMBER_RE.test(line)) return true;
  if (line === "") return true;
  return false;
}

// ---------- パーサー ----------

interface RawArticle {
  articleNum: string;
  title: string;
  body: string;
  chapter: number;
  chapterTitle: string;
}

/**
 * 条文本体セクションをパース
 */
function parseArticleSection(lines: string[]): RawArticle[] {
  const articles: RawArticle[] = [];

  let currentChapter = 0;
  let currentChapterTitle = "";
  let currentArticle: RawArticle | null = null;
  let pendingTitle = "";
  let inAppendixTable = false;
  // 電磁的方法バリアント（ア）区間をスキップするフラグ
  let skipVariantA = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // ノイズ除去
    if (isNoiseLine(line)) continue;

    // バリアント注記（〔※...〕）はスキップ
    if (VARIANT_NOTE_RE.test(line)) continue;

    // 電磁的方法バリアント（ア）の開始 → スキップモード ON
    if (VARIANT_A_RE.test(line)) {
      // （ア）区間の条文は捨てる（前の条文があれば保存）
      if (currentArticle) {
        articles.push(currentArticle);
        currentArticle = null;
      }
      skipVariantA = true;
      continue;
    }

    // 電磁的方法バリアント（イ）の開始 → スキップモード OFF
    if (VARIANT_B_RE.test(line)) {
      skipVariantA = false;
      continue;
    }

    // （ア）区間中はスキップ
    if (skipVariantA) continue;

    // 別表セクションに入ったらパース終了
    if (APPENDIX_TABLE_RE.test(line)) {
      inAppendixTable = true;
      break;
    }

    // コメントセクション開始でもパース終了
    if (COMMENT_SECTION_START_RE.test(line)) break;

    // 章の検出
    const chapterMatch = line.match(CHAPTER_RE);
    if (chapterMatch) {
      if (currentArticle) {
        articles.push(currentArticle);
        currentArticle = null;
      }
      currentChapter = parseChapterNum(chapterMatch[1]);
      currentChapterTitle = chapterMatch[2].trim();
      continue;
    }

    // 附則の検出
    if (APPENDIX_RE.test(line)) {
      if (currentArticle) {
        articles.push(currentArticle);
        currentArticle = null;
      }
      currentChapter = currentChapter + 1;
      currentChapterTitle = "附則";
      continue;
    }

    // タイトル行の検出（"（目的）" のように括弧のみの行）
    const titleOnlyMatch = line.match(TITLE_ONLY_RE);
    if (titleOnlyMatch) {
      pendingTitle = titleOnlyMatch[1];
      continue;
    }

    // 条の検出
    const articleMatch = line.match(ARTICLE_RE);
    if (articleMatch) {
      // 前の条文を保存
      if (currentArticle) {
        articles.push(currentArticle);
      }

      const articleNum = normalizeArticleNum(articleMatch[1]);
      // タイトルは括弧内 or 直前のタイトル行
      const title = articleMatch[2] || pendingTitle || "";
      const bodyStart = articleMatch[3]?.trim() || "";

      currentArticle = {
        articleNum,
        title,
        body: bodyStart,
        chapter: currentChapter,
        chapterTitle: currentChapterTitle,
      };
      pendingTitle = "";
      continue;
    }

    // 条文本体の継続行
    if (currentArticle) {
      // 先頭のスペースを除去して結合
      const trimmed = rawLine.replace(/^\s/, "");
      currentArticle.body += currentArticle.body ? "\n" + trimmed : trimmed;
    }

    pendingTitle = "";
  }

  // 最後の条文を保存
  if (currentArticle && !inAppendixTable) {
    articles.push(currentArticle);
  }

  return articles;
}

/**
 * コメントセクションをパース
 *
 * "第X条関係" をキーとして、対応するコメントテキストを抽出する。
 * "全般関係" は特別扱いで "全般" キーに格納する。
 */
function parseCommentSection(lines: string[]): Map<string, string> {
  const comments = new Map<string, string>();

  let inCommentSection = false;
  let currentKey: string | null = null;
  let currentText = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // コメントセクションの開始を検出
    if (!inCommentSection) {
      if (COMMENT_SECTION_START_RE.test(line) || COMMENT_GENERAL_RE.test(line)) {
        inCommentSection = true;
        if (COMMENT_GENERAL_RE.test(line)) {
          currentKey = "全般";
        }
      }
      continue;
    }

    // ノイズ除去
    if (isNoiseLine(line)) continue;

    // "全般関係"
    if (COMMENT_GENERAL_RE.test(line)) {
      if (currentKey && currentText) {
        comments.set(currentKey, currentText.trim());
      }
      currentKey = "全般";
      currentText = "";
      continue;
    }

    // "第X条関係" — 新しいコメントブロック
    const commentMatch = line.match(COMMENT_ARTICLE_RE);
    if (commentMatch) {
      // 前のコメントを保存
      if (currentKey && currentText) {
        comments.set(currentKey, currentText.trim());
      }
      currentKey = normalizeArticleNum(commentMatch[1]);
      currentText = "";
      continue;
    }

    // コメント本文の継続行
    if (currentKey) {
      const trimmed = rawLine.replace(/^\s/, "");
      currentText += currentText ? "\n" + trimmed : trimmed;
    }
  }

  // 最後のコメントを保存
  if (currentKey && currentText) {
    comments.set(currentKey, currentText.trim());
  }

  return comments;
}

// ---------- パブリック API ----------

/**
 * R7 標準管理規約 Markdown を条文単位にパースする。
 *
 * @param markdown pdftotext -layout で変換した R7 標準管理規約テキスト
 * @returns StandardArticle[] — semanticGroup は "misc" で初期化（マッピングは mapper.ts で実施）
 */
export function parseStandardRules(markdown: string): StandardArticle[] {
  const lines = markdown.split(/\r?\n/);

  // 条文本体をパース
  const rawArticles = parseArticleSection(lines);

  // コメントをパース
  const comments = parseCommentSection(lines);

  // 条文とコメントを結合
  const articles: StandardArticle[] = rawArticles.map((raw) => ({
    articleNum: raw.articleNum,
    title: raw.title,
    body: raw.body,
    chapter: raw.chapter,
    chapterTitle: raw.chapterTitle,
    comment: comments.get(raw.articleNum) || "",
    semanticGroup: "misc" as SemanticGroupId, // マッピング前のデフォルト
    secondaryGroups: [],
  }));

  return articles;
}

/**
 * パース結果の統計情報を返す（デバッグ・検証用）
 */
export function getParseStats(articles: StandardArticle[]): {
  totalArticles: number;
  chapters: Array<{ chapter: number; title: string; count: number }>;
  articlesWithComments: number;
  articlesWithoutComments: number;
} {
  const chapterMap = new Map<number, { title: string; count: number }>();

  for (const a of articles) {
    const existing = chapterMap.get(a.chapter);
    if (existing) {
      existing.count++;
    } else {
      chapterMap.set(a.chapter, { title: a.chapterTitle, count: 1 });
    }
  }

  const chapters = Array.from(chapterMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([chapter, { title, count }]) => ({ chapter, title, count }));

  return {
    totalArticles: articles.length,
    chapters,
    articlesWithComments: articles.filter((a) => a.comment !== "").length,
    articlesWithoutComments: articles.filter((a) => a.comment === "").length,
  };
}
