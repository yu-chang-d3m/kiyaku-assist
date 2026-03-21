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

// ---------- タイムアウトラッパー ----------

/** 指定時間でタイムアウトするラッパー */
async function generateDraftWithTimeout(
  request: DraftRequest,
  timeoutMs: number = 120_000,
): Promise<DraftResult> {
  return new Promise<DraftResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`タイムアウト: ${request.articleNum} の生成が ${timeoutMs / 1000}秒を超えました`));
    }, timeoutMs);

    generateDraft(request)
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

/** レート制限回避のため、バッチ間に短い待機を入れる */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 重要度別バッチ戦略 ----------

/**
 * 重要度別バッチ戦略でドラフトを生成する
 *
 * smart モード: 重要度に応じて並列数を調整
 *   - mandatory: 2並列
 *   - recommended: 2並列
 *   - optional: 2並列
 *
 * precise モード: 全件を1件ずつ（直列）
 *
 * 各条文は必ず1回の API 呼び出しで処理し、正確性を担保する。
 * バッチ間に500msの待機を入れてレート制限を回避する。
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
    // 精密モード: 1件ずつ直列処理（レート制限回避）
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      completed++;
      try {
        const result = await generateDraftWithTimeout(req);
        allDrafts.push(result);
        onProgress?.(completed, total, req.articleNum, "generation");
      } catch (err) {
        logger.warn({ articleNum: req.articleNum, error: err }, "ドラフト生成失敗、リトライ中");
        // 1回リトライ（2秒待機後）
        await sleep(2000);
        try {
          const retryResult = await generateDraftWithTimeout(req);
          allDrafts.push(retryResult);
          onProgress?.(completed, total, req.articleNum, "retry");
        } catch (retryErr) {
          allFailures.push({
            articleNum: req.articleNum,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          });
          onProgress?.(completed, total, req.articleNum, "retry");
        }
      }
      // バッチ間の待機（レート制限回避）
      if (i < requests.length - 1) await sleep(500);
    }
  } else {
    // smart モード: 2並列、重要度の高い順にソート
    const sorted = [...requests].sort((a, b) => {
      const order: Record<string, number> = { mandatory: 0, recommended: 1, optional: 2 };
      return (order[a.importance] ?? 2) - (order[b.importance] ?? 2);
    });

    const concurrency = 2;

    for (let i = 0; i < sorted.length; i += concurrency) {
      const batch = sorted.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((req) => generateDraftWithTimeout(req)),
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

      // バッチ間の待機（レート制限回避）
      if (i + concurrency < sorted.length) await sleep(800);
    }

    // 失敗した条文を1件ずつリトライ（最大1回、3秒間隔）
    if (allFailures.length > 0) {
      logger.info(
        { failureCount: allFailures.length },
        "失敗条文のリトライを開始",
      );

      const retryTargets = [...allFailures];
      allFailures.length = 0;

      for (const failure of retryTargets) {
        const originalReq = requests.find(
          (r) => r.articleNum === failure.articleNum,
        );
        if (!originalReq) {
          allFailures.push(failure);
          continue;
        }

        await sleep(3000); // レート制限回避のため3秒待機

        try {
          const retryResult = await generateDraftWithTimeout(originalReq);
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
