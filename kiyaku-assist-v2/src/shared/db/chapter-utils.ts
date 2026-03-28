/** category（章名）から chapter 番号を推定する */
const CATEGORY_TO_CHAPTER: Record<string, number> = {
  "総則": 1,
  "専有部分等の範囲": 2,
  "敷地及び共用部分等の共有": 3,
  "用法": 4,
  "管理": 5,
  "管理組合": 6,
  "会計": 7,
  "雑則": 8,
};

export function inferChapterFromCategory(category: string): number {
  // 完全一致を試す
  if (CATEGORY_TO_CHAPTER[category] !== undefined) {
    return CATEGORY_TO_CHAPTER[category];
  }
  // 部分一致を試す
  for (const [name, num] of Object.entries(CATEGORY_TO_CHAPTER)) {
    if (category.includes(name)) return num;
  }
  return 0;
}
