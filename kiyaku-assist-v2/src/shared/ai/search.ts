/**
 * Vertex AI Search クライアント
 *
 * Google Cloud の Vertex AI Search（Discovery Engine）を使用して
 * 標準管理規約データストアから関連条文を検索する。
 *
 * 環境変数:
 * - GCP_PROJECT_ID: GCP プロジェクト ID
 * - VERTEX_AI_SEARCH_DATASTORE_ID: データストア ID
 * - VERTEX_AI_SEARCH_ENGINE_ID: エンジン ID（Enterprise Edition 機能に必要）
 * - GCP_LOCATION: ロケーション（デフォルト: global）
 */

import { logger } from "@/shared/observability/logger";

// ---------- 型定義 ----------

/** 検索結果 */
export interface SearchResult {
  /** ドキュメントの内容 */
  content: string;
  /** メタデータ（条番号、出典など） */
  metadata: Record<string, string>;
  /** 関連度スコア（0-1） */
  relevanceScore: number;
}

// ---------- 環境変数 ----------

function getConfig() {
  const projectId = process.env.GCP_PROJECT_ID;
  const dataStoreId = process.env.VERTEX_AI_SEARCH_DATASTORE_ID;
  const engineId = process.env.VERTEX_AI_SEARCH_ENGINE_ID;
  const location = process.env.GCP_LOCATION ?? "global";

  return { projectId, dataStoreId, engineId, location };
}

/**
 * Vertex AI Search が利用可能かどうかを確認する
 */
export function isSearchConfigured(): boolean {
  const { projectId, dataStoreId } = getConfig();
  return Boolean(projectId && dataStoreId);
}

// ---------- 公開 API ----------

/**
 * 標準管理規約から関連条文を検索する
 *
 * Vertex AI Search が未設定の場合は空配列を返す（デモモード）。
 *
 * @param query - 検索クエリ（条文テキストまたは自然言語の質問）
 * @param topK - 取得する結果件数（デフォルト: 5）
 * @returns 検索結果の配列
 */
export async function searchStandardRules(
  query: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  const config = getConfig();

  if (!config.projectId || !config.dataStoreId) {
    logger.warn(
      "Vertex AI Search が未設定です。空の検索結果を返します。" +
        "GCP_PROJECT_ID と VERTEX_AI_SEARCH_DATASTORE_ID を設定してください。",
    );
    return [];
  }

  logger.info(
    { query: query.slice(0, 50), topK, dataStoreId: config.dataStoreId },
    "Vertex AI Search を呼び出し",
  );

  // Discovery Engine API を直接呼び出し（リトライ付き）
  const endpoint = buildEndpoint(config.projectId, config.location, config.dataStoreId, config.engineId);

  const requestBody = {
    query,
    pageSize: topK,
    queryExpansionSpec: {
      condition: "AUTO",
    },
    spellCorrectionSpec: {
      mode: "AUTO",
    },
    contentSearchSpec: {
      snippetSpec: {
        returnSnippet: true,
        maxSnippetCount: 1,
      },
      extractiveContentSpec: {
        maxExtractiveAnswerCount: 1,
      },
    },
  };

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Google Auth トークンの取得（サービスアカウントまたは ADC）
      const accessToken = await getAccessToken();

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Vertex AI Search API エラー: ${response.status} ${errorText}`);

        // 5xx エラーまたは 429 はリトライ対象
        if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
          const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          logger.warn(
            { status: response.status, attempt: attempt + 1, maxRetries, delayMs: Math.round(delay) },
            "Vertex AI Search API エラー。リトライします",
          );
          await sleep(delay);
          lastError = error;
          continue;
        }

        throw error;
      }

      const data = await response.json();
      return parseSearchResponse(data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // リトライ対象: ネットワークエラーまたはサーバーエラー（既に throw されたもの以外）
      const isRetryable = err.message.includes("fetch failed") ||
        err.message.includes("ECONNRESET") ||
        err.message.includes("ETIMEDOUT") ||
        err.message.includes("UND_ERR_SOCKET");

      if (isRetryable && attempt < maxRetries) {
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        logger.warn(
          { error: err.message, attempt: attempt + 1, maxRetries, delayMs: Math.round(delay) },
          "Vertex AI Search 接続エラー。リトライします",
        );
        await sleep(delay);
        lastError = err;
        continue;
      }

      logger.error({ error }, "Vertex AI Search の呼び出しに失敗");
      throw error;
    }
  }

  // ここに到達するのはリトライが全て失敗した場合のみ
  logger.error({ lastError }, "Vertex AI Search の全リトライが失敗");
  throw lastError ?? new Error("Vertex AI Search: 不明なエラー");
}

// ---------- ユーティリティ ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 内部処理 ----------

/**
 * Discovery Engine API のエンドポイント URL を構築する
 *
 * エンジン ID が設定されている場合はエンジン経由のエンドポイントを使用する。
 * Enterprise Edition の機能（extractive answers 等）はエンジン経由が必須。
 */
function buildEndpoint(
  projectId: string,
  location: string,
  dataStoreId: string,
  engineId?: string,
): string {
  if (engineId) {
    return (
      `https://discoveryengine.googleapis.com/v1/` +
      `projects/${projectId}/locations/${location}/` +
      `collections/default_collection/engines/${engineId}/servingConfigs/default_search:search`
    );
  }
  return (
    `https://discoveryengine.googleapis.com/v1/` +
    `projects/${projectId}/locations/${location}/` +
    `dataStores/${dataStoreId}/servingConfigs/default_search:search`
  );
}

/**
 * GCP アクセストークンを取得する
 *
 * Application Default Credentials（ADC）を使用。
 * ローカル開発時は `gcloud auth application-default login` が必要。
 * Cloud Run 等ではサービスアカウントが自動で使用される。
 */
async function getAccessToken(): Promise<string> {
  // メタデータサーバーからトークンを取得（Cloud Run/GCE 環境）
  try {
    const metadataResponse = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (metadataResponse.ok) {
      const data = await metadataResponse.json();
      return data.access_token;
    }
  } catch {
    // メタデータサーバーが利用できない（ローカル開発環境）
  }

  // ローカル開発: gcloud CLI のアクセストークンを使用
  try {
    const { execSync } = await import("child_process");
    const token = execSync("gcloud auth application-default print-access-token", {
      encoding: "utf-8",
    }).trim();
    return token;
  } catch (error) {
    throw new Error(
      "GCP アクセストークンを取得できません。" +
        "`gcloud auth application-default login` を実行してください。\n" +
        `元のエラー: ${error}`,
    );
  }
}

/**
 * Vertex AI Search のレスポンスをパースする
 */
function parseSearchResponse(data: Record<string, unknown>): SearchResult[] {
  const results: SearchResult[] = [];
  const searchResults = (data.results ?? []) as Array<Record<string, unknown>>;

  for (const result of searchResults) {
    const document = result.document as Record<string, unknown> | undefined;
    if (!document) continue;

    // ドキュメントのコンテンツを抽出
    const derivedStructData = document.derivedStructData as
      | Record<string, unknown>
      | undefined;

    const snippets = derivedStructData?.snippets as
      | Array<{ snippet: string }>
      | undefined;

    const content = snippets?.[0]?.snippet ?? "";

    // メタデータを抽出
    const structData = document.structData as
      | Record<string, string>
      | undefined;

    const metadata: Record<string, string> = {
      id: (document.id as string) ?? "",
      ...structData,
    };

    // 関連度スコアの正規化（0-1）
    const relevanceScore = typeof result.relevanceScore === "number"
      ? result.relevanceScore
      : 0.5;

    results.push({ content, metadata, relevanceScore });
  }

  return results;
}
