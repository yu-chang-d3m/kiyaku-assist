/**
 * CSV ジェネレーター
 *
 * レビュー結果を CSV 形式で出力する。
 * Excel で開けるよう BOM 付き UTF-8 で出力する。
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
} from "@/domains/export/presentation";

// ---------- CSV 設定 ----------

/** BOM（Byte Order Mark）— Excel が UTF-8 として認識するために必要 */
const UTF8_BOM = "\uFEFF";

/** CSV ヘッダー行 */
const CSV_HEADERS = [
  "章番号",
  "章名",
  "条番号",
  "重要度",
  "判定",
  "改定案",
  "現行規約",
  "要約",
  "解説",
  "準拠先",
  "住民生活への影響",
  "変更しなかった場合のリスク",
  "経過措置",
  "標準管理規約との対比",
  "根拠法令",
] as const;

export class CsvGenerator implements ExportGenerator {
  generate(articles: ExportArticle[], options: ExportOptions): ExportResult {
    const filtered = applyExportFilter(articles, options.filter);
    const sorted = applySortOrder(filtered, options.sortOrder);
    const content = this.buildCsv(sorted);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return {
      content,
      filename: `${options.condoName}_規約改定案_${timestamp}.csv`,
      mimeType: "text/csv; charset=utf-8",
      articleCount: filtered.length,
    };
  }

  /** CSV テキストを構築（BOM 付き） */
  private buildCsv(articles: ExportArticle[]): string {
    const rows: string[] = [];

    // BOM + ヘッダー
    rows.push(UTF8_BOM + CSV_HEADERS.join(","));

    // データ行
    for (const article of articles) {
      const importance = getImportanceLabel(article.importance);
      const decision = getDecisionLabel(article.decision);

      const row = [
        String(article.chapter),
        this.escapeCsv(article.chapterTitle),
        this.escapeCsv(article.articleNum),
        importance,
        decision,
        this.escapeCsv(article.draft),
        this.escapeCsv(article.original ?? "（新規追加）"),
        this.escapeCsv(article.summary),
        this.escapeCsv(article.explanation),
        this.escapeCsv(article.baseRef),
        this.escapeCsv(article.impactOnResidents ?? ""),
        this.escapeCsv(article.riskIfUnchanged ?? ""),
        this.escapeCsv(article.transitionalMeasure ?? ""),
        this.escapeCsv(article.standardRuleComparison ?? ""),
        this.escapeCsv(article.relatedLawRefs?.join("、") ?? ""),
      ];

      rows.push(row.join(","));
    }

    return rows.join("\r\n");
  }

  /**
   * CSV フィールドのエスケープ
   *
   * - ダブルクォートで囲む
   * - フィールド内のダブルクォートは二重化
   * - 改行はスペースに置換（Excel 互換性のため）
   */
  private escapeCsv(value: string): string {
    const escaped = value
      .replace(/"/g, '""')
      .replace(/\r?\n/g, " ");
    return `"${escaped}"`;
  }
}
