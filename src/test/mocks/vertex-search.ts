/**
 * Vertex AI Search モック
 *
 * テスト用の Vertex AI Search API レスポンスモックを提供する。
 * マンション管理規約の条文データをサンプルとして含む。
 */

// --- 型定義 ---

/** 検索結果の条文データ */
interface SearchArticle {
  /** 条番号（例: "第3条"） */
  articleNumber: string;
  /** 条文タイトル */
  title: string;
  /** 条文本文 */
  content: string;
  /** 出典（例: "標準管理規約"） */
  source: string;
  /** 関連度スコア (0.0 - 1.0) */
  relevanceScore: number;
}

/** Vertex AI Search のレスポンス型 */
interface MockSearchResponse {
  results: Array<{
    document: {
      derivedStructData: {
        articleNumber: string;
        title: string;
        content: string;
        source: string;
      };
    };
    relevanceScore: number;
  }>;
  totalSize: number;
  attributionToken: string;
  summary: {
    summaryText: string;
  };
}

// --- 条文サンプルデータ ---

/** 第3条: 規約及び総会の決議の遵守義務 */
export const ARTICLE_3: SearchArticle = {
  articleNumber: '第3条',
  title: '規約及び総会の決議の遵守義務',
  content:
    '区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。' +
    '\n2 区分所有者は、同居する者に対してこの規約及び総会の決議を遵守させなければならない。',
  source: '標準管理規約（令和7年改正）',
  relevanceScore: 0.95,
};

/** 第15条: 駐車場の使用 */
export const ARTICLE_15: SearchArticle = {
  articleNumber: '第15条',
  title: '駐車場の使用',
  content:
    '管理組合は、別に定めるところにより、特定の区分所有者に駐車場の使用を認めることができる。' +
    '\n2 前項により駐車場を使用している者は、別に定めるところにより、管理組合に駐車場使用料を納入しなければならない。',
  source: '標準管理規約（令和7年改正）',
  relevanceScore: 0.88,
};

/** 第50条: 理事会 */
export const ARTICLE_50: SearchArticle = {
  articleNumber: '第50条',
  title: '理事会',
  content:
    '理事会は、理事長、副理事長、会計担当理事、理事及び監事をもって構成する。' +
    '\n2 理事会は、理事長が招集する。' +
    '\n3 理事が半数以上出席しなければ、理事会を開くことができない。' +
    '\n4 理事会の議事は、出席理事の過半数で決し、可否同数の場合は議長の決するところによる。',
  source: '標準管理規約（令和7年改正）',
  relevanceScore: 0.92,
};

/** 全サンプル条文 */
export const SAMPLE_ARTICLES: SearchArticle[] = [ARTICLE_3, ARTICLE_15, ARTICLE_50];

// --- ファクトリ関数 ---

/**
 * Vertex AI Search の検索結果モックを生成
 *
 * @param articles - 検索結果に含める条文データ（デフォルト: 全サンプル条文）
 */
export function createMockSearchResult(
  articles: SearchArticle[] = SAMPLE_ARTICLES,
): MockSearchResponse {
  return {
    results: articles.map((article) => ({
      document: {
        derivedStructData: {
          articleNumber: article.articleNumber,
          title: article.title,
          content: article.content,
          source: article.source,
        },
      },
      relevanceScore: article.relevanceScore,
    })),
    totalSize: articles.length,
    attributionToken: `mock_attribution_${Date.now()}`,
    summary: {
      summaryText: `${articles.length}件の関連条文が見つかりました。`,
    },
  };
}

/**
 * 空の検索結果モックを生成
 */
export function createEmptySearchResult(): MockSearchResponse {
  return {
    results: [],
    totalSize: 0,
    attributionToken: `mock_attribution_${Date.now()}`,
    summary: {
      summaryText: '該当する条文は見つかりませんでした。',
    },
  };
}

/**
 * 検索エラーをシミュレートするモック
 */
export function createSearchError(
  message = 'Vertex AI Search API エラー',
): Error {
  const error = new Error(message);
  error.name = 'VertexSearchError';
  return error;
}
