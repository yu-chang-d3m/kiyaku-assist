/**
 * サマリーテーブル生成
 *
 * 意味グループ別 + 重要度別のサマリーを Markdown テーブルとして出力。
 */

import type { ExportArticle } from "@/domains/export/types";
import type { SummaryRow } from "@/domains/export/export-types";
import {
  groupExportArticlesBySemanticGroup,
  getDecisionLabel,
} from "@/domains/export/presentation";

/** サマリーテーブルの Markdown を生成 */
export function generateSummaryTableMarkdown(
  articles: ExportArticle[],
): string {
  const rows = buildSummaryRows(articles);
  const lines: string[] = [];

  lines.push("## 改正概要サマリー");
  lines.push("");
  lines.push("| テーマ | 条文数 | 必須 | 判断済 | 主な変更点 |");
  lines.push("|--------|--------|------|--------|-----------|");

  for (const row of rows) {
    lines.push(
      `| ${row.groupLabel} | ${row.totalCount} | ${row.mandatoryCount} | ${row.decidedCount} | ${row.keyChanges.slice(0, 2).join("、")} |`,
    );
  }

  // 合計行
  const total = rows.reduce((acc, r) => acc + r.totalCount, 0);
  const totalMandatory = rows.reduce((acc, r) => acc + r.mandatoryCount, 0);
  const totalDecided = rows.reduce((acc, r) => acc + r.decidedCount, 0);
  lines.push(`| **合計** | **${total}** | **${totalMandatory}** | **${totalDecided}** | — |`);
  lines.push("");

  return lines.join("\n");
}

/** サマリー行データを構築 */
function buildSummaryRows(articles: ExportArticle[]): SummaryRow[] {
  const groups = groupExportArticlesBySemanticGroup(articles);

  return groups.map((g) => {
    const mandatoryCount = g.articles.filter(
      (a) => a.importance === "mandatory",
    ).length;
    const decidedCount = g.articles.filter(
      (a) => a.decision && a.decision !== "pending",
    ).length;

    // 主な変更点: 決定済みの条文サマリーから最初の2つ
    const keyChanges = g.articles
      .filter((a) => a.decision && a.decision !== "pending")
      .slice(0, 2)
      .map((a) => `${a.articleNum}(${getDecisionLabel(a.decision)})`);

    return {
      groupLabel: g.groupLabel,
      totalCount: g.articles.length,
      mandatoryCount,
      decidedCount,
      keyChanges,
    };
  });
}
