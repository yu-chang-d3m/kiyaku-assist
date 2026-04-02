/**
 * Excel (xlsx) ジェネレーター
 *
 * レビュー結果を Excel 形式で出力する。
 * 理事会メンバー間の回覧・加筆に適したスプレッドシート。
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

/** カラム定義 */
const COLUMNS = [
  { header: "章番号", key: "chapter", width: 8 },
  { header: "章名", key: "chapterTitle", width: 20 },
  { header: "条番号", key: "articleNum", width: 12 },
  { header: "意味グループ", key: "semanticGroup", width: 18 },
  { header: "重要度", key: "importance", width: 10 },
  { header: "判定", key: "decision", width: 14 },
  { header: "改定案", key: "draft", width: 50 },
  { header: "現行規約", key: "original", width: 50 },
  { header: "要約", key: "summary", width: 40 },
  { header: "解説", key: "explanation", width: 40 },
  { header: "準拠先", key: "baseRef", width: 25 },
  { header: "住民生活への影響", key: "impactOnResidents", width: 30 },
  { header: "変更しなかった場合のリスク", key: "riskIfUnchanged", width: 30 },
  { header: "経過措置", key: "transitionalMeasure", width: 30 },
  { header: "標準管理規約との対比", key: "standardRuleComparison", width: 30 },
  { header: "根拠法令", key: "relatedLawRefs", width: 25 },
] as const;

/** 重要度に応じたセル背景色 */
const IMPORTANCE_FILLS: Record<string, { type: "pattern"; pattern: "solid"; fgColor: { argb: string } }> = {
  mandatory: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4EC" } },
  recommended: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3E0" } },
  optional: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } },
};

export class ExcelGenerator implements ExportGenerator {
  async generate(
    articles: ExportArticle[],
    options: ExportOptions,
  ): Promise<ExportResult> {
    // exceljs は Node.js ネイティブモジュールに依存するため動的 import
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "キヤクアシスト";
    workbook.created = new Date();

    const filtered = applyExportFilter(articles, options.filter);
    const sorted = applySortOrder(filtered, options.sortOrder);

    // メインシート
    const ws = workbook.addWorksheet("規約改定案", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // カラム設定
    ws.columns = COLUMNS.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    // ヘッダー行のスタイル
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1565C0" },
    };
    headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { vertical: "middle", wrapText: true };

    // データ行
    for (const article of sorted) {
      const row = ws.addRow({
        chapter: article.chapter,
        chapterTitle: article.chapterTitle,
        articleNum: article.articleNum,
        semanticGroup: article.semanticGroup ?? "",
        importance: getImportanceLabel(article.importance),
        decision: getDecisionLabel(article.decision),
        draft: article.draft,
        original: article.original ?? "（新規追加）",
        summary: article.summary,
        explanation: article.explanation,
        baseRef: article.baseRef,
        impactOnResidents: article.impactOnResidents ?? "",
        riskIfUnchanged: article.riskIfUnchanged ?? "",
        transitionalMeasure: article.transitionalMeasure ?? "",
        standardRuleComparison: article.standardRuleComparison ?? "",
        relatedLawRefs: article.relatedLawRefs?.join("、") ?? "",
      });

      row.alignment = { vertical: "top", wrapText: true };

      // 重要度に応じた背景色
      const fill = IMPORTANCE_FILLS[article.importance];
      if (fill) {
        row.eachCell((cell) => {
          cell.fill = fill;
        });
      }
    }

    // オートフィルタ
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sorted.length + 1, column: COLUMNS.length },
    };

    // バッファに出力
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return {
      content: new Uint8Array(buffer as ArrayBuffer),
      filename: `${options.condoName}_規約改定案_${timestamp}.xlsx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      articleCount: filtered.length,
    };
  }
}
