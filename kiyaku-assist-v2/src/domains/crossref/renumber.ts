/**
 * 条文再採番ロジック
 *
 * 条文の追加/削除に伴い、連番を維持するための再採番マップを生成する。
 */

import type { RenumberMap } from "@/domains/crossref/updater";

/**
 * 条文番号から数値部分を抽出
 */
function extractArticleNumber(articleNum: string): {
  num: number;
  suffix: string | null;
} {
  const half = articleNum.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );
  const m = half.match(/第(\d+)条(?:の(\d+))?/);
  if (!m) return { num: 0, suffix: null };
  return { num: parseInt(m[1], 10), suffix: m[2] ?? null };
}

/**
 * 条文追加に伴う再採番マップを生成
 *
 * @param existingNums - 現在の条文番号リスト（順序付き）
 * @param insertAfter - この条文の後に挿入（例: "第5条"）
 * @param insertCount - 挿入する条文数
 * @returns 旧→新 の条文番号マップ
 */
export function buildInsertRenumberMap(
  existingNums: string[],
  insertAfter: string,
  insertCount: number = 1,
): RenumberMap {
  const map: RenumberMap = new Map();
  const { num: afterNum } = extractArticleNumber(insertAfter);

  if (afterNum === 0) return map;

  for (const existing of existingNums) {
    const { num, suffix } = extractArticleNumber(existing);
    if (num > afterNum && suffix === null) {
      // 挿入点より後の条文を +insertCount する
      map.set(existing, `第${num + insertCount}条`);
    }
  }

  return map;
}

/**
 * 条文削除に伴う再採番マップを生成
 *
 * @param existingNums - 現在の条文番号リスト（順序付き）
 * @param deletedNums - 削除する条文番号リスト
 * @returns 旧→新 の条文番号マップ
 */
export function buildDeleteRenumberMap(
  existingNums: string[],
  deletedNums: string[],
): RenumberMap {
  const map: RenumberMap = new Map();
  const deletedSet = new Set(deletedNums);

  // 削除された条文の数を条文番号ごとにカウント
  const sorted = existingNums
    .map((n) => ({ articleNum: n, ...extractArticleNumber(n) }))
    .filter((a) => a.suffix === null) // 「条の2」形式は除外
    .sort((a, b) => a.num - b.num);

  let deletedSoFar = 0;
  for (const a of sorted) {
    if (deletedSet.has(a.articleNum)) {
      deletedSoFar++;
      continue;
    }
    if (deletedSoFar > 0) {
      map.set(a.articleNum, `第${a.num - deletedSoFar}条`);
    }
  }

  return map;
}
