/**
 * LLM 評価ヘルパー (LLM-as-a-Judge)
 *
 * AI 生成コンテンツの品質を Claude で評価する。
 * EVALS=1 環境変数が設定されている場合にのみ実行される。
 *
 * 評価軸:
 * - accuracy (正確性): 事実に基づいた正確さ — 1-5
 * - completeness (完全性): 必要な情報の網羅度 — 1-5
 * - relevance (関連性): 質問・基準への関連度 — 1-5
 */

import Anthropic from '@anthropic-ai/sdk';

// ---------- 型定義 ----------

/** 個別評価軸のスコア */
export interface AxisScore {
  /** スコア（1-5） */
  score: number;
  /** 評価理由 */
  reasoning: string;
}

/** LLM 評価の結果 */
export interface EvalResult {
  /** 正確性 */
  accuracy: AxisScore;
  /** 完全性 */
  completeness: AxisScore;
  /** 関連性 */
  relevance: AxisScore;
  /** 総合スコア（3軸の平均） */
  overallScore: number;
  /** 総合コメント */
  overallReasoning: string;
}

/** 評価基準 */
export interface EvalCriteria {
  /** 評価の説明（何を評価するか） */
  description: string;
  /** 期待される内容・正解例（グラウンドトゥルース） */
  groundTruth?: string;
  /** 追加の評価コンテキスト */
  additionalContext?: string;
}

// ---------- 設定 ----------

/** 最大リトライ回数（レートリミット対策） */
const MAX_RETRIES = 3;

/** リトライ時の初期待機時間（ミリ秒） */
const INITIAL_BACKOFF_MS = 1000;

/** 評価が有効かどうか */
export function isEvalsEnabled(): boolean {
  return process.env.EVALS === '1';
}

// ---------- 評価用 tool_use スキーマ ----------

const EVAL_TOOL = {
  name: 'output_evaluation' as const,
  description: 'AI 生成コンテンツの品質評価結果を構造化出力する',
  input_schema: {
    type: 'object' as const,
    properties: {
      accuracy: {
        type: 'object' as const,
        properties: {
          score: { type: 'number' as const, description: '正確性スコア (1-5)' },
          reasoning: { type: 'string' as const, description: '正確性の評価理由' },
        },
        required: ['score', 'reasoning'],
      },
      completeness: {
        type: 'object' as const,
        properties: {
          score: { type: 'number' as const, description: '完全性スコア (1-5)' },
          reasoning: { type: 'string' as const, description: '完全性の評価理由' },
        },
        required: ['score', 'reasoning'],
      },
      relevance: {
        type: 'object' as const,
        properties: {
          score: { type: 'number' as const, description: '関連性スコア (1-5)' },
          reasoning: { type: 'string' as const, description: '関連性の評価理由' },
        },
        required: ['score', 'reasoning'],
      },
      overallReasoning: {
        type: 'string' as const,
        description: '総合的な評価コメント',
      },
    },
    required: ['accuracy', 'completeness', 'relevance', 'overallReasoning'],
  },
};

// ---------- ヘルパー ----------

/**
 * 指数バックオフ付きスリープ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- メイン関数 ----------

/**
 * Claude を使って AI 生成コンテンツを評価する
 *
 * @param criteria - 評価基準
 * @param content - 評価対象のコンテンツ
 * @returns 評価結果（3軸スコア + 総合スコア）
 *
 * @example
 * ```ts
 * const result = await evaluateWithLlm(
 *   {
 *     description: 'ギャップ分析の出力品質',
 *     groundTruth: '第12条は置き配に関する規定が不足している',
 *   },
 *   analysisOutput,
 * );
 * expect(result.overallScore).toBeGreaterThanOrEqual(3);
 * ```
 */
export async function evaluateWithLlm(
  criteria: EvalCriteria,
  content: string,
): Promise<EvalResult> {
  if (!isEvalsEnabled()) {
    throw new Error(
      'LLM 評価は EVALS=1 環境変数が必要です。テスト実行時に EVALS=1 を設定してください。',
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'test-api-key-dummy') {
    throw new Error(
      'LLM 評価には有効な ANTHROPIC_API_KEY が必要です。',
    );
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `あなたは AI 生成コンテンツの品質評価を行うジャッジ AI です。
以下の3軸で評価してください。各軸のスコアは 1（最低）〜 5（最高）で採点してください。

1. **正確性 (accuracy)**: 事実に基づいた正確さ。誤った情報が含まれていないか。
2. **完全性 (completeness)**: 必要な情報がすべて含まれているか。重要な点の抜け漏れがないか。
3. **関連性 (relevance)**: 評価基準に対してどの程度関連しているか。的外れな内容が含まれていないか。

厳格かつ公正に評価してください。`;

  let userPrompt = `## 評価基準\n${criteria.description}\n`;

  if (criteria.groundTruth) {
    userPrompt += `\n## 期待される内容（グラウンドトゥルース）\n${criteria.groundTruth}\n`;
  }

  if (criteria.additionalContext) {
    userPrompt += `\n## 追加コンテキスト\n${criteria.additionalContext}\n`;
  }

  userPrompt += `\n## 評価対象コンテンツ\n${content}\n\n上記コンテンツを評価してください。`;

  // リトライ付き API 呼び出し
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [EVAL_TOOL],
        tool_choice: { type: 'tool', name: EVAL_TOOL.name },
      });

      // tool_use ブロックを取得
      const toolUseBlock = response.content.find(
        (block) => block.type === 'tool_use',
      );

      if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
        throw new Error('LLM 評価で tool_use ブロックが返されませんでした');
      }

      const input = toolUseBlock.input as {
        accuracy: AxisScore;
        completeness: AxisScore;
        relevance: AxisScore;
        overallReasoning: string;
      };

      const overallScore =
        (input.accuracy.score + input.completeness.score + input.relevance.score) / 3;

      return {
        accuracy: input.accuracy,
        completeness: input.completeness,
        relevance: input.relevance,
        overallScore: Math.round(overallScore * 100) / 100,
        overallReasoning: input.overallReasoning,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // レートリミット（429）またはサーバーエラー（5xx）の場合はリトライ
      const isRetryable =
        lastError.message.includes('429') ||
        lastError.message.includes('rate') ||
        lastError.message.includes('500') ||
        lastError.message.includes('503') ||
        lastError.message.includes('overloaded');

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error('LLM 評価に失敗しました（原因不明）');
}
