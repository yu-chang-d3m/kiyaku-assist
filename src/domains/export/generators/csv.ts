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
] as const;

// ---------- ラベルマッピング ----------

const IMPORTANCE_LABELS: Record<string, string> = {
  mandatory: "必須",
  recommended: "推奨",
  optional: "任意",
};

const DECISION_LABELS: Record<string, string> = {
  adopted: "採用",
  modified: "修正採用",
  pending: "保留",
};

// ---------- ジェネレーター ----------

export class CsvGenerator implements ExportGenerator {
  generate(articles: ExportArticle[], options: ExportOptions): ExportResult {
    const filtered = this.applyFilter(articles, options);
    const content = this.buildCsv(filtered);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return {
      content,
      filename: `${options.condoName}_規約改定案_${timestamp}.csv`,
      mimeType: "text/csv; charset=utf-8",
      articleCount: filtered.length,
    };
  }

  /** フィルタを適用 */
  private applyFilter(
    articles: ExportArticle[],
    options: ExportOptions,
  ): ExportArticle[] {
    if (!options.filter) return articles;
    const { filter } = options;

    return articles.filter((a) => {
      if (filter.decisions && !filter.decisions.includes(a.decision)) {
        return false;
      }
      if (filter.importances && !filter.importances.includes(a.importance)) {
        return false;
      }
      if (filter.chapters && !filter.chapters.includes(a.chapter)) {
        return false;
      }
      return true;
    });
  }

  /** CSV テキストを構築（BOM 付き） */
  private buildCsv(articles: ExportArticle[]): string {
    const rows: string[] = [];

    // BOM + ヘッダー
    rows.push(UTF8_BOM + CSV_HEADERS.join(","));

    // データ行
    for (const article of articles) {
      const importance = IMPORTANCE_LABELS[article.importance] ?? article.importance;
      const decision = article.decision
        ? DECISION_LABELS[article.decision] ?? article.decision
        : "未決定";

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
