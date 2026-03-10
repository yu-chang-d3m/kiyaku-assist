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

// ---------- 公開 API ----------

/**
 * 複数条文のギャップ分析を並列実行する
 *
 * @param projectId - プロジェクト ID
 * @param articles - 分析対象の条文リスト
 * @param concurrency - 並列実行数（デフォルト: 5）
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
  concurrency: number = 5,
): Promise<AnalysisResult> {
  logger.info(
    { projectId, articleCount: articles.length, concurrency },
    "ギャップ分析を開始",
  );

  const items: GapAnalysisItem[] = [];
  const errors: Array<{ articleNum: string; error: string }> = [];

  // 並列実行数を制限して処理
  for (let i = 0; i < articles.length; i += concurrency) {
    const batch = articles.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((a) =>
        analyzeArticle(a.articleNum, a.category, a.currentText, a.relatedDocs),
      ),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        items.push(result.value);
      } else {
        const articleNum = batch[j].articleNum;
        logger.error(
          { articleNum, error: result.reason },
          "ギャップ分析に失敗",
        );
        errors.push({
          articleNum,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
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
