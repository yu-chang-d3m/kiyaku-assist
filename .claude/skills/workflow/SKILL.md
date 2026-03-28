---
name: workflow
preamble-tier: 3
description: |
  既存スキルを束ねた開発ワークフロー統合スキル。
  計画→実装→レビュー→テスト→デプロイの直列フローを1コマンドで実行。
  gstack の sequential handoff model に基づく。
  Use when: 機能追加の全工程、リリースフロー、開発サイクル全体の実行
user-invocable: true
argument-hint: "[feature <説明> | release | review-and-ship]"
---

# 開発ワークフロー統合スキル

> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。

## Preamble（実行前チェック）

1. CLAUDE.md を読み、プロジェクト設定を確認する
2. `kiyaku-assist-v2/` で `git status` を確認し、作業ツリーがクリーンであることを確認
3. 引数からワークフローモード（feature / release / review-and-ship）を決定する

## ワークフローモード

### `/workflow feature <説明>` — 機能追加フルフロー

gstack の sequential handoff model に基づき、以下のスキルを直列実行する:

```
Step 1: 計画
  └→ /add-feature <説明>
     - 要件確認 → 型定義 → ドメインロジック → テスト → API → UI → E2E
     - 各ステップ完了ごとに進捗報告

Step 2: レビュー
  └→ /review-pr staged
     - 6軸レビュー（アーキテクチャ・セキュリティ・アクセシビリティ等）
     - 指摘事項があれば修正

Step 3: テスト
  └→ /run-tests all
     - Gate → Unit → E2E の順次実行
     - 失敗時は診断・修正→再実行

Step 4: CHANGELOG 更新
  └→ CHANGELOG.md の [Unreleased] セクションに変更内容を追記
     - ユーザー視点の言葉で記述（「〜できるようになった」等）
     - カテゴリ: 追加 / 変更 / 修正 / 削除

Step 5: デプロイ
  └→ /deploy
     - ビルド確認 → push → Firebase 自動デプロイ
```

**ハンドオフルール:**
- 各ステップの完了ステータスが **DONE** の場合のみ次のステップに進む
- **DONE_WITH_CONCERNS** の場合、懸念事項をユーザーに提示し、続行するか確認する
- **BLOCKED** の場合、ワークフロー全体を停止し、ブロッカーを報告する
- **NEEDS_CONTEXT** の場合、ユーザーに質問し、回答を得てから続行する

### `/workflow release` — リリースフロー

コードの変更なしに、現在の状態をリリースする:

```
Step 1: CHANGELOG 更新
  └→ CHANGELOG.md の [Unreleased] セクションの内容を新バージョンセクションに移動
     - バージョン番号と日付を付与（例: [0.2.0] - 2026-04-01）
     - ユーザー視点の言葉で記述されているか確認
     - 空の [Unreleased] セクションを再作成
     - 変更をコミットに含める

Step 2: テスト
  └→ /run-tests all

Step 3: レビュー（最終差分確認）
  └→ /review-pr staged（または最新コミットの差分）

Step 4: デプロイ
  └→ /deploy
```

### `/workflow review-and-ship` — レビュー＋シップ

既に実装済みのコードをレビューしてデプロイする:

```
Step 1: レビュー
  └→ /review-pr staged

Step 2: テスト
  └→ /run-tests gate
  └→ /run-tests unit

Step 3: CHANGELOG 更新
  └→ CHANGELOG.md の [Unreleased] セクションに変更内容を追記
     - ユーザー視点の言葉で記述（「〜できるようになった」等）
     - カテゴリ: 追加 / 変更 / 修正 / 削除

Step 4: デプロイ（レビュー・テスト通過時のみ）
  └→ /deploy
```

## エスカレーションプロトコル

以下の条件で作業を停止し、ユーザーに報告する:

- **3回の試行失敗**: 同じアプローチを3回試して解決しない場合
- **セキュリティの不確実性**: 認証、データ漏洩、非弁リスクに関する判断に迷う場合
- **ドメイン境界の逸脱**: 修正が複数ドメインにまたがり、影響範囲が不明確な場合

報告フォーマット:
- **REASON**: なぜ停止したか
- **ATTEMPTED**: 試行した内容（最大3つ）
- **RECOMMENDATION**: 推奨する次のステップ

## エスカレーションルール

- テスト失敗が **3回連続** した場合: 自動修正を停止し、問題の分析結果をユーザーに提示
- レビュー指摘が **5件以上** の場合: 実装の方向性をユーザーと再確認
- デプロイ失敗時: ロールバック手順を提示し、ユーザーの判断を仰ぐ

## 完了報告

ワークフロー全体の実行結果を以下のいずれかで報告する:
- **DONE**: 全ステップ完了、デプロイ成功
- **DONE_WITH_CONCERNS**: デプロイ完了だがレビュー懸念やテスト警告あり（詳細提示）
- **BLOCKED**: いずれかのステップでブロック（ステップ名とブロッカーを提示）
- **NEEDS_CONTEXT**: ワークフロー続行にユーザー判断が必要
