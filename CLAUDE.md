# キヤクアシスト — プロジェクト設定

マンション管理規約の全面改定を支援するウェブアプリ「キヤクアシスト v2」の開発プロジェクト。
改正区分所有法（2026年4月施行）および令和7年改正標準管理規約に準拠。

## リポジトリ構成

```
d3m_condo_bylaws_pj/
├── CLAUDE.md                  # このファイル（統合プロジェクト設定）
├── kiyaku-assist-v2/          # Next.js ウェブアプリ（git リポジトリ）
├── docs/                      # プロジェクトドキュメント
│   ├── project_context.md     # マスタードキュメント
│   ├── prd_kiyaku_assist.md   # PRD v0.2
│   └── output_quality_design_philosophy.md
├── data/                      # 法律基準・実務資料
│   ├── mlit/                  # 国交省（標準管理規約 新旧対照表等）
│   ├── moj/                   # 法務省（区分所有法改正資料）
│   ├── nihon-housing/         # 日本ハウジング規約案・レビュー結果
│   └── bylaws-drafts/         # 規約改正案 docx
├── scripts/                   # ユーティリティスクリプト
└── .claude/
    └── skills/                # 9個のカスタムスキル
```

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router), React 19, TypeScript 5 |
| スタイル | Tailwind CSS 4, shadcn/ui, Radix UI |
| 状態管理 | Zustand (クライアント/sessionStorage), Firestore (永続化) |
| AI / 生成 | Claude API (`@anthropic-ai/sdk`) — tool_use で構造化出力 |
| RAG 検索 | **Vertex AI Search**（リトリーバー）+ Claude（生成） |
| 認証 | Firebase Authentication（メール/PW + Google） |
| DB | Firestore（セキュリティルール: プロジェクト所有者のみ） |
| ホスティング | Firebase App Hosting (asia-east1) |
| テスト | Vitest (unit), Playwright (E2E) |
| バリデーション | Zod v4 |
| ログ | Pino (構造化ログ) |

### AI モデル使い分け

| 用途 | モデル | 理由 |
|------|--------|------|
| ファイルパース | Claude Haiku 4.5 | 高速・低コスト |
| ギャップ分析・ドラフト生成 | Claude Sonnet 4.5 | 精度重視 |
| チャット Q&A | Claude Sonnet 4.5 | RAG + 対話品質 |

### RAG パイプライン（Vertex AI Search）

- **検索**: Vertex AI Search リトリーバーが令和7年改正標準管理規約から関連条文を取得
- **生成**: Claude が検索結果をもとにギャップ分析・ドラフト・チャット回答を生成
- **キャッシュ**: Firestore `aiCache` コレクション（SHA-256 キー、TTL 30日）
- **無料枠**: 月 10,000 クエリ + 10 GiB ストレージ
- **設定**: `kiyaku-assist-v2/src/shared/ai/search.ts` にリトリーバー設定

## アーキテクチャ — DDD + Clean Architecture

### 依存方向（逆依存は禁止）

```
app/ (API Routes, Pages) → domains/ (ビジネスロジック) → shared/ (横断関心事)
```

### 6ドメイン

| ドメイン | 責務 | 入出力 |
|---------|------|--------|
| ingestion | PDF/Word/テキストのパース | ファイル → `ParseResult` |
| analysis | ギャップ分析（RAG + Claude） | `ParsedArticle[]` → `GapAnalysisItem[]` |
| drafting | 改定条文ドラフト生成 | `GapAnalysisItem` → `DraftResult[]` |
| review | 決定状態管理（イベント駆動） | `ReviewEvent` → `ReviewArticleState` |
| chat | RAG 問答 + 非弁ガードレール | `ChatRequest` → `ChatResponse` |
| export | Markdown/CSV/PDF 出力 | プロジェクト状態 → 各形式 |

ドメイン間の直接依存は禁止。`shared/` 経由の型・ユーティリティのみ使用。

## 開発コマンド

```bash
cd kiyaku-assist-v2

# 開発
npm run dev              # 開発サーバー起動

# ビルド・型チェック
npm run build            # Next.js ビルド
npm run typecheck        # TypeScript 型チェック（tsc --noEmit）
npm run lint             # ESLint

# テスト（3層戦略）
npm run test:gate        # Gate 層: 型チェック + lint（高速、コミット前に必須）
npm run test             # Unit 層: Vitest 全テスト
npm run test:unit        # Unit 層: eval テスト除外
npm run test:eval        # Eval 層: AI 評価テストのみ（EVALS=1、有料）
npm run test:e2e         # E2E 層: Playwright（ブラウザテスト）
npm run test:coverage    # カバレッジ付き
npm run test:ci          # CI 用（JUnit 出力）
```

## 絶対守るべき技術制約

1. **Zod**: `import * as z from "zod/v4"` で統一
2. **"use server" ファイル**: Zod スキーマを export しない（ビルドエラー）
3. **pdf-parse**: 動的 import 必須 — `const pdfParse = (await import("pdf-parse")).default;`
4. **Firebase Client SDK**: モジュールレベルで初期化しない（遅延初期化パターン）
5. **Pino ロガー**: 引数順は `(obj, msg)` — 逆にすると構造化ログが壊れる
6. **standardText**: サーバー側 RAG で取得（クライアントから渡さない）
7. **SSE**: 長時間処理は `ReadableStream` + `TextEncoder`、`apphosting.yaml` で 600秒タイムアウト
8. **serverExternalPackages**: `@anthropic-ai/sdk`, `pino`, `pdf-parse`, `mammoth`, `firebase-admin`

## スキル一覧

### ワークフロー系（ユーザー呼び出し可能）
- `/workflow` — 開発フロー統合（feature/release/review-and-ship）
- `/add-feature` — DDD 準拠の機能追加ステップ（型→ドメイン→テスト→API→UI→E2E）
- `/deploy` — ビルド確認→テスト→push→Firebase 自動デプロイ
- `/review-pr` — 6軸レビュー（アーキテクチャ・セキュリティ・アクセシビリティ等）
- `/run-tests` — テスト実行・診断（gate/unit/e2e/smoke/eval/all）
- `/data-pipeline` — 基準データ取込・Vertex AI Search データストア更新

### 安全系（参照用）
- `careful` — 破壊的コマンド（rm -rf, force push 等）の検知・警告

### 知識系（参照用）
- `kiyaku-architecture` — DDD + Clean Architecture のルール・Firebase パターン
- `accessibility-guide` — WCAG 2.1 AA + 高齢者対応の UI 設計基準
- `lp-design` — ランディングページ設計・実装ガイド

### ドメイン専門（ユーザー呼び出し可能）
- `/mansion-law-expert` — マンション管理士・弁護士視点の規約レビュー

## 環境変数

| 変数名 | 用途 | 管理場所 |
|--------|------|---------|
| `ANTHROPIC_API_KEY` | Claude API | apphosting.yaml (secret) |
| `VERTEX_AI_SEARCH_*` | Vertex AI Search リトリーバー | apphosting.yaml |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase クライアント設定 | apphosting.yaml |

## デプロイ

- **URL**: https://kiyaku-assist--kiyaku-assist.asia-east1.hosted.app
- **方式**: `git push` → Firebase App Hosting 自動デプロイ
- **CI**: GitHub Actions（型チェック → lint → unit テスト → カバレッジ）
- **リソース**: CPU 1, Memory 512 MiB, Max 2 instances, Concurrency 80

## スキル完了ステータス（共通プロトコル）

スキル実行後は以下のいずれかで結果を報告する:

| ステータス | 意味 |
|-----------|------|
| **DONE** | 全ステップ完了、エビデンスあり |
| **DONE_WITH_CONCERNS** | 完了したが既知の問題あり（リスト提示） |
| **BLOCKED** | 続行不可（ブロッカーと試行内容を提示） |
| **NEEDS_CONTEXT** | 必要な情報が不足（質問を提示） |
