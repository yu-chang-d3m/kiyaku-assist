/**
 * 標準条文 → 意味グループ マッピング
 *
 * パース済み StandardArticle[] を Claude Haiku で 12 グループに分類する。
 * バッチ処理（10 条文/回）で効率的にマッピングし、
 * tool_use で構造化出力を取得する。
 */

import type {
  StandardArticle,
  SemanticGroupId,
  TaxonomyMappingResult,
} from "./types";
import { SEMANTIC_GROUPS } from "./constants";
import {
  callWithStructuredOutput,
  callWithRetry,
  MODELS,
} from "@/shared/ai/claude";
import { logger } from "@/shared/observability/logger";

// ---------- 定数 ----------

/** バッチサイズ（1回の API 呼び出しで処理する条文数） */
const BATCH_SIZE = 10;

/** 並列実行数 */
const CONCURRENCY = 2;

/** バッチ間の待機時間（ms） */
const BATCH_DELAY_MS = 500;

// ---------- ツール定義 ----------

/** マッピング結果の tool_use 定義 */
const TAXONOMY_MAPPING_TOOL = {
  name: "taxonomy_mapping",
  description:
    "マンション管理規約の条文を意味グループに分類した結果を返す。各条文にプライマリグループ1つとセカンダリグループ（0〜2つ）を割り当てる。",
  input_schema: {
    type: "object" as const,
    properties: {
      mappings: {
        type: "array",
        description: "条文ごとのマッピング結果",
        items: {
          type: "object",
          properties: {
            articleNum: {
              type: "string",
              description: "条文番号（例: \"第1条\"）",
            },
            primaryGroup: {
              type: "string",
              description: "プライマリ意味グループ ID",
              enum: SEMANTIC_GROUPS.map((g) => g.id),
            },
            secondaryGroups: {
              type: "array",
              description:
                "セカンダリ意味グループ ID（0〜2つ。プライマリと異なるもの）",
              items: {
                type: "string",
                enum: SEMANTIC_GROUPS.map((g) => g.id),
              },
            },
          },
          required: ["articleNum", "primaryGroup", "secondaryGroups"],
        },
      },
    },
    required: ["mappings"],
  },
};

// ---------- プロンプト ----------

/** グループ一覧のテキスト（プロンプト埋め込み用） */
const GROUP_DESCRIPTIONS = SEMANTIC_GROUPS.map(
  (g) => `- ${g.id}: ${g.label} — ${g.description}`,
).join("\n");

const SYSTEM_PROMPT = `あなたはマンション管理規約の専門家です。
与えられた条文を、以下の12の意味グループに分類してください。

## 意味グループ一覧
${GROUP_DESCRIPTIONS}

## 分類ルール
1. 各条文に **プライマリグループを1つ** 必ず割り当てる
2. 関連するが主ではないグループを **セカンダリ（0〜2つ）** として追加できる
3. セカンダリはプライマリと異なるグループのみ
4. 迷った場合は以下の優先順位で判断:
   - 条文の主たる規律対象（何を規定しているか）
   - 章の位置づけ（第1章=総則、第6章=管理組合 等）
   - 改正区分所有法との関連（電磁的方法、所有者不明 等は優先度高）
5. 附則の条文は原則 "misc" に分類

## 出力
taxonomy_mapping ツールを呼び出し、全条文のマッピング結果を返してください。`;

/**
 * バッチ用ユーザーメッセージを生成
 */
function buildUserMessage(articles: StandardArticle[]): string {
  const articleTexts = articles
    .map(
      (a) =>
        `### ${a.articleNum}（${a.title || "タイトルなし"}）\n` +
        `章: 第${a.chapter}章 ${a.chapterTitle}\n` +
        `本文（抜粋）: ${a.body.slice(0, 300)}${a.body.length > 300 ? "…" : ""}`,
    )
    .join("\n\n");

  return `以下の ${articles.length} 条文を意味グループに分類してください。\n\n${articleTexts}`;
}

// ---------- バッチ処理 ----------

/** tool_use の出力型 */
interface MappingToolOutput {
  mappings: TaxonomyMappingResult[];
}

/**
 * 1バッチ（最大10条文）をマッピング
 */
async function mapBatch(
  articles: StandardArticle[],
): Promise<TaxonomyMappingResult[]> {
  const result = await callWithStructuredOutput<MappingToolOutput>({
    model: MODELS.PARSE,
    system: SYSTEM_PROMPT,
    userMessage: buildUserMessage(articles),
    tool: TAXONOMY_MAPPING_TOOL,
    maxTokens: 4096,
  });

  return result.mappings;
}

// ---------- パブリック API ----------

/** マッピング進捗コールバック */
export type MappingProgressCallback = (progress: {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}) => void;

/**
 * StandardArticle[] を 12 グループにマッピングする
 *
 * Claude Haiku をバッチ 10 件で呼び出し、各条文に
 * プライマリ + セカンダリグループを割り当てる。
 *
 * @param articles パース済み標準条文配列
 * @param onProgress 進捗コールバック（オプション）
 * @returns マッピング結果が反映された StandardArticle[]
 */
export async function mapStandardArticlesToTaxonomy(
  articles: StandardArticle[],
  onProgress?: MappingProgressCallback,
): Promise<StandardArticle[]> {
  // バッチに分割
  const batches: StandardArticle[][] = [];
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    batches.push(articles.slice(i, i + BATCH_SIZE));
  }

  const totalBatches = batches.length;
  logger.info(
    { totalArticles: articles.length, totalBatches, batchSize: BATCH_SIZE },
    "タクソノミーマッピング開始",
  );

  // マッピング結果を蓄積
  const allMappings = new Map<string, TaxonomyMappingResult>();

  // 並列バッチ実行
  let completedArticles = 0;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const concurrentBatches = batches.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      concurrentBatches.map((batch, idx) => {
        const batchIndex = i + idx;
        logger.info(
          {
            batchIndex: batchIndex + 1,
            totalBatches,
            articleCount: batch.length,
          },
          "バッチマッピング実行中",
        );
        return callWithRetry(() => mapBatch(batch));
      }),
    );

    // 結果を処理
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const batchIndex = i + j;
      const batch = concurrentBatches[j];

      if (result.status === "fulfilled") {
        for (const mapping of result.value) {
          allMappings.set(mapping.articleNum, mapping);
        }
        completedArticles += batch.length;
      } else {
        // バッチ失敗時: 1件ずつフォールバック
        logger.warn(
          { batchIndex: batchIndex + 1, error: result.reason },
          "バッチマッピング失敗、1件ずつリトライ",
        );
        for (const article of batch) {
          try {
            const singleResult = await callWithRetry(() =>
              mapBatch([article]),
            );
            for (const mapping of singleResult) {
              allMappings.set(mapping.articleNum, mapping);
            }
            completedArticles++;
          } catch (err) {
            logger.error(
              { articleNum: article.articleNum, err },
              "単一条文マッピングも失敗",
            );
            completedArticles++;
          }
        }
      }

      onProgress?.({
        completed: completedArticles,
        total: articles.length,
        currentBatch: batchIndex + 1,
        totalBatches,
      });
    }

    // レート制限対策: バッチ間待機
    if (i + CONCURRENCY < batches.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // マッピング結果を StandardArticle に反映
  const validGroupIds = new Set<string>(SEMANTIC_GROUPS.map((g) => g.id));

  const mapped = articles.map((article) => {
    const mapping = allMappings.get(article.articleNum);
    if (!mapping) {
      logger.warn(
        { articleNum: article.articleNum },
        "マッピング結果なし、misc にフォールバック",
      );
      return article;
    }

    // バリデーション: 無効なグループ ID をフィルタ
    const primaryGroup = validGroupIds.has(mapping.primaryGroup)
      ? mapping.primaryGroup
      : ("misc" as SemanticGroupId);

    const secondaryGroups = (mapping.secondaryGroups || [])
      .filter(
        (g): g is SemanticGroupId =>
          validGroupIds.has(g) && g !== primaryGroup,
      )
      .slice(0, 2); // 最大2つ

    return {
      ...article,
      semanticGroup: primaryGroup,
      secondaryGroups,
    };
  });

  // 統計ログ
  const groupCounts = new Map<string, number>();
  for (const a of mapped) {
    groupCounts.set(a.semanticGroup, (groupCounts.get(a.semanticGroup) || 0) + 1);
  }
  logger.info(
    {
      totalMapped: allMappings.size,
      totalArticles: articles.length,
      unmapped: articles.length - allMappings.size,
      groupDistribution: Object.fromEntries(groupCounts),
    },
    "タクソノミーマッピング完了",
  );

  return mapped;
}
