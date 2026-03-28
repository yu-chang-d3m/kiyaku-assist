/**
 * 相互参照バリデーター
 *
 * 参照グラフから不整合（参照先不在、循環参照等）を検出する。
 */

import type {
  CrossRefGraph,
  CrossRefValidation,
  CrossRefIssue,
} from "@/domains/crossref/types";

/**
 * 参照グラフをバリデーションし、問題を検出
 */
export function validateCrossRefs(
  graph: CrossRefGraph,
  existingArticleNums: Set<string>,
): CrossRefValidation[] {
  const validations = new Map<string, CrossRefIssue[]>();

  // 1. 参照先不在チェック
  for (const ref of graph.broken) {
    const issues = validations.get(ref.sourceArticleNum) ?? [];
    issues.push({
      type: "broken",
      message: `「${ref.rawText}」の参照先が存在しません`,
      reference: ref,
    });
    validations.set(ref.sourceArticleNum, issues);
  }

  // 2. 循環参照チェック（A→B→A のような直接的な循環のみ）
  for (const [source, refs] of graph.outgoing) {
    for (const ref of refs) {
      const reverseRefs = graph.outgoing.get(ref.targetArticleNum);
      if (reverseRefs?.some((r) => r.targetArticleNum === source)) {
        const issues = validations.get(source) ?? [];
        // 循環は双方に記録しない（片方だけ）
        if (
          !issues.some(
            (i) =>
              i.type === "circular" &&
              i.reference.targetArticleNum === ref.targetArticleNum,
          )
        ) {
          issues.push({
            type: "circular",
            message: `${source} と ${ref.targetArticleNum} の間に循環参照があります`,
            reference: ref,
          });
          validations.set(source, issues);
        }
      }
    }
  }

  return Array.from(validations.entries()).map(([articleNum, issues]) => ({
    articleNum,
    issues,
  }));
}

/**
 * 特定条文の参照サマリーを取得
 */
export function getArticleRefSummary(
  articleNum: string,
  graph: CrossRefGraph,
): {
  referencesFrom: string[];
  referencedBy: string[];
  hasBrokenRefs: boolean;
} {
  const outgoing = graph.outgoing.get(articleNum) ?? [];
  const incoming = graph.incoming.get(articleNum) ?? [];

  const referencesFrom = [
    ...new Set(outgoing.map((r) => r.targetArticleNum)),
  ];
  const referencedBy = [
    ...new Set(incoming.map((r) => r.sourceArticleNum)),
  ];
  const hasBrokenRefs = graph.broken.some(
    (r) => r.sourceArticleNum === articleNum,
  );

  return { referencesFrom, referencedBy, hasBrokenRefs };
}
