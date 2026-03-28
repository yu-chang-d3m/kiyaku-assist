import type { ExportArticle, ExportFilter } from "@/domains/export/types";
import type { ReviewArticle } from "@/shared/db/types";
import { SEMANTIC_GROUPS, SEMANTIC_GROUP_LABELS } from "@/domains/taxonomy/constants";

export const IMPORTANCE_LABELS: Record<string, string> = {
  mandatory: "必須",
  recommended: "推奨",
  optional: "任意",
};

export const DECISION_LABELS: Record<string, string> = {
  adopted: "採用",
  modified: "修正採用",
  "keep-current": "現行維持",
  "adopt-management": "管理会社案採用",
  pending: "保留",
};

export const CHAPTER_TITLES: Record<number, string> = {
  1: "総則",
  2: "専有部分等の範囲",
  3: "敷地及び共用部分等の共有",
  4: "用法",
  5: "管理",
  6: "管理組合",
  7: "会計",
  8: "雑則",
};

export interface ExportChapterGroup {
  chapter: number;
  chapterTitle: string;
  articles: ExportArticle[];
}

export function toExportArticle(article: ReviewArticle): ExportArticle {
  return {
    chapter: article.chapter,
    chapterTitle:
      CHAPTER_TITLES[article.chapter] ??
      article.category ??
      `第${article.chapter}章`,
    articleNum: article.articleNum,
    original: article.original,
    draft: article.draft,
    summary: article.summary,
    explanation: article.explanation,
    importance: article.importance,
    decision: article.decision,
    baseRef: article.baseRef,
    relatedLawRefs: article.relatedLawRefs,
    impactOnResidents: article.impactOnResidents,
    riskIfUnchanged: article.riskIfUnchanged,
    transitionalMeasure: article.transitionalMeasure,
    standardRuleComparison: article.standardRuleComparison,
  };
}

export function applyExportFilter(
  articles: ExportArticle[],
  filter?: ExportFilter,
): ExportArticle[] {
  if (!filter) return articles;

  return articles.filter((article) => {
    if (filter.decisions && !filter.decisions.includes(article.decision)) {
      return false;
    }
    if (
      filter.importances &&
      !filter.importances.includes(article.importance)
    ) {
      return false;
    }
    if (filter.chapters && !filter.chapters.includes(article.chapter)) {
      return false;
    }
    return true;
  });
}

export function groupExportArticlesByChapter(
  articles: ExportArticle[],
): ExportChapterGroup[] {
  const groups = new Map<number, ExportChapterGroup>();

  for (const article of articles) {
    const existing = groups.get(article.chapter);
    if (existing) {
      existing.articles.push(article);
      continue;
    }

    groups.set(article.chapter, {
      chapter: article.chapter,
      chapterTitle: article.chapterTitle || `第${article.chapter}章`,
      articles: [article],
    });
  }

  return Array.from(groups.values());
}

export function getImportanceLabel(importance: ExportArticle["importance"]): string {
  return IMPORTANCE_LABELS[importance] ?? importance;
}

export function getDecisionLabel(
  decision: ExportArticle["decision"],
): string {
  if (!decision) return "未決定";
  return DECISION_LABELS[decision] ?? decision;
}

// ---------- 意味グループ別エクスポート ----------

export interface ExportSemanticGroup {
  groupId: string;
  groupLabel: string;
  priority: number;
  articles: ExportArticle[];
}

/** 意味グループ別にエクスポート条文をグルーピング */
export function groupExportArticlesBySemanticGroup(
  articles: ExportArticle[],
): ExportSemanticGroup[] {
  const groupMap = new Map<string, ExportArticle[]>();

  for (const article of articles) {
    const gid = (article as ExportArticle & { semanticGroup?: string }).semanticGroup ?? "misc";
    const existing = groupMap.get(gid) ?? [];
    existing.push(article);
    groupMap.set(gid, existing);
  }

  return SEMANTIC_GROUPS
    .filter((g) => groupMap.has(g.id))
    .map((g) => ({
      groupId: g.id,
      groupLabel: g.label,
      priority: g.priority,
      articles: groupMap.get(g.id) ?? [],
    }));
}

/** 重要度別にエクスポート条文をグルーピング */
export function groupExportArticlesByPriority(
  articles: ExportArticle[],
): { importance: string; label: string; articles: ExportArticle[] }[] {
  const order = ["mandatory", "recommended", "optional"] as const;
  return order
    .map((imp) => ({
      importance: imp,
      label: IMPORTANCE_LABELS[imp] ?? imp,
      articles: articles.filter((a) => a.importance === imp),
    }))
    .filter((g) => g.articles.length > 0);
}

export { SEMANTIC_GROUP_LABELS };
