/**
 * PDF パーサー
 *
 * pdf-parse (v2) を使って PDF からテキストを抽出し、
 * 前処理（ページマーカー除去・タイトル行マージ等）を行ってから
 * TextParser と同じ構造化パイプラインに渡す。
 */

import type { ArticleParser, ParseResult } from "@/domains/ingestion/types";
import { TextParser } from "./text-parser";

// ---------- PDF テキスト前処理 ----------

/** pdf-parse が挿入するページ区切りマーカー（例: "-- 1 of 108 --"） */
const PAGE_MARKER_PATTERN = /^--\s*\d+\s+of\s+\d+\s*--$/;

/** ページ番号行（例: "- 1 -"、"— 3 —"、"1"（行全体が数字のみ）） */
const PAGE_NUMBER_PATTERN = /^[-—－]\s*\d+\s*[-—－]$|^\d{1,3}$/;

/** 目次ページの点線パターン（例: "‥‥‥"、"…"） */
const TOC_LINE_PATTERN = /‥|\.{3,}/;

/** ページラベル（例: "目次1"、"目次2"） */
const TOC_LABEL_PATTERN = /^目次\d*$/;

/** タイトル括弧行（例: "（目的）"） — 条文見出しが条番号の前の行にあるケース */
const TITLE_LINE_PATTERN = /^[（(]([^）)]+)[）)]$/;

/** 条番号の行頭パターン */
const ARTICLE_START_PATTERN = /^第[０-９\d\s]+条/;

/**
 * 非 ASCII 文字間のレタースペーシング（PDF レイアウト抽出で挿入される空白）を除去する。
 *
 * pdf-parse v2 は文字間に空白やタブを挿入する（例: "本 規 約 は 、○ ○ マ ン シ ョ ン"）。
 * lookbehind/lookahead で隣接する非 ASCII 文字間の空白だけを除去し、
 * 半角英数字（ASCII）間の空白は保持する。
 */
function collapseLetterSpacing(line: string): string {
  // 非 ASCII 文字間の空白を除去（CJK、全角、記号すべてカバー）
  return line.replace(/(?<=[^\x00-\x7F])[\s\t]+(?=[^\x00-\x7F])/g, "");
}

/**
 * PDF 抽出テキストを前処理して TextParser に適した形式に変換する。
 *
 * 1. ページ区切りマーカー・目次行の除去
 * 2. 繰り返しヘッダー/フッターの除去
 * 3. レタースペーシング除去（CJK 文字間の空白を圧縮）
 * 4. タイトル行 + 条番号行のマージ（「（目的）\n第1条」→「第1条（目的）」）
 */
export function preprocessPdfText(text: string): string {
  const lines = text.split(/\r?\n/);
  const processed: string[] = [];

  // Phase 1: ホワイトスペース正規化 + レタースペーシング除去
  // 先にレタースペーシングを除去することで、ヘッダー検出・タイトル判定が正確になる
  const collapsed = lines.map((line) =>
    collapseLetterSpacing(line.replace(/[\t ]+/g, " ").trim()),
  );

  // Phase 2: ヘッダー検出 — collapsed 後の行で 3回以上出現するものをヘッダー/フッターとして除去
  // タイトル行（括弧付き見出し）と短い行（本文断片）は除外
  const lineCounts = new Map<string, number>();
  for (const line of collapsed) {
    if (
      line &&
      line.length > 8 &&
      line.length < 80 &&
      !TITLE_LINE_PATTERN.test(line)
    ) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
    }
  }
  const repeatHeaders = new Set<string>();
  for (const [line, count] of lineCounts) {
    if (count >= 3) repeatHeaders.add(line);
  }

  // Phase 3: フィルタ + タイトル行マージ
  let pendingTitle: string | null = null;

  for (const line of collapsed) {
    // 空行はスキップ
    if (!line) continue;

    // ページマーカーを除去
    if (PAGE_MARKER_PATTERN.test(line)) continue;

    // ページ番号行を除去
    if (PAGE_NUMBER_PATTERN.test(line)) continue;

    // 目次行を除去（点線パターン）
    if (TOC_LINE_PATTERN.test(line)) continue;

    // 目次ラベルを除去
    if (TOC_LABEL_PATTERN.test(line)) continue;

    // タイトル行の検出（「（目的）」など）— ヘッダー判定より先に行う
    const titleMatch = line.match(TITLE_LINE_PATTERN);
    if (titleMatch) {
      // 次の行が条番号なら結合するため保留
      pendingTitle = titleMatch[1];
      continue;
    }

    // 繰り返しヘッダーを除去（タイトル行でないもののみ）
    if (repeatHeaders.has(line)) continue;

    // 保留中のタイトルがある場合
    if (pendingTitle !== null) {
      if (ARTICLE_START_PATTERN.test(line)) {
        // 条番号行 → タイトルを条番号の後に挿入
        const articleLine = line.replace(
          /^(第[０-９\d]+条(?:の[０-９\d]+)?)\s*/,
          `$1（${pendingTitle}） `,
        );
        processed.push(articleLine.trim());
      } else {
        // 条番号でない行 → タイトル行はそのまま出力（括弧付き本文等）
        processed.push(`（${pendingTitle}）`);
        processed.push(line);
      }
      pendingTitle = null;
      continue;
    }

    processed.push(line);
  }

  // 最後に保留タイトルが残っている場合
  if (pendingTitle !== null) {
    processed.push(`（${pendingTitle}）`);
  }

  return processed.join("\n");
}

// ---------- パーサー実装 ----------

export class PdfParser implements ArticleParser {
  private textParser = new TextParser();

  async parse(content: string): Promise<ParseResult> {
    // content は base64 エンコードされた PDF バイナリ
    const buffer = Buffer.from(content, "base64");
    return this.parseBuffer(buffer);
  }

  /** Buffer から直接パースする（API ルートから呼ばれる） */
  async parseBuffer(buffer: Buffer): Promise<ParseResult> {
    // pdf-parse は pdfjs-dist 経由で DOMMatrix を参照するため、動的インポートで遅延ロードする。
    // Node.js (Cloud Run) 環境には DOMMatrix が存在しないため、static import だとモジュール初期化時にクラッシュする。
    const { PDFParse } = await import("pdf-parse");
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

      // PDF テキストの前処理（ページマーカー除去・タイトル行マージ等）
      const preprocessed = preprocessPdfText(text);

      const result = await this.textParser.parse(preprocessed);
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
