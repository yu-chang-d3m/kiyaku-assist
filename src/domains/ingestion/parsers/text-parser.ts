/**
 * テキストパーサー
 *
 * プレーンテキスト形式の管理規約を構造化データに変換する。
 * 章・条・項・号の階層構造を正規表現で抽出し、ParseResult に整形する。
 */

import type {
  ArticleParser,
  ParseResult,
  ParsedArticle,
  ParsedParagraph,
  ParsedItem,
} from "@/domains/ingestion/types";

// ---------- 正規表現パターン ----------

/** 章の検出パターン（例: "第1章 総則"、"第２章　管理組合の運営"） */
const CHAPTER_PATTERN = /^第([０-９\d]+)章\s*(.+)$/;

/** 条の検出パターン（例: "第3条（規約の遵守義務）"、"第3条（規約の遵守義務） 本文..."、"第12条 本文..."） */
const ARTICLE_PATTERN = /^(第[０-９\d]+条(?:の[０-９\d]+)?)\s*(?:[（(]([^）)]+)[）)]\s*)?(.*)/;

/** 項番号の検出パターン（例: "２ ..."、"3 ..."） */
const PARAGRAPH_PATTERN = /^([０-９\d]+)\s+(.+)$/;

/** 号の検出パターン（例: "一 ..."、"(1) ..."、"① ..."） */
const ITEM_PATTERN = /^(?:([一二三四五六七八九十]+)|[（(]([０-９\d]+)[）)]|([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]))\s+(.+)$/;

// ---------- ユーティリティ ----------

/** 全角数字を半角に変換 */
function normalizeNumber(str: string): number {
  const normalized = str.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  return parseInt(normalized, 10);
}

/** 漢数字を半角数字に変換（号番号用、1〜20 対応） */
function kanjiToNumber(kanji: string): number {
  const kanjiMap: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15,
    十六: 16, 十七: 17, 十八: 18, 十九: 19, 二十: 20,
  };
  return kanjiMap[kanji] ?? 0;
}

/** 丸囲み数字を数値に変換 */
function circledToNumber(circled: string): number {
  const base = "①".charCodeAt(0);
  return circled.charCodeAt(0) - base + 1;
}

// ---------- パーサー実装 ----------

export class TextParser implements ArticleParser {
  async parse(content: string): Promise<ParseResult> {
    const lines = content.split(/\r?\n/);
    const articles: ParsedArticle[] = [];
    const warnings: string[] = [];

    let currentChapter = 0;
    let currentChapterTitle = "";
    const chapterNames: string[] = [];

    let currentArticle: ParsedArticle | null = null;
    let currentParagraph: ParsedParagraph | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // 章の検出
      const chapterMatch = line.match(CHAPTER_PATTERN);
      if (chapterMatch) {
        currentChapter = normalizeNumber(chapterMatch[1]);
        currentChapterTitle = chapterMatch[2].trim();
        chapterNames.push(currentChapterTitle);
        continue;
      }

      // 条の検出
      const articleMatch = line.match(ARTICLE_PATTERN);
      if (articleMatch) {
        // 前の条文を保存
        if (currentArticle) {
          if (currentParagraph) {
            currentArticle.paragraphs.push(currentParagraph);
            currentParagraph = null;
          }
          articles.push(currentArticle);
        }

        currentArticle = {
          chapter: currentChapter,
          chapterTitle: currentChapterTitle,
          articleNum: articleMatch[1],
          title: articleMatch[2] || "",
          body: articleMatch[3]?.trim() || "",
          paragraphs: [],
        };
        continue;
      }

      if (!currentArticle) continue;

      // 号の検出（項よりも先にチェック）
      const itemMatch = line.match(ITEM_PATTERN);
      if (itemMatch) {
        const itemNum = itemMatch[1]
          ? kanjiToNumber(itemMatch[1])
          : itemMatch[2]
            ? normalizeNumber(itemMatch[2])
            : circledToNumber(itemMatch[3]);
        const itemBody = itemMatch[4];

        const item: ParsedItem = { num: itemNum, body: itemBody };

        if (currentParagraph) {
          currentParagraph.items.push(item);
        } else {
          // 項がまだない場合、暗黙の第1項を作成
          currentParagraph = { num: 1, body: currentArticle.body, items: [item] };
          currentArticle.body = "";
        }
        continue;
      }

      // 項の検出
      const paragraphMatch = line.match(PARAGRAPH_PATTERN);
      if (paragraphMatch) {
        const parNum = normalizeNumber(paragraphMatch[1]);
        // 項番号が 2 以上の場合のみ項として扱う（1 は条文本体の可能性）
        if (parNum >= 2 || currentArticle.paragraphs.length > 0) {
          if (currentParagraph) {
            currentArticle.paragraphs.push(currentParagraph);
          }
          currentParagraph = {
            num: parNum,
            body: paragraphMatch[2],
            items: [],
          };
          continue;
        }
      }

      // それ以外は現在の条文本体に追加
      if (currentParagraph) {
        currentParagraph.body += currentParagraph.body ? "\n" + line : line;
      } else {
        currentArticle.body += currentArticle.body ? "\n" + line : line;
      }
    }

    // 最後の条文を保存
    if (currentArticle) {
      if (currentParagraph) {
        currentArticle.paragraphs.push(currentParagraph);
      }
      articles.push(currentArticle);
    }

    // 章番号が 0 のまま条文がある場合の警告
    const noChapterArticles = articles.filter((a) => a.chapter === 0);
    if (noChapterArticles.length > 0) {
      warnings.push(
        `${noChapterArticles.length} 件の条文で章番号を検出できませんでした`
      );
    }

    return {
      articles,
      metadata: {
        totalArticles: articles.length,
        totalChapters: chapterNames.length,
        chapterNames,
        parsedAt: new Date().toISOString(),
        sourceFormat: "text",
        warnings,
      },
    };
  }
}
