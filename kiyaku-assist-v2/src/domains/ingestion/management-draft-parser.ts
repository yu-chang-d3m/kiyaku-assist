/**
 * 管理会社案パーサー
 *
 * 管理会社（日本ハウジング等）が提出した規約改正案をパースし、
 * 既存の ReviewArticle と条文番号でマッチングする。
 *
 * 内部で既存の TextParser を再利用し、LLM は使わずに
 * 条文番号の正規化マッチングで対応付けを行う。
 */

import { TextParser } from "@/domains/ingestion/parsers";
import type { ParseResult } from "@/domains/ingestion/types";
import type {
  ManagementDraftArticle,
  ManagementDraftResult,
  ManagementDraftProgressCallback,
} from "@/domains/ingestion/management-draft-types";
import { toManagementDraftArticle } from "@/domains/ingestion/management-draft-types";
import { createChildLogger } from "@/shared/observability/logger";

const logger = createChildLogger({ module: "management-draft-parser" });

/**
 * 条文番号を正規化（全角→半角、「の」を統一）
 */
function normalizeArticleNum(num: string): string {
  return num
    .replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    )
    .replace(/\s+/g, "")
    .trim();
}

/**
 * テキストをパースして ManagementDraftArticle[] を生成
 */
export async function parseManagementDraft(
  text: string,
  sourceFileName: string,
  existingArticleNums: string[],
  onProgress?: ManagementDraftProgressCallback,
): Promise<ManagementDraftResult> {
  const warnings: string[] = [];

  // Phase 1: テキストパース
  onProgress?.({
    phase: "parse",
    current: 0,
    total: 1,
    message: "管理会社案をパース中…",
  });

  const parser = new TextParser();
  let parseResult: ParseResult;
  try {
    parseResult = await parser.parse(text);
  } catch (err) {
    logger.error({ err }, "管理会社案のパースに失敗");
    throw new Error(
      `管理会社案のパースに失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`,
    );
  }

  onProgress?.({
    phase: "parse",
    current: 1,
    total: 1,
    message: `${parseResult.articles.length} 条文を抽出`,
  });

  // Phase 2: 条文番号マッチング
  const draftArticles: ManagementDraftArticle[] = parseResult.articles.map(
    (a) => toManagementDraftArticle(a),
  );

  // 正規化された既存条文番号マップ
  const normalizedExisting = new Map<string, string>();
  for (const num of existingArticleNums) {
    normalizedExisting.set(normalizeArticleNum(num), num);
  }

  let matched = 0;
  for (let i = 0; i < draftArticles.length; i++) {
    onProgress?.({
      phase: "match",
      current: i + 1,
      total: draftArticles.length,
      message: `条文マッチング: ${draftArticles[i].articleNum}`,
    });

    const normalized = normalizeArticleNum(draftArticles[i].articleNum);
    const existingNum = normalizedExisting.get(normalized);

    if (existingNum) {
      draftArticles[i].matchedArticleNum = existingNum;
      draftArticles[i].matchConfidence = 1.0;
      matched++;
    } else {
      // 部分一致を試行（"第3条の2" → "第3条" のような）
      const baseMatch = normalized.match(/^(第\d+条)/);
      if (baseMatch) {
        const baseNum = baseMatch[1];
        for (const [normKey, origKey] of normalizedExisting) {
          if (normKey.startsWith(baseNum)) {
            draftArticles[i].matchedArticleNum = origKey;
            draftArticles[i].matchConfidence = 0.7;
            matched++;
            warnings.push(
              `${draftArticles[i].articleNum} → ${origKey} に部分マッチ（信頼度 0.7）`,
            );
            break;
          }
        }
      }
    }
  }

  logger.info(
    { total: draftArticles.length, matched },
    "管理会社案マッチング完了",
  );

  return {
    articles: draftArticles,
    metadata: {
      sourceFileName,
      totalArticles: draftArticles.length,
      matchedArticles: matched,
      parsedAt: new Date().toISOString(),
      warnings: [...parseResult.metadata.warnings, ...warnings],
    },
  };
}

/**
 * バッファからパース（Word/PDF のバイナリ対応）
 */
export async function parseManagementDraftFromBuffer(
  buffer: Buffer,
  sourceFileName: string,
  existingArticleNums: string[],
  onProgress?: ManagementDraftProgressCallback,
): Promise<ManagementDraftResult> {
  // Word ファイルの場合は DocxParser を使用
  if (
    sourceFileName.endsWith(".docx") ||
    sourceFileName.endsWith(".doc")
  ) {
    const { DocxParser } = await import("@/domains/ingestion/parsers");
    const docxParser = new DocxParser();
    const parseResult = await docxParser.parseBuffer(buffer);

    // マッチング（同じロジックを再利用）
    return parseManagementDraft(
      // DocxParser の結果をテキストとして再パースするのではなく、
      // 直接 parseResult を使う
      parseResult.articles
        .map(
          (a) =>
            `${a.chapterTitle ? `第${a.chapter}章 ${a.chapterTitle}\n` : ""}${a.articleNum}${a.title ? `（${a.title}）` : ""}\n${a.body}`,
        )
        .join("\n\n"),
      sourceFileName,
      existingArticleNums,
      onProgress,
    );
  }

  // PDF の場合
  if (sourceFileName.endsWith(".pdf")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import("pdf-parse") as any;
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    const result = await pdfParse(buffer) as { text: string };
    return parseManagementDraft(
      result.text,
      sourceFileName,
      existingArticleNums,
      onProgress,
    );
  }

  // テキストとして扱う
  return parseManagementDraft(
    buffer.toString("utf-8"),
    sourceFileName,
    existingArticleNums,
    onProgress,
  );
}
