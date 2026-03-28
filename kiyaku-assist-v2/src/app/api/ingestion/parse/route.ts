/**
 * 管理規約テキストパース API
 *
 * POST /api/ingestion/parse
 * テキスト形式の管理規約を受け取り、構造化データ（ParseResult）に変換して返す。
 * テキストパース → 正規化の順で処理する。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { normalizeParseResult } from "@/domains/ingestion/normalizer";
import { TextParser } from "@/domains/ingestion/parsers";
import { logger } from "@/shared/observability/logger";

/** リクエストボディのバリデーションスキーマ */
const parseRequestSchema = z.object({
  text: z.string().min(1, "テキストは空にできません"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = parseRequestSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "パースリクエストのバリデーション失敗",
      );
      return NextResponse.json(
        { error: "バリデーションエラー: " + parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const { text } = parsed.data;

    // TextParser でパース → 正規化
    const parser = new TextParser();
    const rawResult = await parser.parse(text);
    const result = normalizeParseResult(rawResult);

    logger.info(
      { articleCount: result.articles.length },
      "管理規約テキストのパース完了",
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, "パース処理中にエラーが発生");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "サーバー内部エラー" },
      { status: 500 },
    );
  }
}
