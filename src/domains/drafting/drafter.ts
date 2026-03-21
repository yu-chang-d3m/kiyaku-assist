/**
 * Drafter — Claude API で条文ドラフトを生成する
 *
 * ギャップ分析結果とマンション属性をもとに、
 * 改定条文のドラフトを tool_use で構造化出力として生成する。
 */

import { callWithStructuredOutput, MODELS } from "@/shared/ai/claude";
import { getCachedResponse, setCachedResponse, generateCacheKey } from "@/shared/ai/cache";
import { logger } from "@/shared/observability/logger";
import type {
  DraftRequest,
  DraftResult,
  BatchDraftResult,
  DraftFailure,
  DraftGenerationMode,
  DraftProgressCallback,
} from "@/domains/drafting/types";

// ---------- tool_use スキーマ ----------

/** ドラフト生成の構造化出力スキーマ */
const DRAFT_TOOL = {
  name: "output_draft" as const,
  description: "改定条文ドラフトと解説を構造化して出力する",
  input_schema: {
    type: "object" as const,
    properties: {
      draft: {
        type: "string" as const,
        description: "改定条文の全文（項・号を含む正式な条文形式）",
      },
      summary: {
        type: "string" as const,
        description: "改定内容の要約（100文字以内、組合員向け）",
      },
      explanation: {
        type: "string" as const,
        description: "改定理由・解説（組合員が理解できる平易な表現）",
      },
      baseRef: {
        type: "string" as const,
        description: "準拠する標準管理規約等の参照先（例: 標準管理規約 第12条）",
      },
    },
    required: ["draft", "summary", "explanation", "baseRef"],
  },
};

// ---------- 型定義（tool_use 出力） ----------

interface DraftOutput {
  draft: string;
  summary: string;
  explanation: string;
  baseRef: string;
}

// ---------- 単一条文のドラフト生成 ----------

/**
 * 1条文のドラフトを生成する
 */
async function generateDraft(request: DraftRequest): Promise<DraftResult> {
  // キャッシュチェック
  const cacheKey = generateCacheKey(
    "draft",
    request.articleNum,
    request.currentText ?? "",
    request.standardText,
    request.condoContext.condoType,
    request.condoContext.unitCount,
  );

  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    logger.info({ articleNum: request.articleNum }, "キャッシュヒット: ドラフト");
    return cached as DraftResult;
  }

  const condoDesc = buildCondoDescription(request.condoContext);

  const systemPrompt = `あなたはマンション管理規約の専門家です。
以下のマンション属性と分析結果に基づいて、改定条文のドラフトを生成してください。

## マンション属性
${condoDesc}

## ドラフト生成のルール
1. 令和7年改正の標準管理規約（単棟型）に準拠する
2. 改正区分所有法（2025年10月施行）の要件を満たす
3. 条文は正式な規約形式で記述する（第X条、項、号の階層構造）
4. 管理組合が${request.condoContext.condoType === "corporate" ? "法人格を持つ" : "法人格を持たない"}ことを考慮する
5. 解説は組合員（法律の専門家ではない一般の方）が理解できる平易な表現にする
6. 法的助言は行わない（弁護士法72条に留意）`;

  const userPrompt = request.currentText
    ? `## ギャップ分析結果
条番号: ${request.articleNum}（${request.category}）
ギャップ概要: ${request.gapSummary}
重要度: ${request.importance}

## 現行規約
${request.currentText}

## 標準管理規約の対応条文
${request.standardText}

上記に基づいて改定条文ドラフトを生成してください。`
    : `## ギャップ分析結果
条番号: ${request.articleNum}（${request.category}）
ギャップ概要: ${request.gapSummary}
重要度: ${request.importance}
※ 現行規約にこの条文は存在しません（新規追加）

## 標準管理規約の対応条文
${request.standardText}

上記に基づいて新規条文のドラフトを生成してください。`;

  const result = await callWithStructuredOutput<DraftOutput>({
    model: MODELS.ANALYSIS,
    system: systemPrompt,
    userMessage: userPrompt,
    tool: DRAFT_TOOL,
  });

  const draftResult: DraftResult = {
    articleNum: request.articleNum,
    draft: result.draft,
    summary: result.summary,
    explanation: result.explanation,
    importance: request.importance,
    baseRef: result.baseRef,
    category: request.category,
  };

  // キャッシュ保存
  await setCachedResponse(cacheKey, draftResult, 30);

  return draftResult;
}

// ---------- マンション属性の説明テキスト ----------

function buildCondoDescription(context: DraftRequest["condoContext"]): string {
  const typeLabel = {
    corporate: "管理組合法人",
    "non-corporate": "権利能力なき社団（非法人）",
    unknown: "未確認",
  }[context.condoType];

  const sizeLabel = {
    small: "小規模（50戸未満）",
    medium: "中規模（50〜100戸）",
    large: "大規模（100〜200戸）",
    xlarge: "超大規模（200戸以上）",
  }[context.unitCount];

  return `- マンション名: ${context.condoName}\n- 管理組合形態: ${typeLabel}\n- 規模: ${sizeLabel}`;
}

// ---------- 公開 API ----------

/**
 * 複数条文のドラフトを並列生成する
 *
 * @param requests - ドラフト生成リクエスト配列
 * @param concurrency - 並列実行数（デフォルト: 3）
 * @returns バッチドラフト生成結果
 */
export async function batchGenerateDrafts(
  requests: DraftRequest[],
  concurrency: number = 3,
): Promise<BatchDraftResult> {
  logger.info(
    { requestCount: requests.length, concurrency },
    "ドラフト生成を開始",
  );

  const drafts: DraftResult[] = [];
  const failures: DraftFailure[] = [];

  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((req) => generateDraft(req)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        drafts.push(result.value);
      } else {
        const articleNum = batch[j].articleNum;
        logger.error(
          { articleNum, error: result.reason },
          "ドラフト生成に失敗",
        );
        failures.push({
          articleNum,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    }
  }

  logger.info(
    { successCount: drafts.length, failureCount: failures.length },
    "ドラフト生成完了",
  );

  return {
    drafts,
    failures,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 単一条文のドラフトを生成する（公開用ラッパー）
 */
export { generateDraft };

// ---------- 重要度別バッチ戦略 ----------

/**
 * 重要度別バッチ戦略でドラフトを生成する
 *
 * smart モード: 重要度に応じてバッチサイズと並列数を調整
 *   - mandatory: 1件ずつ、3並列
 *   - recommended: 3件バッチ、2並列（※バッチ = 並列実行の単位数）
 *   - optional: 5件バッチ、3並列
 *
 * precise モード: 全件を1件ずつ、2並列
 *
 * 注意: ここでの「バッチ」は Claude API のバッチ呼び出しではなく、
 * 並列実行する単位数を意味する。各条文は必ず1回の API 呼び出しで処理し、
 * 正確性を担保する。
 */
export async function generateDraftsWithStrategy(
  requests: DraftRequest[],
  mode: DraftGenerationMode,
  onProgress?: DraftProgressCallback,
): Promise<BatchDraftResult> {
  const allDrafts: DraftResult[] = [];
  const allFailures: DraftFailure[] = [];
  let completed = 0;
  const total = requests.length;

  if (mode === "precise") {
    // 精密モード: 全件を1件ずつ、2並列
    const concurrency = 2;
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((req) => generateDraft(req)),
      );

      for (let j = 0; j < results.length; j++) {
        completed++;
        const result = results[j];
        if (result.status === "fulfilled") {
          allDrafts.push(result.value);
          onProgress?.(completed, total, batch[j].articleNum, "generation");
        } else {
          // 精密モードでも失敗時は1回リトライ
          try {
            const retryResult = await generateDraft(batch[j]);
            allDrafts.push(retryResult);
            onProgress?.(completed, total, batch[j].articleNum, "retry");
          } catch {
            allFailures.push({
              articleNum: batch[j].articleNum,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
            onProgress?.(completed, total, batch[j].articleNum, "retry");
          }
        }
      }
    }
  } else {
    // smart モード: 重要度別に並列数を変える
    const groups = {
      mandatory: requests.filter((r) => r.importance === "mandatory"),
      recommended: requests.filter((r) => r.importance === "recommended"),
      optional: requests.filter((r) => r.importance === "optional"),
    };

    const concurrencyMap = { mandatory: 3, recommended: 2, optional: 3 };

    // 重要度の高い順に処理（mandatory → recommended → optional）
    for (const [importance, group] of Object.entries(groups) as [
      string,
      DraftRequest[],
    ][]) {
      if (group.length === 0) continue;

      const concurrency =
        concurrencyMap[importance as keyof typeof concurrencyMap] ?? 3;

      logger.info(
        { importance, count: group.length, concurrency },
        "重要度グループのドラフト生成を開始",
      );

      for (let i = 0; i < group.length; i += concurrency) {
        const batch = group.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map((req) => generateDraft(req)),
        );

        for (let j = 0; j < results.length; j++) {
          completed++;
          const result = results[j];
          if (result.status === "fulfilled") {
            allDrafts.push(result.value);
            onProgress?.(completed, total, batch[j].articleNum, "generation");
          } else {
            allFailures.push({
              articleNum: batch[j].articleNum,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
            onProgress?.(completed, total, batch[j].articleNum, "generation");
          }
        }
      }
    }

    // 失敗した条文を1件ずつリトライ（最大1回）
    if (allFailures.length > 0) {
      logger.info(
        { failureCount: allFailures.length },
        "失敗条文のリトライを開始",
      );

      const retryTargets = [...allFailures];
      // allFailures をクリアしてリトライ
      allFailures.length = 0;

      for (const failure of retryTargets) {
        const originalReq = requests.find(
          (r) => r.articleNum === failure.articleNum,
        );
        if (!originalReq) {
          allFailures.push(failure);
          continue;
        }

        try {
          const retryResult = await generateDraft(originalReq);
          allDrafts.push(retryResult);
          onProgress?.(completed, total, failure.articleNum, "retry");
          logger.info({ articleNum: failure.articleNum }, "リトライ成功");
        } catch (retryError) {
          allFailures.push({
            articleNum: failure.articleNum,
            error:
              retryError instanceof Error
                ? retryError.message
                : String(retryError),
          });
          logger.error(
            { articleNum: failure.articleNum, error: retryError },
            "リトライも失敗",
          );
        }
      }
    }
  }

  return {
    drafts: allDrafts,
    failures: allFailures,
    generatedAt: new Date().toISOString(),
  };
}
