# コントリビューションガイド

このプロジェクトへの貢献方法をまとめたガイドです。
技術的な詳細は [CLAUDE.md](./CLAUDE.md) を参照してください。

## 開発環境のセットアップ

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd d3m_condo_bylaws_pj

# 2. セットアップスクリプトを実行
bin/dev-setup
```

`bin/dev-setup` は以下を自動実行します:

- Node.js >= 22 の確認
- `kiyaku-assist-v2/` の npm 依存インストール (`npm ci`)
- Python venv の作成と依存インストール
- Git hooks の確認
- `.env.local` テンプレートのコピー

## ブランチ戦略

```
feature/xxx → main
```

- `main` ブランチが本番。`git push` で Firebase App Hosting に自動デプロイされる
- 機能開発は `feature/<機能名>` ブランチで行い、PR 経由で `main` にマージする
- ホットフィックスは `fix/<修正内容>` ブランチを使用する

## コミット規約

[Conventional Commits](https://www.conventionalcommits.org/) に準拠する。

| プレフィックス | 用途 |
|---------------|------|
| `feat:` | 新機能の追加 |
| `fix:` | バグ修正 |
| `refactor:` | リファクタリング（機能変更なし） |
| `chore:` | ビルド・設定・依存の変更 |
| `docs:` | ドキュメントの変更 |

```bash
# 例
git commit -m "feat: レビュー画面にカテゴリフィルタを追加"
git commit -m "fix: SSE 接続切断時のリカバリ処理を修正"
```

## テスト実行手順

3層テスト戦略を採用している。コミット前に少なくとも Gate 層を通すこと。

```bash
cd kiyaku-assist-v2

# 1. Gate 層（型チェック + lint） — コミット前に必須
npm run test:gate

# 2. Unit 層（Vitest）
npm run test          # 全テスト
npm run test:unit     # eval テスト除外

# 3. E2E 層（Playwright）
npm run test:e2e

# その他
npm run test:eval     # AI 評価テスト（EVALS=1、API 課金あり）
npm run test:coverage # カバレッジ付き
```

`pre-commit` hook で `test:gate` が自動実行される。

## PR レビュー基準

`/review-pr` スキルが以下の6軸でレビューを実施する:

1. **アーキテクチャ** — DDD + Clean Architecture の依存方向、ドメイン境界
2. **セキュリティ** — 認証・認可、Firestore セキュリティルール、秘密情報の漏洩
3. **アクセシビリティ** — WCAG 2.1 AA 準拠、高齢者対応の UI 設計
4. **パフォーマンス** — バンドルサイズ、API レスポンス、SSE タイムアウト
5. **テスト** — テストカバレッジ、境界値、エラーケース
6. **ドメイン正確性** — 区分所有法・標準管理規約との整合性

## CHANGELOG 更新ルール

- [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) フォーマットに準拠
- ユーザー視点の言葉で記述する（内部実装の詳細は省く）
- PR マージ時に `[Unreleased]` セクションに追記する
- リリース時に `[Unreleased]` をバージョン番号 + 日付に変更する
- カテゴリ: `追加` / `変更` / `修正` / `削除` / `非推奨` / `セキュリティ`

## スキル開発ガイド

カスタムスキルは `.claude/skills/` に配置する。

```
.claude/skills/
├── <skill-name>.md          # スキル定義ファイル
```

### テンプレート駆動

- `scripts/skill-template.md.tmpl` をベースにスキルを作成する
- `scripts/gen-skill-docs.sh` で SKILL.md を再生成できる

```bash
# 全スキル再生成
./scripts/gen-skill-docs.sh

# 指定スキルのみ
./scripts/gen-skill-docs.sh deploy
```

### スキル使用ログ

```bash
./scripts/log-skill-usage.sh <skill> <outcome> [duration_s]
# 例: ./scripts/log-skill-usage.sh deploy success 45
```

### 完了ステータス

スキル実行後は以下のいずれかで結果を報告する:

| ステータス | 意味 |
|-----------|------|
| `DONE` | 全ステップ完了 |
| `DONE_WITH_CONCERNS` | 完了したが既知の問題あり |
| `BLOCKED` | 続行不可 |
| `NEEDS_CONTEXT` | 情報不足 |

## DDD + Clean Architecture の依存ルール

```
app/ (API Routes, Pages) → domains/ (ビジネスロジック) → shared/ (横断関心事)
```

- **逆方向の依存は禁止**: `shared/` が `domains/` を、`domains/` が `app/` を参照してはならない
- **ドメイン間の直接依存は禁止**: `shared/` 経由の型・ユーティリティのみ使用する
- 6ドメイン: `ingestion` / `analysis` / `drafting` / `review` / `chat` / `export`

## 技術制約

コードを書く際に必ず守ること。詳細は [CLAUDE.md](./CLAUDE.md) を参照。

| 制約 | 理由 |
|------|------|
| `import * as z from "zod/v4"` で統一 | Zod v4 の正しい import パス |
| `"use server"` ファイルで Zod スキーマを export しない | Next.js ビルドエラーの原因 |
| `pdf-parse` は動的 import 必須 | サーバー専用モジュール |
| Firebase Client SDK はモジュールレベルで初期化しない | 遅延初期化パターンが必要 |
| Pino ロガーの引数順は `(obj, msg)` | 逆にすると構造化ログが壊れる |
| `standardText` はサーバー側 RAG で取得 | クライアントから渡さない |
| SSE は `ReadableStream` + `TextEncoder` | 600秒タイムアウト対応 |

## クリーンアップ

開発環境をクリーンアップする場合:

```bash
bin/dev-teardown
```
