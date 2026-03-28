/**
 * パーサー re-export
 *
 * PdfParser は barrel から除外（pdf-parse → pdfjs-dist → DOMMatrix 依存により、
 * static import すると Node.js 環境でモジュール初期化クラッシュを起こすため）。
 * PdfParser を使う場合は動的インポートで直接 "./pdf-parser" から取得すること。
 */
export { TextParser } from "./text-parser";
export { DocxParser } from "./docx-parser";
