/**
 * エクスポート API
 *
 * POST /api/export
 * レビュー結果を Markdown または CSV 形式でエクスポートする。
 * Firestore からレビュー記事を取得し、フィルタを適用後、
 * 指定形式のファイルとしてダウンロード可能なレスポンスを返す。
 * 認証必須（プロジェクト所有者のみ）。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { getReviewArticles } from "@/shared/db/server-actions";
import {
  MarkdownGenerator,
  CsvGenerator,
  ExcelGenerator,
  PdfGenerator,
  WordGenerator,
} from "@/domains/export/generators";
import type { ExportGenerator, ExportOptions } from "@/domains/export/types";
import type { EnhancedExportOptions } from "@/domains/export/export-types";
import { logger } from "@/shared/observability/logger";
import { toExportArticle } from "@/domains/export/presentation";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

/** リクエストボディのバリデーションスキーマ */
const exportRequestSchema = z.object({
  projectId: z.string().min(1, "プロジェクトIDは必須です"),
  condoName: z.string().min(1, "マンション名は必須です"),
  format: z.enum(["markdown", "csv", "excel", "pdf", "word"]),
  filter: z
    .object({
      decisions: z
        .array(z.enum(["adopted", "modified", "keep-current", "adopt-management", "pending"]).nullable())
        .optional(),
      importances: z
        .array(z.enum(["mandatory", "recommended", "optional"]))
        .optional(),
      chapters: z.array(z.number().int()).optional(),
    })
    .optional(),
  includeTimestamp: z.boolean(),
  // ソート順（デフォルト: priority — 優先度→意味グループ順）
  sortOrder: z.enum(["priority", "chapter"]).optional(),
  // Word エクスポート用の拡張オプション
  includeCoverPage: z.boolean().optional(),
  includeSummaryTable: z.boolean().optional(),
  location: z.string().optional(),
  managementCompany: z.string().optional(),
});

const generators: Record<ExportOptions["format"], ExportGenerator> = {
  markdown: new MarkdownGenerator(),
  csv: new CsvGenerator(),
  excel: new ExcelGenerator(),
  pdf: new PdfGenerator(),
  word: new WordGenerator() as unknown as ExportGenerator,
};

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    // リクエストボディの取得
    const body = await request.json();

    // Zod バリデーション
    const parsed = exportRequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "エクスポートリクエストのバリデーション失敗",
      );
      return NextResponse.json(
        {
          error:
            "バリデーションエラー: " +
            parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    }

    const {
      projectId, condoName, format, filter, includeTimestamp, sortOrder,
      includeCoverPage, includeSummaryTable, location, managementCompany,
    } = parsed.data;

    // プロジェクト所有者チェック
    const ownerCheck = await verifyProjectOwner(projectId, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    logger.info({ projectId, format }, "エクスポート処理を開始");

    // Firestore からレビュー記事を取得
    const reviewArticles = await getReviewArticles(projectId);

    if (reviewArticles.length === 0) {
      return NextResponse.json(
        { error: "エクスポート対象のレビュー記事がありません" },
        { status: 404 },
      );
    }

    // ReviewArticle[] を ExportArticle[] に変換
    const exportArticles = reviewArticles.map(toExportArticle);

    // エクスポートオプションの構築
    const options: ExportOptions = {
      condoName,
      format,
      filter,
      includeTimestamp,
      sortOrder,
    };

    // ジェネレーターを選択して実行
    let result;
    if (format === "word") {
      const wordGen = new WordGenerator();
      const enhancedOpts: EnhancedExportOptions = {
        ...options,
        includeCoverPage: includeCoverPage ?? true,
        includeSummaryTable: includeSummaryTable ?? true,
        location,
        managementCompany,
      };
      result = await wordGen.generate(exportArticles, enhancedOpts);
    } else {
      const generator = generators[format];
      result = await generator.generate(exportArticles, options);
    }

    logger.info(
      { projectId, format, articleCount: result.articleCount },
      "エクスポート処理が完了",
    );

    // ファイルダウンロード用のレスポンスを返す
    const responseBody =
      typeof result.content === "string"
        ? result.content
        : Buffer.from(result.content);

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    logger.error({ error }, "エクスポート処理中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
