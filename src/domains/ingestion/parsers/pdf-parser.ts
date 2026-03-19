/**
 * PDF パーサー
 *
 * pdf-parse (v2) を使って PDF からテキストを抽出し、
 * TextParser と同じ構造化パイプラインに渡す。
 */

import { PDFParse } from "pdf-parse";
import type { ArticleParser, ParseResult } from "@/domains/ingestion/types";
import { TextParser } from "./text-parser";

export class PdfParser implements ArticleParser {
  private textParser = new TextParser();

  async parse(content: string): Promise<ParseResult> {
    // content は base64 エンコードされた PDF バイナリ
    const buffer = Buffer.from(content, "base64");
    return this.parseBuffer(buffer);
  }

  /** Buffer から直接パースする（API ルートから呼ばれる） */
  async parseBuffer(buffer: Buffer): Promise<ParseResult> {
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const textResult = await pdf.getText();
      const text = textResult.text;

      if (!text.trim()) {
        return {
          articles: [],
          metadata: {
            totalArticles: 0,
            totalChapters: 0,
            chapterNames: [],
            parsedAt: new Date().toISOString(),
            sourceFormat: "pdf",
            warnings: [
              "PDFからテキストを抽出できませんでした。スキャン画像のみのPDFの場合、テキストを直接貼り付けてください。",
            ],
          },
        };
      }

      const result = await this.textParser.parse(text);
      return {
        ...result,
        metadata: {
          ...result.metadata,
          sourceFormat: "pdf",
        },
      };
    } finally {
      await pdf.destroy().catch(() => {});
    }
  }
}
