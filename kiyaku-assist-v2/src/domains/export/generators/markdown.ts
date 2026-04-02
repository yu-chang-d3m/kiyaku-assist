/**
 * Markdown ジェネレーター
 *
 * レビュー結果を Markdown 形式で出力する。
 * 総会議案書や組合員への配布資料として使用することを想定。
 */

import type {
  ExportArticle,
  ExportOptions,
  ExportResult,
  ExportGenerator,
} from "@/domains/export/types";
import {
  applyExportFilter,
  applySortOrder,
  getDecisionLabel,
  getImportanceLabel,
  groupExportArticlesByChapter,
  groupByPriorityAndSemanticGroup,
} from "@/domains/export/presentation";

// ---------- ジェネレーター ----------

export class MarkdownGenerator implements ExportGenerator {
  generate(articles: ExportArticle[], options: ExportOptions): ExportResult {
    const filtered = applyExportFilter(articles, options.filter);
    const sorted = applySortOrder(filtered, options.sortOrder);
    const content = this.buildMarkdown(sorted, options);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return {
      content,
      filename: `${options.condoName}_規約改定案_${timestamp}.md`,
      mimeType: "text/markdown; charset=utf-8",
      articleCount: filtered.length,
    };
  }

  /** Markdown テキストを構築 */
  private buildMarkdown(
    articles: ExportArticle[],
    options: ExportOptions,
  ): string {
    const lines: string[] = [];

    // ヘッダー
    lines.push(`# ${options.condoName} 管理規約改定案`);
    lines.push("");
    if (options.includeTimestamp) {
      lines.push(`生成日: ${new Date().toLocaleDateString("ja-JP")}`);
      lines.push("");
    }
    lines.push(`対象条文数: ${articles.length} 条`);
    lines.push("");
    lines.push("---");
    lines.push("");

    const sortOrder = options.sortOrder ?? "priority";

    if (sortOrder === "priority") {
      // 優先度 → 意味グループ別構成
      const sections = groupByPriorityAndSemanticGroup(articles);

      for (const section of sections) {
        lines.push(`## ${section.importanceLabel}`);
        lines.push("");

        for (const sg of section.semanticGroups) {
          lines.push(`### ${sg.groupLabel}`);
          lines.push("");

          for (const article of sg.articles) {
            this.appendArticle(lines, article);
          }
        }
      }
    } else {
      // 章番号順（従来の動作）
      const chapters = groupExportArticlesByChapter(articles);

      for (const chapter of chapters) {
        const chapterNum = chapter.chapter;
        const chapterTitle = chapter.chapterTitle || `第${chapterNum}章`;
        lines.push(`## 第${chapterNum}章 ${chapterTitle}`);
        lines.push("");

        for (const article of chapter.articles) {
          this.appendArticle(lines, article);
        }
      }
    }

    // フッター
    lines.push("");
    lines.push(
      "※ 本資料は規約リノベにより自動生成されたものです。法的助言ではありません。",
    );
    lines.push(
      "※ 最終的な規約案の決定にあたっては、マンション管理士や弁護士等の専門家にご相談ください。",
    );

    return lines.join("\n");
  }

  /** 個別条文の Markdown を追加 */
  private appendArticle(lines: string[], article: ExportArticle): void {
    lines.push(`#### ${article.articleNum}`);
    lines.push("");

    // メタ情報
    const importance = getImportanceLabel(article.importance);
    const decision = getDecisionLabel(article.decision);
    lines.push(`| 項目 | 内容 |`);
    lines.push(`|------|------|`);
    lines.push(`| 重要度 | ${importance} |`);
    lines.push(`| 判定 | ${decision} |`);
    lines.push(`| 準拠 | ${article.baseRef} |`);
    lines.push("");

    // 新旧対照表
    if (article.original) {
      const escOriginal = this.escapeTableCell(article.original);
      const escDraft = this.escapeTableCell(article.draft);
      lines.push("##### 新旧対照表");
      lines.push("");
      lines.push("| 現行規約 | 改定案 |");
      lines.push("|---------|-------|");
      lines.push(`| ${escOriginal} | ${escDraft} |`);
      lines.push("");
    } else {
      lines.push("**改定案（新規追加）:**");
      lines.push("");
      lines.push(article.draft);
      lines.push("");
    }

    // 要約と解説
    lines.push(`**要約:** ${article.summary}`);
    lines.push("");
    lines.push(`**解説:** ${article.explanation}`);
    lines.push("");

    // 判断支援情報
    if (article.impactOnResidents || article.riskIfUnchanged || article.transitionalMeasure || article.standardRuleComparison || (article.relatedLawRefs && article.relatedLawRefs.length > 0)) {
      lines.push("##### 判断支援情報");
      lines.push("");
      if (article.impactOnResidents) {
        lines.push(`**住民生活への影響:** ${article.impactOnResidents}`);
        lines.push("");
      }
      if (article.riskIfUnchanged) {
        lines.push(`**変更しなかった場合のリスク:** ${article.riskIfUnchanged}`);
        lines.push("");
      }
      if (article.transitionalMeasure) {
        lines.push(`**経過措置:** ${article.transitionalMeasure}`);
        lines.push("");
      }
      if (article.standardRuleComparison) {
        lines.push(`**標準管理規約との対比:** ${article.standardRuleComparison}`);
        lines.push("");
      }
      if (article.relatedLawRefs && article.relatedLawRefs.length > 0) {
        lines.push(`**根拠法令:** ${article.relatedLawRefs.join("、")}`);
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  /** Markdown テーブルセル内の改行・パイプをエスケープ */
  private escapeTableCell(text: string): string {
    return text
      .replace(/\|/g, "\\|")
      .replace(/\n/g, "<br>");
  }
}
