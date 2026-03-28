/**
 * Retriever — Vertex AI Search から関連条文を取得する
 *
 * 現行規約の条文をクエリとして、標準管理規約データストアから
 * 関連する条文を検索・取得する。
 */

import { searchStandardRules, type SearchResult } from "@/shared/ai/search";
import type { RetrievalResult, RetrievedDocument } from "@/domains/analysis/types";
import { logger } from "@/shared/observability/logger";

// ---------- 設定 ----------

/** デフォルトの取得件数 */
const DEFAULT_TOP_K = 5;

/** 最小関連度スコア（これ以下の結果は除外） */
const MIN_RELEVANCE_SCORE = 0.3;

// ---------- 公開 API ----------

/**
 * 条文テキストに関連する標準管理規約の条文を検索する
 *
 * @param articleText - 検索対象の条文テキスト
 * @param topK - 取得件数（デフォルト: 5）
 * @returns 検索結果
 */
export async function retrieveRelatedStandards(
  articleText: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievalResult> {
  logger.info({ topK, queryLength: articleText.length }, "Vertex AI Search で関連条文を検索");

  const searchResults = await searchStandardRules(articleText, topK);

  // 関連度スコアでフィルタリング
  const filteredResults = searchResults.filter(
    (r) => r.relevanceScore >= MIN_RELEVANCE_SCORE,
  );

  const documents: RetrievedDocument[] = filteredResults.map((r) => ({
    content: r.content,
    metadata: r.metadata,
    relevanceScore: r.relevanceScore,
  }));

  logger.info(
    { totalResults: searchResults.length, filteredResults: documents.length },
    "検索結果をフィルタリング",
  );

  return {
    query: articleText,
    results: documents,
  };
}

/**
 * 複数の条文を並列で検索する
 *
 * @param articleTexts - 検索対象の条文テキスト配列
 * @param topK - 各条文あたりの取得件数
 * @param concurrency - 並列実行数（デフォルト: 3）
 * @returns 検索結果の配列
 */
export async function batchRetrieve(
  articleTexts: string[],
  topK: number = DEFAULT_TOP_K,
  concurrency: number = 3,
): Promise<RetrievalResult[]> {
  const results: RetrievalResult[] = [];

  // 並列実行数を制限して順次処理
  for (let i = 0; i < articleTexts.length; i += concurrency) {
    const batch = articleTexts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((text) => retrieveRelatedStandards(text, topK)),
    );
    results.push(...batchResults);
  }

  return results;
}
