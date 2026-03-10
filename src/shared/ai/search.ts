/**
 * Vertex AI Search クライアント
 *
 * Google Cloud の Vertex AI Search（Discovery Engine）を使用して
 * 標準管理規約データストアから関連条文を検索する。
 *
 * 環境変数:
 * - GCP_PROJECT_ID: GCP プロジェクト ID
 * - VERTEX_AI_SEARCH_DATASTORE_ID: データストア ID
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
  const location = process.env.GCP_LOCATION ?? "global";

  return { projectId, dataStoreId, location };
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

  try {
    // Discovery Engine API を直接呼び出し
    const endpoint = buildEndpoint(config.projectId, config.location, config.dataStoreId);

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
      throw new Error(`Vertex AI Search API エラー: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return parseSearchResponse(data);
  } catch (error) {
    logger.error({ error }, "Vertex AI Search の呼び出しに失敗");
    throw error;
  }
}

// ---------- 内部処理 ----------

/**
 * Discovery Engine API のエンドポイント URL を構築する
 */
function buildEndpoint(
  projectId: string,
  location: string,
  dataStoreId: string,
): string {
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
