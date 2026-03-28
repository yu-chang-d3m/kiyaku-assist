/**
 * 新旧対照表生成
 *
 * 条文番号順 or 意味グループ別で新旧対照表を出力。
 */

import type { ExportArticle } from "@/domains/export/types";
import {
  groupExportArticlesByChapter,
  groupExportArticlesBySemanticGroup,
  getDecisionLabel,
  getImportanceLabel,
} from "@/domains/export/presentation";

interface ComparisonTableOptions {
  /** 意味グループ別にグルーピング（false = 章番号順） */
  groupBySemanticGroup?: boolean;
}

/** 新旧対照表の Markdown を生成 */
export function generateComparisonTableMarkdown(
  articles: ExportArticle[],
  options: ComparisonTableOptions = {},
): string {
  const lines: string[] = [];

  lines.push("## 新旧対照表");
  lines.push("");

  if (options.groupBySemanticGroup) {
    const groups = groupExportArticlesBySemanticGroup(articles);
    for (const group of groups) {
      lines.push(`### ${group.groupLabel}`);
      lines.push("");
      appendComparisonRows(lines, group.articles);
    }
  } else {
    const chapters = groupExportArticlesByChapter(articles);
    for (const chapter of chapters) {
      lines.push(
        `### 第${chapter.chapter}章 ${chapter.chapterTitle}`,
      );
      lines.push("");
      appendComparisonRows(lines, chapter.articles);
    }
  }

  return lines.join("\n");
}

function appendComparisonRows(
  lines: string[],
  articles: ExportArticle[],
) {
  lines.push("| 条番号 | 重要度 | 判断 | 現行規約 | 改定案 |");
  lines.push("|--------|--------|------|---------|-------|");

  for (const a of articles) {
    const original = a.original
      ? escapeCell(a.original).slice(0, 80)
      : "（新規）";
    const draft = escapeCell(a.draft).slice(0, 80);
    lines.push(
      `| ${a.articleNum} | ${getImportanceLabel(a.importance)} | ${getDecisionLabel(a.decision)} | ${original} | ${draft} |`,
    );
  }

  lines.push("");
}

function escapeCell(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}
