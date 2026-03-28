/**
 * 表紙生成（Markdown / Word 共通）
 */

import type { CoverPageData } from "@/domains/export/export-types";

/** Markdown 形式の表紙 */
export function generateCoverPageMarkdown(data: CoverPageData): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push("");
  lines.push(`# ${data.condoName}`);
  lines.push(`## ${data.subtitle}`);
  lines.push("");
  lines.push(`**作成日:** ${data.date}`);
  lines.push("");

  if (data.location) {
    lines.push(`**所在地:** ${data.location}`);
    lines.push("");
  }
  if (data.buildingAge) {
    lines.push(`**築年数:** ${data.buildingAge}年`);
    lines.push("");
  }
  if (data.managementCompany) {
    lines.push(`**管理会社:** ${data.managementCompany}`);
    lines.push("");
  }

  lines.push(`**対象条文数:** ${data.totalArticles}条`);
  lines.push(`**判断済み:** ${data.decidedArticles}条`);
  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}
