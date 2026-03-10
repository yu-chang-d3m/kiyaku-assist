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

export class MarkdownGenerator implements ExportGenerator {
  generate(articles: ExportArticle[], options: ExportOptions): ExportResult {
    const filtered = this.applyFilter(articles, options);
    const content = this.buildMarkdown(filtered, options);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return {
      content,
      filename: `${options.condoName}_規約改定案_${timestamp}.md`,
      mimeType: "text/markdown; charset=utf-8",
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

    // 章ごとにグループ化
    const chapters = this.groupByChapter(articles);

    for (const [chapterNum, chapterArticles] of chapters) {
      const chapterTitle = chapterArticles[0]?.chapterTitle || `第${chapterNum}章`;
      lines.push(`## 第${chapterNum}章 ${chapterTitle}`);
      lines.push("");

      for (const article of chapterArticles) {
        lines.push(`### ${article.articleNum}`);
        lines.push("");

        // メタ情報
        const importance = IMPORTANCE_LABELS[article.importance] ?? article.importance;
        const decision = article.decision
          ? DECISION_LABELS[article.decision] ?? article.decision
          : "未決定";
        lines.push(`| 項目 | 内容 |`);
        lines.push(`|------|------|`);
        lines.push(`| 重要度 | ${importance} |`);
        lines.push(`| 判定 | ${decision} |`);
        lines.push(`| 準拠 | ${article.baseRef} |`);
        lines.push("");

        // 改定案
        lines.push("**改定案:**");
        lines.push("");
        lines.push(article.draft);
        lines.push("");

        // 現行規約との比較
        if (article.original) {
          lines.push("<details>");
          lines.push("<summary>現行規約（参考）</summary>");
          lines.push("");
          lines.push(article.original);
          lines.push("");
          lines.push("</details>");
          lines.push("");
        }

        // 要約と解説
        lines.push(`**要約:** ${article.summary}`);
        lines.push("");
        lines.push(`**解説:** ${article.explanation}`);
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }

    // フッター
    lines.push("");
    lines.push(
      "※ 本資料はキヤクアシストにより自動生成されたものです。法的助言ではありません。",
    );
    lines.push(
      "※ 最終的な規約案の決定にあたっては、マンション管理士や弁護士等の専門家にご相談ください。",
    );

    return lines.join("\n");
  }

  /** 章番号でグループ化 */
  private groupByChapter(
    articles: ExportArticle[],
  ): Map<number, ExportArticle[]> {
    const map = new Map<number, ExportArticle[]>();
    for (const article of articles) {
      const existing = map.get(article.chapter) ?? [];
      existing.push(article);
      map.set(article.chapter, existing);
    }
    return map;
  }
}
