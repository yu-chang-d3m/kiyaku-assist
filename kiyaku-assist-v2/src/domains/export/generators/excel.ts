/**
 * Excel (xlsx) ジェネレーター — レビュー台帳仕様
 *
 * PRD v1.0 §3.3 F6 のレビュー台帳列定義に準拠。
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
  getImportanceLabel,
  getAiRecommendationLabel,
} from "@/domains/export/presentation";

/** PRD v1.0 レビュー台帳カラム定義 */
const COLUMNS = [
  { header: "条文番号", key: "articleNum", width: 12 },
  { header: "章名", key: "chapterTitle", width: 16 },
  { header: "重要度", key: "importance", width: 10 },
  { header: "課題グループ", key: "issueGroup", width: 18 },
  { header: "現行条文", key: "original", width: 50 },
  { header: "AI改正案", key: "draft", width: 50 },
  { header: "変更理由", key: "detailedBackground", width: 40 },
  { header: "未変更リスク", key: "riskIfUnchanged", width: 30 },
  { header: "AI推奨判断", key: "aiRecommendation", width: 14 },
  { header: "レビュー担当", key: "reviewAssignee", width: 14 },
  { header: "コメント", key: "comment", width: 30 },
  { header: "会議結論", key: "meetingConclusion", width: 30 },
  { header: "対応状況", key: "actionStatus", width: 14 },
  { header: "最終確定", key: "isFinalized", width: 10 },
] as const;

/** 重要度に応じたセル背景色 */
const IMPORTANCE_FILLS: Record<string, { type: "pattern"; pattern: "solid"; fgColor: { argb: string } }> = {
  mandatory: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4EC" } },
  recommended: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3E0" } },
  optional: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } },
};

/** 重要度の数値優先度（小さいほど上） */
const IMPORTANCE_ORDER: Record<string, number> = {
  mandatory: 0,
  recommended: 1,
  optional: 2,
};

/**
 * レビュー台帳用ソート: issueGroup → importance → chapter → articleNum
 *
 * 課題グループ単位でまとめて閲覧できるようにし、
 * 同一グループ内では法的必須の条文を先頭に配置する。
 */
function sortForReviewLedger(articles: ExportArticle[]): ExportArticle[] {
  return [...articles].sort((a, b) => {
    // 1. issueGroup（アルファベット順、undefined は後ろ）
    const igA = a.issueGroup ?? "\uffff";
    const igB = b.issueGroup ?? "\uffff";
    if (igA !== igB) return igA.localeCompare(igB, "ja");

    // 2. importance
    const impA = IMPORTANCE_ORDER[a.importance] ?? 99;
    const impB = IMPORTANCE_ORDER[b.importance] ?? 99;
    if (impA !== impB) return impA - impB;

    // 3. chapter → articleNum
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.articleNum.localeCompare(b.articleNum, "ja", { numeric: true });
  });
}

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

    // レビュー台帳はデフォルトで issueGroup → importance → chapter 順
    // 明示的に chapter 順が指定された場合はそちらを優先
    const sorted =
      options.sortOrder === "chapter"
        ? [...filtered].sort((a, b) => {
            if (a.chapter !== b.chapter) return a.chapter - b.chapter;
            return a.articleNum.localeCompare(b.articleNum, "ja", { numeric: true });
          })
        : sortForReviewLedger(filtered);

    // メインシート
    const ws = workbook.addWorksheet("レビュー台帳", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // カラム設定
    ws.columns = COLUMNS.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    // ヘッダー行のスタイル（青背景・白文字・太字）
    const headerRow = ws.getRow(1);
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
        articleNum: article.articleNum,
        chapterTitle: article.chapterTitle,
        importance: getImportanceLabel(article.importance),
        issueGroup: article.issueGroup ?? "",
        original: article.original ?? "（新規追加）",
        draft: article.draft,
        detailedBackground: article.detailedBackground ?? article.explanation ?? "",
        riskIfUnchanged: article.riskIfUnchanged ?? "",
        aiRecommendation: getAiRecommendationLabel(article.aiRecommendation),
        // 空欄列（理事会で記入）
        reviewAssignee: "",
        comment: "",
        meetingConclusion: "",
        actionStatus: "",
        isFinalized: "",
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

    // 重要度の凡例シート
    const legendWs = workbook.addWorksheet("凡例");
    legendWs.columns = [
      { header: "重要度", key: "importance", width: 14 },
      { header: "背景色", key: "color", width: 14 },
      { header: "説明", key: "description", width: 40 },
    ];
    const legendHeader = legendWs.getRow(1);
    legendHeader.font = { bold: true };

    const legendData = [
      { importance: "法的必須", color: "薄赤", description: "改正法に対応するために必須の変更" },
      { importance: "推奨", color: "薄橙", description: "標準管理規約に準拠するために推奨される変更" },
      { importance: "任意", color: "薄緑", description: "マンション独自の判断で導入可能な変更" },
    ];
    for (const d of legendData) {
      legendWs.addRow(d);
    }

    // バッファに出力
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return {
      content: new Uint8Array(buffer as ArrayBuffer),
      filename: `${options.condoName}_レビュー台帳_${timestamp}.xlsx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      articleCount: filtered.length,
    };
  }
}
