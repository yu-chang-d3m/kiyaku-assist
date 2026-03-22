/**
 * Analyzer — Claude API でギャップ分析を実行する
 *
 * 現行規約の各条文と標準管理規約を比較し、
 * ギャップの種類・重要度・改正理由を分析する。
 * 条文単位で並列実行し、tool_use で構造化出力を取得する。
 */

import { callWithStructuredOutput, MODELS } from "@/shared/ai/claude";
import { getCachedResponse, setCachedResponse, generateCacheKey } from "@/shared/ai/cache";
import { logger } from "@/shared/observability/logger";
import type {
  GapAnalysisItem,
  GapType,
  AnalysisResult,
  AnalysisSummary,
  RetrievedDocument,
} from "@/domains/analysis/types";

// ---------- tool_use スキーマ ----------

/** ギャップ分析の構造化出力スキーマ（Claude tool_use 用） */
const GAP_ANALYSIS_TOOL = {
  name: "output_gap_analysis" as const,
  description: "現行規約と標準管理規約のギャップ分析結果を構造化して出力する",
  input_schema: {
    type: "object" as const,
    properties: {
      gapType: {
        type: "string" as const,
        enum: ["missing", "outdated", "partial", "compliant", "custom"],
        description: "ギャップの種類",
      },
      importance: {
        type: "string" as const,
        enum: ["mandatory", "recommended", "optional"],
        description: "重要度（mandatory: 法令上必須、recommended: 推奨、optional: 任意）",
      },
      gapSummary: {
        type: "string" as const,
        description: "ギャップの概要（200文字以内）",
      },
      rationale: {
        type: "string" as const,
        description: "改正の理由・背景（組合員に説明できるレベル）",
      },
      relatedLawRefs: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "関連する改正区分所有法の条文番号",
      },
    },
    required: ["gapType", "importance", "gapSummary", "rationale", "relatedLawRefs"],
  },
};

// ---------- 型定義（tool_use 出力） ----------

interface GapAnalysisOutput {
  gapType: GapType;
  importance: "mandatory" | "recommended" | "optional";
  gapSummary: string;
  rationale: string;
  relatedLawRefs: string[];
}

// ---------- 単一条文の分析 ----------

/**
 * 1条文のギャップ分析を実行する
 */
async function analyzeArticle(
  articleNum: string,
  category: string,
  currentText: string | null,
  relatedDocs: RetrievedDocument[],
): Promise<GapAnalysisItem> {
  // キャッシュチェック
  const cacheKey = generateCacheKey(
    "gap_analysis",
    articleNum,
    currentText ?? "",
    relatedDocs.map((d) => d.content).join(""),
  );

  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    logger.info({ articleNum }, "キャッシュヒット: ギャップ分析");
    return cached as GapAnalysisItem;
  }

  // 標準管理規約のテキストを結合
  const standardTexts = relatedDocs
    .map((d) => `【${d.metadata["ref"] ?? "参照"}】\n${d.content}`)
    .join("\n\n");

  const systemPrompt = `あなたはマンション管理規約の専門家です。
現行規約の条文と、令和7年改正の国交省標準管理規約（単棟型）を比較し、
ギャップ分析を行ってください。

分析の観点:
1. 改正区分所有法（2025年10月施行）への適合性
2. 標準管理規約との乖離度
3. 実務上の重要性（mandatory: 法令違反のリスクあり、recommended: 対応推奨、optional: 対応任意）`;

  const userPrompt = currentText
    ? `## 現行規約 ${articleNum}
${currentText}

## 対応する標準管理規約
${standardTexts}

上記を比較してギャップ分析を行ってください。`
    : `## 条文番号: ${articleNum}（カテゴリ: ${category}）
現行規約にこの条文は存在しません。

## 標準管理規約の該当条文
${standardTexts}

この条文を新規追加する必要性についてギャップ分析を行ってください。`;

  const result = await callWithStructuredOutput<GapAnalysisOutput>({
    model: MODELS.ANALYSIS,
    system: systemPrompt,
    userMessage: userPrompt,
    tool: GAP_ANALYSIS_TOOL,
  });

  const item: GapAnalysisItem = {
    articleNum,
    category,
    currentText,
    standardText: relatedDocs[0]?.content ?? "",
    standardRef: relatedDocs[0]?.metadata["ref"] ?? "",
    gapSummary: result.gapSummary,
    gapType: result.gapType,
    importance: result.importance,
    rationale: result.rationale,
    relatedLawRefs: result.relatedLawRefs,
  };

  // キャッシュ保存
  await setCachedResponse(cacheKey, item, 30);

  return item;
}

// ---------- バッチ分析用 tool_use スキーマ ----------

/** 複数条文を一括分析するための構造化出力スキーマ */
const BATCH_GAP_ANALYSIS_TOOL = {
  name: "output_batch_gap_analysis" as const,
  description: "複数条文のギャップ分析結果をまとめて構造化出力する",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            articleNum: {
              type: "string" as const,
              description: "対象の条文番号（入力と同じ値を返す）",
            },
            gapType: {
              type: "string" as const,
              enum: ["missing", "outdated", "partial", "compliant", "custom"],
              description: "ギャップの種類",
            },
            importance: {
              type: "string" as const,
              enum: ["mandatory", "recommended", "optional"],
              description: "重要度（mandatory: 法令上必須、recommended: 推奨、optional: 任意）",
            },
            gapSummary: {
              type: "string" as const,
              description: "ギャップの概要（200文字以内）",
            },
            rationale: {
              type: "string" as const,
              description: "改正の理由・背景（組合員に説明できるレベル）",
            },
            relatedLawRefs: {
              type: "array" as const,
              items: { type: "string" as const },
              description: "関連する改正区分所有法の条文番号",
            },
          },
          required: ["articleNum", "gapType", "importance", "gapSummary", "rationale", "relatedLawRefs"],
        },
        description: "各条文のギャップ分析結果",
      },
    },
    required: ["items"],
  },
};

/** バッチ分析の出力型 */
interface BatchGapAnalysisOutput {
  items: Array<GapAnalysisOutput & { articleNum: string }>;
}

/** バッチサイズ（1回の API 呼び出しで分析する条文数） */
const BATCH_SIZE = 10;

// ---------- バッチ分析 ----------

/**
 * 複数条文をまとめて 1 回の Claude API で分析する
 */
async function analyzeBatchArticles(
  articles: Array<{
    articleNum: string;
    category: string;
    currentText: string | null;
    relatedDocs: RetrievedDocument[];
  }>,
): Promise<GapAnalysisItem[]> {
  // キャッシュチェック: 全条文がキャッシュにある場合はスキップ
  const cachedItems: GapAnalysisItem[] = [];
  const uncachedArticles: typeof articles = [];

  for (const article of articles) {
    const cacheKey = generateCacheKey(
      "gap_analysis",
      article.articleNum,
      article.currentText ?? "",
      article.relatedDocs.map((d) => d.content).join(""),
    );
    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      logger.info({ articleNum: article.articleNum }, "キャッシュヒット: ギャップ分析");
      cachedItems.push(cached as GapAnalysisItem);
    } else {
      uncachedArticles.push(article);
    }
  }

  if (uncachedArticles.length === 0) {
    return cachedItems;
  }

  // バッチプロンプトを構築
  const articleSections = uncachedArticles.map((a) => {
    const standardTexts = a.relatedDocs
      .map((d) => `【${d.metadata["ref"] ?? "参照"}】\n${d.content}`)
      .join("\n\n");

    if (a.currentText) {
      return `### ${a.articleNum}（カテゴリ: ${a.category}）\n**現行規約:**\n${a.currentText}\n\n**対応する標準管理規約:**\n${standardTexts || "（該当なし）"}`;
    }
    return `### ${a.articleNum}（カテゴリ: ${a.category}）\n**現行規約:** なし（新規追加候補）\n\n**標準管理規約:**\n${standardTexts || "（該当なし）"}`;
  }).join("\n\n---\n\n");

  const systemPrompt = `あなたはマンション管理規約の専門家です。
現行規約の条文と、令和7年改正の国交省標準管理規約（単棟型）を比較し、
ギャップ分析を行ってください。

分析の観点:
1. 改正区分所有法（2025年10月施行）への適合性
2. 標準管理規約との乖離度
3. 実務上の重要性（mandatory: 法令違反のリスクあり、recommended: 対応推奨、optional: 対応任意）

以下の${uncachedArticles.length}件の条文をすべて分析し、各条文について結果を出力してください。
articleNum は入力と完全に一致する値を返してください。`;

  const userPrompt = `以下の条文について一括ギャップ分析を行ってください。\n\n${articleSections}`;

  const result = await callWithStructuredOutput<BatchGapAnalysisOutput>({
    model: MODELS.ANALYSIS,
    system: systemPrompt,
    userMessage: userPrompt,
    tool: BATCH_GAP_ANALYSIS_TOOL,
    maxTokens: 8192,
  });

  // 結果をマッピング
  const resultMap = new Map(result.items.map((r) => [r.articleNum, r]));
  const batchItems: GapAnalysisItem[] = [];

  for (const article of uncachedArticles) {
    const analysisOutput = resultMap.get(article.articleNum);
    if (!analysisOutput) {
      logger.warn({ articleNum: article.articleNum }, "バッチ分析で結果が返されなかった条文");
      // フォールバック: 単一条文分析にフォールバック
      try {
        const fallback = await analyzeArticle(
          article.articleNum,
          article.category,
          article.currentText,
          article.relatedDocs,
        );
        batchItems.push(fallback);
      } catch (err) {
        logger.error({ articleNum: article.articleNum, err }, "フォールバック分析にも失敗");
      }
      continue;
    }

    const item: GapAnalysisItem = {
      articleNum: article.articleNum,
      category: article.category,
      currentText: article.currentText,
      standardText: article.relatedDocs[0]?.content ?? "",
      standardRef: article.relatedDocs[0]?.metadata["ref"] ?? "",
      gapSummary: analysisOutput.gapSummary,
      gapType: analysisOutput.gapType,
      importance: analysisOutput.importance,
      rationale: analysisOutput.rationale,
      relatedLawRefs: analysisOutput.relatedLawRefs,
    };

    // キャッシュ保存
    const cacheKey = generateCacheKey(
      "gap_analysis",
      article.articleNum,
      article.currentText ?? "",
      article.relatedDocs.map((d) => d.content).join(""),
    );
    await setCachedResponse(cacheKey, item, 30);

    batchItems.push(item);
  }

  return [...cachedItems, ...batchItems];
}

// ---------- 公開 API ----------

/**
 * 複数条文のギャップ分析をバッチで実行する
 *
 * 最大 BATCH_SIZE 条文をまとめて 1 回の Claude API で分析し、
 * バッチを concurrency 並列で実行する。
 *
 * @param projectId - プロジェクト ID
 * @param articles - 分析対象の条文リスト
 * @param onBatchComplete - バッチ完了時のコールバック（進捗通知用）
 * @param concurrency - 並列実行数（デフォルト: 2）
 * @returns 分析結果
 */
export async function analyzeGaps(
  projectId: string,
  articles: Array<{
    articleNum: string;
    category: string;
    currentText: string | null;
    relatedDocs: RetrievedDocument[];
  }>,
  onBatchComplete?: (completedCount: number, totalCount: number, batchArticleNums: string[]) => void,
  concurrency: number = 2,
): Promise<AnalysisResult> {
  logger.info(
    { projectId, articleCount: articles.length, batchSize: BATCH_SIZE, concurrency },
    "ギャップ分析を開始（バッチモード）",
  );

  const items: GapAnalysisItem[] = [];
  const errors: Array<{ articleNum: string; error: string }> = [];
  let completedCount = 0;

  // BATCH_SIZE ごとにバッチを作成
  const batches: Array<typeof articles> = [];
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    batches.push(articles.slice(i, i + BATCH_SIZE));
  }

  // concurrency 並列でバッチを実行
  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrentBatches = batches.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      concurrentBatches.map((batch) => analyzeBatchArticles(batch)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const batch = concurrentBatches[j];
      const batchArticleNums = batch.map((a) => a.articleNum);

      if (result.status === "fulfilled") {
        items.push(...result.value);
        completedCount += batch.length;
        onBatchComplete?.(completedCount, articles.length, batchArticleNums);
      } else {
        logger.warn(
          { batchArticleNums, error: result.reason },
          "バッチ分析に失敗、個別にリトライ",
        );

        // バッチ全体が失敗した場合、1件ずつリトライ
        for (const article of batch) {
          try {
            const retryResult = await analyzeBatchArticles([article]);
            items.push(...retryResult);
            logger.info({ articleNum: article.articleNum }, "個別リトライ成功");
          } catch (retryError) {
            logger.error(
              { articleNum: article.articleNum, error: retryError },
              "個別リトライも失敗",
            );
            errors.push({
              articleNum: article.articleNum,
              error: retryError instanceof Error ? retryError.message : String(retryError),
            });
          }
          completedCount++;
        }
        onBatchComplete?.(completedCount, articles.length, batchArticleNums);
      }
    }
  }

  if (errors.length > 0) {
    logger.warn({ errorCount: errors.length }, "一部の条文でギャップ分析に失敗");
  }

  // サマリーを生成
  const summary = buildSummary(items);

  return {
    projectId,
    items,
    summary,
    analyzedAt: new Date().toISOString(),
  };
}

// ---------- サマリー生成 ----------

function buildSummary(items: GapAnalysisItem[]): AnalysisSummary {
  const byGapType: Record<GapType, number> = {
    missing: 0,
    outdated: 0,
    partial: 0,
    compliant: 0,
    custom: 0,
  };

  const byImportance = { mandatory: 0, recommended: 0, optional: 0 };

  for (const item of items) {
    byGapType[item.gapType]++;
    byImportance[item.importance]++;
  }

  const compliant = byGapType.compliant;
  const actionRequired = items.length - compliant;

  return {
    totalArticles: items.length,
    actionRequired,
    compliant,
    byImportance,
    byGapType,
  };
}
