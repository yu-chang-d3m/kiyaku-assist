---
name: run-tests
preamble-tier: 3
description: |
  キヤクアシスト v2 のテスト実行・管理スキル。
  Vitest ユニットテスト、Playwright E2E テスト、AI 評価テストを統合管理。
  テスト失敗時の診断と修正ガイダンスも提供。
  Use when: テスト実行、テスト追加、テスト失敗、test、vitest、playwright、E2E
user-invocable: true
argument-hint: "[gate|unit|e2e|smoke|eval|all（デフォルト: all）]"
---

# テスト実行スキル

## Preamble（実行前チェック）

1. CLAUDE.md を読み、テストコマンド一覧を確認する
2. `kiyaku-assist-v2/node_modules/` が存在することを確認（なければ `npm install`）
3. 実行モード（gate/unit/e2e/smoke/eval/all）を引数から決定する

## 実行モード

### `/run-tests gate` — Gate テスト（高速、コミット前に必須）
```bash
cd kiyaku-assist-v2 && npm run test:gate
```
- TypeScript 型チェック + ESLint を実行
- LLM 呼び出しなし、数秒で完了
- **コミット前に必ず実行する**

### `/run-tests unit` — ユニットテスト
```bash
cd kiyaku-assist-v2 && npm run test
```
- Vitest 4 を使用
- 対象: `src/domains/**/__tests__/*.test.ts`, `src/shared/__tests__/*.test.ts`, `src/app/api/__tests__/*.test.ts`
- 設定: `vitest.config.ts`

### `/run-tests e2e` — E2E テスト（全体）
```bash
cd kiyaku-assist-v2 && npx playwright test
```
- Playwright 1.58 を使用
- 設定: `playwright.config.ts`
- 認証: `e2e/auth.setup.ts` で事前セットアップ（ストレージ状態を再利用）
- テストデータ: `e2e/fixtures/sample-bylaws.txt`

### `/run-tests smoke` — スモークテスト
```bash
cd kiyaku-assist-v2 && npx playwright test --grep "@smoke"
```
- ログイン → 基本動線の確認のみ
- 所要時間: 1-2分

### `/run-tests eval` — AI 評価テスト
```bash
cd kiyaku-assist-v2 && npx vitest run src/domains/analysis/__tests__/analyzer.eval.test.ts
```
- AI 出力品質の評価（ギャップ分析の精度測定）
- API 呼び出しを含むため ANTHROPIC_API_KEY が必要
- 実行時間: 3-5分

### `/run-tests all` or `/run-tests`（デフォルト）
unit → e2e の順次実行。

## テスト失敗時の診断ガイド

### ユニットテスト失敗
1. エラーメッセージを確認
2. 失敗したテストファイルと対応するソースファイルを読む
3. 型エラーの場合: `types.ts` と `schemas.ts` の不整合を確認
4. モック関連: `vi.mock()` の設定を確認

### E2E テスト失敗
1. スクリーンショット・トレースを確認（`test-results/` or `playwright-report/`）
2. 認証失敗: `e2e/auth.setup.ts` のログイン情報を確認
3. セレクタ不一致: `data-test` 属性がコンポーネントに付与されているか確認
4. タイムアウト: SSE 長時間処理の待機時間を調整
5. `returnUrl` バグ: ログイン後のリダイレクト先が正しいか確認

### AI 評価テスト失敗
1. API キーの有効性を確認
2. レスポンス形式の変更を確認（Claude API のバージョンアップ）
3. 評価基準のしきい値を確認・調整

## テスト追加のガイドライン
- ドメインロジックのテスト: `src/domains/{domain}/__tests__/{feature}.test.ts`
- API ルートのテスト: `src/app/api/__tests__/{endpoint}.test.ts`
- E2E テスト: `e2e/{feature}.spec.ts`
- セレクタ: `data-test` 属性を使用（CSS クラスやタグ名は使わない）
- E2E テストの本質: ユーザー操作の再現（スモークテストとジャーニーテストを分離）

## 参照
- [references/e2e-setup.md](references/e2e-setup.md) — E2E テスト基盤の詳細

## エスカレーションプロトコル

以下の条件で作業を停止し、ユーザーに報告する:

- **3回の試行失敗**: 同じアプローチを3回試して解決しない場合
- **セキュリティの不確実性**: 認証、データ漏洩、非弁リスクに関する判断に迷う場合
- **ドメイン境界の逸脱**: 修正が複数ドメインにまたがり、影響範囲が不明確な場合

報告フォーマット:
- **REASON**: なぜ停止したか
- **ATTEMPTED**: 試行した内容（最大3つ）
- **RECOMMENDATION**: 推奨する次のステップ

## 完了報告

実行結果を以下のいずれかで報告する:
- **DONE**: 全テスト通過
- **DONE_WITH_CONCERNS**: テスト通過したが flaky テストや警告あり（詳細提示）
- **BLOCKED**: テスト環境のセットアップに失敗（依存不足等）
- **NEEDS_CONTEXT**: 実行モードまたはテスト対象の指定が必要
