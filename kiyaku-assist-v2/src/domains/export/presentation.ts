import type { ExportArticle, ExportFilter, ExportSortOrder } from "@/domains/export/types";
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
    semanticGroup: article.semanticGroup,
    secondaryGroups: article.secondaryGroups,
    issueGroup: article.issueGroup,
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

// ---------- 優先度 → 意味グループ → 課題グループ → 章番号ソート ----------

/** importance の数値優先度（小さいほど上） */
const IMPORTANCE_ORDER: Record<string, number> = {
  mandatory: 0,
  recommended: 1,
  optional: 2,
};

/** semanticGroup の数値優先度（SEMANTIC_GROUPS の priority フィールドを利用） */
const SEMANTIC_GROUP_PRIORITY: Record<string, number> = Object.fromEntries(
  SEMANTIC_GROUPS.map((g) => [g.id, g.priority]),
);

/**
 * 条文を「優先度 → 意味グループ → 課題グループ → 章番号」でソートする。
 *
 * 1. importance: mandatory → recommended → optional → (undefined)
 * 2. semanticGroup（SEMANTIC_GROUPS の priority 順）
 * 3. issueGroup（同一グループ内でまとめる）
 * 4. 元の章番号順（フォールバック）
 */
export function sortByPriority(articles: ExportArticle[]): ExportArticle[] {
  return [...articles].sort((a, b) => {
    // 1. importance
    const impA = IMPORTANCE_ORDER[a.importance] ?? 99;
    const impB = IMPORTANCE_ORDER[b.importance] ?? 99;
    if (impA !== impB) return impA - impB;

    // 2. semanticGroup
    const sgA = SEMANTIC_GROUP_PRIORITY[a.semanticGroup ?? ""] ?? 99;
    const sgB = SEMANTIC_GROUP_PRIORITY[b.semanticGroup ?? ""] ?? 99;
    if (sgA !== sgB) return sgA - sgB;

    // 3. issueGroup（アルファベット順、undefined は後ろ）
    const igA = a.issueGroup ?? "\uffff";
    const igB = b.issueGroup ?? "\uffff";
    if (igA !== igB) return igA.localeCompare(igB);

    // 4. 章番号 → 条番号のフォールバック
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.articleNum.localeCompare(b.articleNum, "ja", { numeric: true });
  });
}

/** sortOrder に応じたソートを適用 */
export function applySortOrder(
  articles: ExportArticle[],
  sortOrder?: ExportSortOrder,
): ExportArticle[] {
  const order = sortOrder ?? "priority";
  if (order === "chapter") {
    // 元の章番号 → 条番号順
    return [...articles].sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.articleNum.localeCompare(b.articleNum, "ja", { numeric: true });
    });
  }
  return sortByPriority(articles);
}

// ---------- 優先度グループ別構造（Markdown/Word 用） ----------

/** 優先度 → 意味グループのネスト構造 */
export interface ExportPrioritySection {
  importance: string;
  importanceLabel: string;
  semanticGroups: {
    groupId: string;
    groupLabel: string;
    articles: ExportArticle[];
  }[];
}

/** 優先度別 → 意味グループ別にネストしたグルーピングを返す */
export function groupByPriorityAndSemanticGroup(
  articles: ExportArticle[],
): ExportPrioritySection[] {
  const sorted = sortByPriority(articles);

  const PRIORITY_SECTION_LABELS: Record<string, string> = {
    mandatory: "法的必須の改正事項",
    recommended: "推奨される改正事項",
    optional: "任意の改正事項",
  };

  const importanceOrder = ["mandatory", "recommended", "optional"] as const;
  const sections: ExportPrioritySection[] = [];

  for (const imp of importanceOrder) {
    const impArticles = sorted.filter((a) => a.importance === imp);
    if (impArticles.length === 0) continue;

    // 意味グループ別にサブグルーピング
    const sgMap = new Map<string, ExportArticle[]>();
    for (const article of impArticles) {
      const gid = article.semanticGroup ?? "misc";
      const existing = sgMap.get(gid) ?? [];
      existing.push(article);
      sgMap.set(gid, existing);
    }

    // SEMANTIC_GROUPS の priority 順で並べる
    const semanticGroups = SEMANTIC_GROUPS
      .filter((g) => sgMap.has(g.id))
      .map((g) => ({
        groupId: g.id,
        groupLabel: g.label,
        articles: sgMap.get(g.id) ?? [],
      }));

    // misc がマップにあるがSEMANTIC_GROUPSで見つからない場合のフォールバック
    if (sgMap.has("misc") && !SEMANTIC_GROUPS.some((g) => g.id === "misc" && sgMap.has(g.id))) {
      // misc は SEMANTIC_GROUPS に含まれているので通常はここに来ない
    }

    sections.push({
      importance: imp,
      importanceLabel: PRIORITY_SECTION_LABELS[imp] ?? imp,
      semanticGroups,
    });
  }

  return sections;
}

export { SEMANTIC_GROUP_LABELS };
