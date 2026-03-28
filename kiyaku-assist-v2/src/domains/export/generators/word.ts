/**
 * Word (docx) ジェネレーター
 *
 * docx npm パッケージを使用して Word ファイルを生成する。
 * 表紙・サマリー・新旧対照表を含む高品質な文書出力。
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import type { ExportArticle, ExportResult } from "@/domains/export/types";
import type { EnhancedExportOptions } from "@/domains/export/export-types";
import {
  applyExportFilter,
  getDecisionLabel,
  getImportanceLabel,
  groupExportArticlesByChapter,
} from "@/domains/export/presentation";

export class WordGenerator {
  async generate(
    articles: ExportArticle[],
    options: EnhancedExportOptions,
  ): Promise<ExportResult> {
    const filtered = applyExportFilter(articles, options.filter);
    const doc = this.buildDocument(filtered, options);
    const buffer = await Packer.toBuffer(doc);
    const timestamp = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

    return {
      content: new Uint8Array(buffer),
      filename: `${options.condoName}_規約改定案_${timestamp}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      articleCount: filtered.length,
    };
  }

  private buildDocument(
    articles: ExportArticle[],
    options: EnhancedExportOptions,
  ): Document {
    const sections: Paragraph[] = [];

    // 表紙
    if (options.includeCoverPage) {
      sections.push(...this.buildCoverPage(articles, options));
    }

    // サマリーテーブル
    if (options.includeSummaryTable) {
      sections.push(...this.buildSummary(articles));
    }

    // 新旧対照表
    const chapters = groupExportArticlesByChapter(articles);
    for (const chapter of chapters) {
      sections.push(
        new Paragraph({
          text: `第${chapter.chapter}章 ${chapter.chapterTitle}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        }),
      );

      for (const article of chapter.articles) {
        sections.push(...this.buildArticleSection(article));
      }
    }

    // フッター
    sections.push(
      new Paragraph({
        spacing: { before: 600 },
        children: [
          new TextRun({
            text: "※ 本資料は規約リノベにより自動生成されたものです。法的助言ではありません。",
            size: 18,
            color: "888888",
          }),
        ],
      }),
    );

    return new Document({
      sections: [
        {
          children: sections,
        },
      ],
    });
  }

  private buildCoverPage(
    articles: ExportArticle[],
    options: EnhancedExportOptions,
  ): Paragraph[] {
    const decided = articles.filter(
      (a) => a.decision && a.decision !== "pending",
    ).length;

    const paragraphs: Paragraph[] = [
      new Paragraph({
        spacing: { before: 2400 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: options.condoName,
            bold: true,
            size: 48,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [
          new TextRun({
            text: "管理規約改定案",
            size: 36,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 800 },
        children: [
          new TextRun({
            text: `作成日: ${new Date().toLocaleDateString("ja-JP")}`,
            size: 24,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: `対象条文: ${articles.length}条 / 判断済: ${decided}条`,
            size: 24,
          }),
        ],
      }),
    ];

    if (options.location) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [
            new TextRun({ text: `所在地: ${options.location}`, size: 22 }),
          ],
        }),
      );
    }
    if (options.managementCompany) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [
            new TextRun({
              text: `管理会社: ${options.managementCompany}`,
              size: 22,
            }),
          ],
        }),
      );
    }

    // ページ区切り
    paragraphs.push(
      new Paragraph({
        spacing: { before: 600 },
        children: [],
      }),
    );

    return paragraphs;
  }

  private buildSummary(articles: ExportArticle[]): Paragraph[] {
    const mandatory = articles.filter(
      (a) => a.importance === "mandatory",
    ).length;
    const recommended = articles.filter(
      (a) => a.importance === "recommended",
    ).length;
    const optional = articles.filter(
      (a) => a.importance === "optional",
    ).length;
    const decided = articles.filter(
      (a) => a.decision && a.decision !== "pending",
    ).length;

    return [
      new Paragraph({
        text: "改正概要",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `対象条文: ${articles.length}条（法的必須: ${mandatory}, 推奨: ${recommended}, 任意: ${optional}）`,
            size: 22,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: `判断状況: ${decided}/${articles.length}条 完了`,
            size: 22,
          }),
        ],
      }),
    ];
  }

  private buildArticleSection(article: ExportArticle): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // 条文ヘッダー
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 300, after: 100 },
        children: [
          new TextRun({
            text: `${article.articleNum}`,
            bold: true,
          }),
          new TextRun({
            text: `  [${getImportanceLabel(article.importance)}] [${getDecisionLabel(article.decision)}]`,
            size: 20,
            color: "666666",
          }),
        ],
      }),
    );

    // 要約
    paragraphs.push(
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: "要約: ", bold: true, size: 20 }),
          new TextRun({ text: article.summary, size: 20 }),
        ],
      }),
    );

    // 新旧対照
    if (article.original) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 100 },
          children: [
            new TextRun({ text: "【現行】", bold: true, size: 20, color: "CC0000" }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: article.original, size: 20 }),
          ],
        }),
      );
    }
    paragraphs.push(
      new Paragraph({
        spacing: { before: 100 },
        children: [
          new TextRun({ text: "【改定案】", bold: true, size: 20, color: "0000CC" }),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: article.draft || "（未生成）", size: 20 }),
        ],
      }),
    );

    return paragraphs;
  }
}
