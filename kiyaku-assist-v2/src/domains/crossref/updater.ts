/**
 * 相互参照更新エンジン
 *
 * 条文の追加/削除/再採番に伴い、テキスト内の参照を新しい条文番号に置換する。
 */

/** 再採番マップ: 旧条文番号 → 新条文番号 */
export type RenumberMap = Map<string, string>;

/**
 * 全角数字を半角に変換
 */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );
}

/**
 * テキスト内の条文参照を再採番マップに基づいて更新する
 *
 * @param text - 対象テキスト
 * @param renumberMap - 旧→新 の条文番号マップ
 * @returns 更新後テキストと変更箇所数
 */
export function updateReferences(
  text: string,
  renumberMap: RenumberMap,
): { updatedText: string; changeCount: number } {
  let changeCount = 0;

  // 条文参照パターン: 「第X条（の2）」の形式
  const ARTICLE_REF_RE =
    /第[０-９\d]+条(?:の[０-９\d]+)?/g;

  const updatedText = text.replace(ARTICLE_REF_RE, (match) => {
    // 正規化して検索
    const halfWidth = toHalfWidth(match);
    const numMatch = halfWidth.match(/第(\d+)条(?:の(\d+))?/);
    if (!numMatch) return match;

    const oldNum = numMatch[2]
      ? `第${numMatch[1]}条の${numMatch[2]}`
      : `第${numMatch[1]}条`;

    const newNum = renumberMap.get(oldNum);
    if (!newNum) return match; // マップにない場合はそのまま

    changeCount++;

    // 元テキストが全角だった場合は全角に戻す（オリジナルの表記を尊重）
    const isFullWidth = /[０-９]/.test(match);
    if (isFullWidth) {
      return newNum.replace(/\d/g, (d) =>
        String.fromCharCode(d.charCodeAt(0) - 0x30 + 0xff10),
      );
    }
    return newNum;
  });

  return { updatedText, changeCount };
}

/**
 * 複数テキストに対して参照更新をバッチ適用
 */
export function batchUpdateReferences(
  articles: Array<{ articleNum: string; text: string }>,
  renumberMap: RenumberMap,
): Array<{ articleNum: string; text: string; changeCount: number }> {
  return articles.map((a) => {
    const { updatedText, changeCount } = updateReferences(a.text, renumberMap);
    // 条文番号自体も更新
    const newArticleNum = renumberMap.get(a.articleNum) ?? a.articleNum;
    return {
      articleNum: newArticleNum,
      text: updatedText,
      changeCount,
    };
  });
}
