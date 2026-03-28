---
name: add-feature
description: |
  キヤクアシスト v2 への機能追加ワークフロー。
  DDD + Clean Architecture に準拠した実装手順を提供。
  型定義→ドメインロジック→テスト→API Route→UI→E2Eテストの順序で実装。
  Use when: 機能追加、新機能、feature、ステップ追加、画面追加
user-invocable: true
argument-hint: "[追加する機能の説明]"
---

# 機能追加ワークフロー

このスキルは DDD + Clean Architecture に準拠した機能追加の標準フローを提供する。

## Preamble（実行前チェック）

1. CLAUDE.md を読み、プロジェクト設定・技術制約を確認する
2. `kiyaku-assist-v2/src/domains/` で対象ドメインの存在を確認
3. 追加する機能が既存ドメインの責務に合致するか検証する

## Step 1: 要件確認
- PRD (`/Users/uchan/d3m_condo_bylaws_pj/docs/prd_kiyaku_assist.md`) の該当ステップ（F0-F6）を特定
- 既存のユーザージャーニー（F0始める → F1理解する → F2現状把握 → F3分析する → F4改正案作る → F5合意形成 → F6エクスポート）のどこに位置するか確認
- 対象ドメイン（ingestion / analysis / drafting / review / chat / export）を特定

## Step 2: 型定義
- `src/domains/{domain}/types.ts` に Request/Response 型を追加
- 命名規約: `{Feature}Request`, `{Feature}Response`
- Zod スキーマが必要な場合は `src/shared/db/schemas.ts` に定義（`"use server"` ファイルには置かない）
- 型テンプレートは [references/template-types.md](references/template-types.md) を参照

## Step 3: ドメインロジック
- `src/domains/{domain}/` にビジネスロジックを実装
- 依存方向を守る: domains/ → shared/ のみ（app/ や他の domain には依存しない）
- AI 呼び出しが必要な場合: `src/shared/ai/claude.ts` の共通クライアントを使用、tool_use で構造化出力
- RAG が必要な場合: `src/shared/ai/search.ts` のリトリーバーを使用

## Step 4: ユニットテスト
- `src/domains/{domain}/__tests__/{feature}.test.ts` にテストを作成
- Vitest を使用
- ドメインロジックのテストカバレッジ: 正常系 + 異常系 + エッジケース
- AI 依存部分はモック化

## Step 5: API Route
- `src/app/api/{endpoint}/route.ts` にエンドポイントを追加
- 認証: Firebase Auth トークン検証（必要に応じて）
- バリデーション: Zod スキーマで入力検証
- エラーレスポンス: `{ error: string, details?: unknown }` 形式で統一
- 長時間処理: SSE（`ReadableStream` + `TextEncoder`）で進捗通知
- AI モデル選択: パース系 = Haiku、分析・ドラフト・チャット = Sonnet

## Step 6: UI ページ
- `src/app/{page}/page.tsx` にページコンポーネントを実装
- `"use client"` ディレクティブを付与
- 認証ガード: `AuthGuard` HOC でラップ
- 状態管理: Zustand ストア（`src/shared/store.ts`）に状態を追加
- UIコンポーネント: shadcn/ui（`src/components/ui/`）を使用
- アクセシビリティ: WCAG 2.1 AA 準拠（Noto Sans JP, 44x44px タッチターゲット, コントラスト比 4.5:1）
- ジャーニー進捗バーの更新（`src/shared/journey.ts`）

## Step 7: E2E テスト
- `kiyaku-assist-v2/e2e/{feature}.spec.ts` にシナリオを追加
- Playwright を使用
- `auth.setup.ts` の認証セットアップを再利用
- `data-test` 属性でセレクタを指定（CSS セレクタは使わない）
- スクリーンショットを記録

## Step 8: 整合性チェック
実装完了後、以下を確認（詳細は [references/checklist.md](references/checklist.md) を参照）:
- [ ] ドメイン境界違反がないか（domains/ 間の直接依存は禁止）
- [ ] `next.config.ts` の `serverExternalPackages` に新しい外部パッケージを追加したか
- [ ] `package-lock.json` と `package.json` が同期しているか
- [ ] Firestore セキュリティルール（`firestore.rules`）の更新が必要か
- [ ] `apphosting.yaml` に新しい環境変数の追加が必要か
- [ ] ビルド（`npm run build`）が通るか
- [ ] ユニットテスト（`npm run test`）が全通過するか

## 参照ファイル

- [references/checklist.md](references/checklist.md) — 整合性チェックリスト詳細（よくある失敗パターン付き）
- [references/template-types.md](references/template-types.md) — 型定義テンプレート集

## 完了報告

実行結果を以下のいずれかで報告する:
- **DONE**: 型定義→ドメインロジック→テスト→API→UI→E2E の全ステップ完了
- **DONE_WITH_CONCERNS**: 実装完了だがテスト不足や設計上の懸念あり（詳細提示）
- **BLOCKED**: アーキテクチャ制約との衝突や依存関係の問題で続行不可
- **NEEDS_CONTEXT**: 要件の詳細やドメイン配置の判断にユーザー確認が必要
