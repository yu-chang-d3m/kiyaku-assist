/**
 * Word (.docx) パーサー
 *
 * mammoth を使って .docx からテキストを抽出し、
 * TextParser と同じ構造化パイプラインに渡す。
 */

import mammoth from "mammoth";
import type { ArticleParser, ParseResult } from "@/domains/ingestion/types";
import { TextParser } from "./text-parser";

export class DocxParser implements ArticleParser {
  private textParser = new TextParser();

  async parse(content: string): Promise<ParseResult> {
    // content は base64 エンコードされた docx バイナリ
    const buffer = Buffer.from(content, "base64");
    return this.parseBuffer(buffer);
  }

  /** Buffer から直接パースする（API ルートから呼ばれる） */
  async parseBuffer(buffer: Buffer): Promise<ParseResult> {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    if (!text.trim()) {
      return {
        articles: [],
        metadata: {
          totalArticles: 0,
          totalChapters: 0,
          chapterNames: [],
          parsedAt: new Date().toISOString(),
          sourceFormat: "text",
          warnings: [
            "Wordファイルからテキストを抽出できませんでした。ファイルが破損していないか確認してください。",
          ],
        },
      };
    }

    // mammoth の警告を収集
    const mammothWarnings = result.messages
      .filter((m) => m.type === "warning")
      .map((m) => `Word変換警告: ${m.message}`);

    const parseResult = await this.textParser.parse(text);

    return {
      ...parseResult,
      metadata: {
        ...parseResult.metadata,
        warnings: [...parseResult.metadata.warnings, ...mammothWarnings],
      },
    };
  }
}
