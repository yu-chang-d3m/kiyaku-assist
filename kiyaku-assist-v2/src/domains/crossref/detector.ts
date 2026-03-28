/**
 * 相互参照検出エンジン
 *
 * 条文テキスト内の「第X条（第Y項）（第Z号）」パターンを正規表現で抽出し、
 * 参照グラフを構築する。
 */

import type { CrossReference, CrossRefGraph } from "@/domains/crossref/types";

/**
 * 条文参照パターン
 *
 * マッチ例:
 * - 第3条
 * - 第3条第2項
 * - 第3条第2項第1号
 * - 第12条の2
 * - 第47条第５項
 * - 前条
 * - 次条
 */
const ARTICLE_REF_RE =
  /(?:第[０-９\d]+条(?:の[０-９\d]+)?)(?:第[０-９\d]+項)?(?:第[０-９\d]+号)?/g;

/** 前条/次条パターン */
const RELATIVE_REF_RE = /(?:前条|次条|本条)/g;

/**
 * 全角数字を半角に変換
 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );
}

/**
 * 参照テキストから条文番号を抽出
 */
function parseArticleNum(rawText: string): string {
  const half = toHalfWidth(rawText);
  const m = half.match(/第(\d+)条(?:の(\d+))?/);
  if (!m) return rawText;
  return m[2] ? `第${m[1]}条の${m[2]}` : `第${m[1]}条`;
}

/**
 * 参照テキストから項番号を抽出
 */
function parseParagraph(rawText: string): string | null {
  const half = toHalfWidth(rawText);
  const m = half.match(/第(\d+)項/);
  return m ? `第${m[1]}項` : null;
}

/**
 * 参照テキストから号番号を抽出
 */
function parseItem(rawText: string): string | null {
  const half = toHalfWidth(rawText);
  const m = half.match(/第(\d+)号/);
  return m ? `第${m[1]}号` : null;
}

/**
 * テキストから条文参照を全て抽出
 */
export function detectReferences(
  sourceArticleNum: string,
  text: string,
): CrossReference[] {
  const refs: CrossReference[] = [];
  const seen = new Set<string>();

  // 明示的な条文参照
  let match: RegExpExecArray | null;
  const regex = new RegExp(ARTICLE_REF_RE.source, "g");

  while ((match = regex.exec(text)) !== null) {
    const rawText = match[0];
    const targetArticleNum = parseArticleNum(rawText);

    // 自己参照は除外
    if (targetArticleNum === sourceArticleNum) continue;

    // 重複除外（同じ条文への同じ形式の参照）
    const key = `${targetArticleNum}:${rawText}`;
    if (seen.has(key)) continue;
    seen.add(key);

    refs.push({
      sourceArticleNum,
      targetArticleNum,
      targetParagraph: parseParagraph(rawText),
      targetItem: parseItem(rawText),
      rawText,
      position: match.index,
    });
  }

  return refs;
}

/**
 * 全条文から参照グラフを構築
 *
 * @param articles - { articleNum, text } の配列
 * @returns 参照グラフ
 */
export function buildCrossRefGraph(
  articles: Array<{ articleNum: string; text: string }>,
): CrossRefGraph {
  const allRefs: CrossReference[] = [];
  const existingNums = new Set(articles.map((a) => a.articleNum));

  for (const article of articles) {
    const refs = detectReferences(article.articleNum, article.text);
    allRefs.push(...refs);
  }

  // outgoing / incoming マップ構築
  const outgoing = new Map<string, CrossReference[]>();
  const incoming = new Map<string, CrossReference[]>();
  const broken: CrossReference[] = [];

  for (const ref of allRefs) {
    // outgoing
    const out = outgoing.get(ref.sourceArticleNum) ?? [];
    out.push(ref);
    outgoing.set(ref.sourceArticleNum, out);

    // incoming
    const inc = incoming.get(ref.targetArticleNum) ?? [];
    inc.push(ref);
    incoming.set(ref.targetArticleNum, inc);

    // broken check
    if (!existingNums.has(ref.targetArticleNum)) {
      broken.push(ref);
    }
  }

  // unique pairs
  const pairs = new Set(
    allRefs.map((r) => `${r.sourceArticleNum}→${r.targetArticleNum}`),
  );

  return {
    references: allRefs,
    outgoing,
    incoming,
    broken,
    stats: {
      totalReferences: allRefs.length,
      uniqueArticlePairs: pairs.size,
      brokenReferences: broken.length,
    },
  };
}
