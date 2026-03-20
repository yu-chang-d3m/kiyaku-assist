/**
 * ファイルアップロード パース API
 *
 * POST /api/ingestion/parse-file
 * multipart/form-data でファイルを受け取り、構造化データ（ParseResult）に変換して返す。
 * 対応形式: PDF (.pdf)、Word (.docx)、テキスト (.txt)
 *
 * 注意: パーサーは動的インポートする。pdf-parse が pdfjs-dist (DOMMatrix) に依存しており、
 * Cloud Run 環境で静的インポートするとモジュール全体がクラッシュするため。
 */

import { NextRequest, NextResponse } from "next/server";
import { normalizeParseResult } from "@/domains/ingestion/normalizer";
import type { ParseResult } from "@/domains/ingestion/types";
import { logger } from "@/shared/observability/logger";

/** 最大ファイルサイズ: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 対応する MIME タイプ */
const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text",
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "ファイルが選択されていません" },
        { status: 400 },
      );
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `ファイルサイズが上限（10MB）を超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）` },
        { status: 400 },
      );
    }

    // MIME タイプまたは拡張子で形式を判定
    let fileType = SUPPORTED_TYPES[file.type];

    // MIME タイプが不明な場合、拡張子で判定
    if (!fileType) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") fileType = "pdf";
      else if (ext === "docx") fileType = "docx";
      else if (ext === "txt") fileType = "text";
    }

    if (!fileType) {
      return NextResponse.json(
        {
          error: `対応していないファイル形式です（${file.type || "不明"}）。PDF、Word (.docx)、テキスト (.txt) のいずれかをアップロードしてください。`,
        },
        { status: 400 },
      );
    }

    logger.info(
      { fileName: file.name, fileType, fileSize: file.size },
      "ファイルアップロード受信",
    );

    const buffer = Buffer.from(await file.arrayBuffer());

    // 動的インポートでパーサーをロード（pdf-parse の DOMMatrix 依存が他に波及しないようにする）
    let rawResult: ParseResult;
    switch (fileType) {
      case "pdf": {
        const { PdfParser } = await import("@/domains/ingestion/parsers/pdf-parser");
        const parser = new PdfParser();
        rawResult = await parser.parseBuffer(buffer);
        break;
      }
      case "docx": {
        const { DocxParser } = await import("@/domains/ingestion/parsers/docx-parser");
        const parser = new DocxParser();
        rawResult = await parser.parseBuffer(buffer);
        break;
      }
      case "text":
      default: {
        const { TextParser } = await import("@/domains/ingestion/parsers/text-parser");
        const parser = new TextParser();
        const text = buffer.toString("utf-8");
        rawResult = await parser.parse(text);
        break;
      }
    }

    const result = normalizeParseResult(rawResult);

    // パース結果が空の場合の警告
    if (result.articles.length === 0 && result.metadata.warnings.length === 0) {
      result.metadata.warnings.push(
        "条文を検出できませんでした。ファイルの内容が管理規約であることを確認してください。",
      );
    }

    logger.info(
      { articleCount: result.articles.length, fileType, fileName: file.name },
      "ファイルアップロードのパース完了",
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, "ファイルパース処理中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
