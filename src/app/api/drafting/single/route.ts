/**
 * 単一条文ドラフト生成 API
 *
 * POST /api/drafting/single
 * 1条文のドラフトを再生成する。特定条文のリトライや再生成に使用する。
 * サーバー側でリトリーバーを呼び出し、標準管理規約テキストを取得してから生成する。
 */

import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { generateDraft } from "@/domains/drafting/drafter";
import { retrieveRelatedStandards } from "@/domains/analysis/retriever";
import { logger } from "@/shared/observability/logger";

// ---------- Zod スキーマ ----------

/** マンション属性スキーマ */
const condoContextSchema = z.object({
  condoName: z.string().min(1, "マンション名は必須です"),
  condoType: z.enum(["corporate", "non-corporate", "unknown"]),
  unitCount: z.enum(["small", "medium", "large", "xlarge"]),
});

/** DraftRequest のバリデーションスキーマ（standardText はサーバー側で取得） */
const draftRequestSchema = z.object({
  articleNum: z.string().min(1, "条番号は必須です"),
  category: z.string().min(1, "カテゴリは必須です"),
  currentText: z.string().nullable(),
  gapSummary: z.string().min(1, "ギャップ概要は必須です"),
  importance: z.enum(["mandatory", "recommended", "optional"]),
  condoContext: condoContextSchema,
});

// ---------- ハンドラ ----------

export async function POST(request: NextRequest) {
  try {
    // リクエストボディの取得とバリデーション
    const body = await request.json();
    const parsed = draftRequestSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.issues },
        "単一ドラフト生成リクエストのバリデーション失敗",
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

    const { articleNum, category, currentText, gapSummary, importance, condoContext } = parsed.data;

    logger.info({ articleNum }, "単一ドラフト生成を開始");

    // リトリーバーで標準管理規約テキストを取得
    const queryText = currentText ?? gapSummary;
    const retrieval = await retrieveRelatedStandards(queryText);
    const standardText = retrieval.results[0]?.content ?? "";
    const standardRef = retrieval.results[0]?.metadata["ref"] ?? "";

    logger.info(
      { articleNum, retrievedDocs: retrieval.results.length, hasStandardText: standardText.length > 0 },
      "標準管理規約テキストを取得",
    );

    // ドラフト生成
    const result = await generateDraft({
      articleNum,
      category,
      currentText,
      standardText,
      gapSummary,
      importance,
      condoContext,
    });

    logger.info({ articleNum: result.articleNum }, "単一ドラフト生成完了");

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, "単一ドラフト生成 API でエラーが発生");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "サーバー内部エラー",
      },
      { status: 500 },
    );
  }
}
