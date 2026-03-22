/**
 * Analyzer LLM 評価テスト
 *
 * ギャップ分析の出力品質を LLM-as-a-Judge で評価する。
 * EVALS=1 環境変数が設定されている場合にのみ実行される。
 *
 * 実行: pnpm test:eval
 */

import { describe, it, expect } from 'vitest';
import { evaluateWithLlm, isEvalsEnabled } from '@/test/helpers/llm-judge';

// ---------- グラウンドトゥルース ----------

/**
 * テスト用のギャップ分析サンプル出力
 * 実際の analyzeGaps 関数の出力形式に準拠
 */
const SAMPLE_GAP_ANALYSIS_OUTPUT = `
## ギャップ分析結果: 第17条（専有部分の修繕等）

- **ギャップ種類**: outdated（内容が古い）
- **重要度**: recommended（対応推奨）
- **ギャップ概要**: 現行規約第17条では専有部分の修繕に関して理事長の承認のみを要件としているが、
  令和7年改正標準管理規約では共用部分に影響を及ぼす修繕について、事前の届出制度と
  理事会による確認プロセスが追加されている。また、修繕工事の施工業者に関する要件が不足している。
- **改正理由**: 専有部分の修繕が共用部分（配管・構造体等）に影響を与えるケースが増加しており、
  事前に理事会が把握して適切な施工管理を行う必要がある。標準管理規約の改正はこの実態を反映したもの。
- **関連法令**: 区分所有法第17条（共用部分の変更）、第18条（共用部分の管理）
`.trim();

/**
 * グラウンドトゥルース: 専門家が期待する分析のポイント
 */
const GROUND_TRUTH = `
専有部分の修繕（第17条）に関するギャップ分析では、以下の点を正確に指摘すべき:
1. 現行規約の承認プロセスと標準管理規約の届出制度の違い
2. 共用部分への影響を考慮した事前確認の必要性
3. 重要度は mandatory（法令上必須）ではなく recommended（対応推奨）が適切
4. 区分所有法の関連条文（第17条・第18条）との対応
5. 改正の背景として、マンション老朽化に伴う配管修繕等の増加
`.trim();

// ---------- テスト ----------

describe.skipIf(!isEvalsEnabled())('Analyzer LLM 評価', () => {
  it(
    'ギャップ分析の出力が正確かつ完全であること',
    async () => {
      const result = await evaluateWithLlm(
        {
          description:
            'マンション管理規約のギャップ分析出力の品質評価。' +
            '現行規約と令和7年改正標準管理規約の比較分析として、' +
            '正確性・完全性・関連性を評価する。',
          groundTruth: GROUND_TRUTH,
          additionalContext:
            '対象はマンション管理規約の専有部分修繕に関する条文。' +
            '読者は管理組合の理事会メンバー（非専門家）を想定。',
        },
        SAMPLE_GAP_ANALYSIS_OUTPUT,
      );

      // 各軸のスコアが 3 以上（5段階中の合格ライン）
      expect(result.accuracy.score).toBeGreaterThanOrEqual(3);
      expect(result.completeness.score).toBeGreaterThanOrEqual(3);
      expect(result.relevance.score).toBeGreaterThanOrEqual(3);

      // 総合スコアが 3.0 以上
      expect(result.overallScore).toBeGreaterThanOrEqual(3.0);

      // 評価理由が返されていること
      expect(result.accuracy.reasoning).toBeTruthy();
      expect(result.completeness.reasoning).toBeTruthy();
      expect(result.relevance.reasoning).toBeTruthy();
      expect(result.overallReasoning).toBeTruthy();

      // 結果をログ出力（CI で確認用）
      console.info('--- LLM 評価結果 ---');
      console.info(`正確性:   ${result.accuracy.score}/5 — ${result.accuracy.reasoning}`);
      console.info(`完全性:   ${result.completeness.score}/5 — ${result.completeness.reasoning}`);
      console.info(`関連性:   ${result.relevance.score}/5 — ${result.relevance.reasoning}`);
      console.info(`総合:     ${result.overallScore}/5`);
      console.info(`総合評価: ${result.overallReasoning}`);
    },
    { timeout: 60_000 }, // LLM 呼び出しのため長めのタイムアウト
  );

  it(
    '不十分な分析出力に対して低スコアが返ること',
    async () => {
      const poorOutput = `
## ギャップ分析結果: 第17条
- ギャップ種類: compliant
- 重要度: optional
- 概要: 問題なし
      `.trim();

      const result = await evaluateWithLlm(
        {
          description:
            'マンション管理規約のギャップ分析出力の品質評価。' +
            '実際には outdated であるべき条文が compliant と判定されている不正確な分析を評価する。',
          groundTruth: GROUND_TRUTH,
          additionalContext:
            'この分析出力は意図的に不正確・不完全にしたもの。' +
            '低いスコアが返されることを期待する。',
        },
        poorOutput,
      );

      // 不十分な出力なのでスコアは低いはず
      expect(result.overallScore).toBeLessThan(3.5);

      console.info('--- LLM 評価結果（低品質入力） ---');
      console.info(`正確性:   ${result.accuracy.score}/5`);
      console.info(`完全性:   ${result.completeness.score}/5`);
      console.info(`関連性:   ${result.relevance.score}/5`);
      console.info(`総合:     ${result.overallScore}/5`);
    },
    { timeout: 60_000 },
  );
});
