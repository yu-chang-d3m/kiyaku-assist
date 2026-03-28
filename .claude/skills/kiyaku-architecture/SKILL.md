---
name: kiyaku-architecture
preamble-tier: 2
description: |
  キヤクアシスト v2 のアーキテクチャ知識。DDD + Clean Architecture の境界ルール、
  Firebase 設計パターン、API Route 設計規約、データフロー制約を提供。
  Use when: コード変更、バグ修正、リファクタリング、新機能追加、
  ドメイン層、API Route、Firebase、Firestore、Claude API、Vertex AI Search
---

# キヤクアシスト v2 アーキテクチャガイド

> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。

## アーキテクチャ原則

- **DDD + Clean Architecture** を採用
- **6ドメイン**: ingestion, analysis, drafting, review, chat, export
- **依存方向**: `app/` -> `domains/` -> `shared/`（逆方向の依存は禁止）
- **ドメイン間の直接依存は禁止** — ドメイン間でデータを受け渡す場合は `shared/` 経由の型・ユーティリティのみ使用可
- ディレクトリ構造:
  - `src/app/` — Next.js App Router（ページ、API Route、レイアウト）
  - `src/domains/{name}/` — ドメインロジック（types.ts, ビジネスロジック, テスト）
  - `src/shared/` — 横断関心事（DB, AI, Auth, Observability, Store）

## 絶対守るべき技術制約

1. **`"use server"` ファイルから Zod スキーマを export しない** — ビルドエラーになる。スキーマは `shared/db/schemas.ts` に分離する
2. **サーバー側は必ず Firebase Admin SDK** — Client SDK だと `request.auth` が null で `PERMISSION_DENIED` エラー。`shared/db/admin.ts` の `getAdminDb()` を使う
3. **`pdf-parse` は動的 import 必須** — DOMMatrix 依存でグローバル汚染するため、静的 import だと全 Route がクラッシュする。`const pdfParse = (await import("pdf-parse")).default;` パターンで使用
4. **Pino ロガーは `(obj, msg)` の引数順** — `logger.info({ key: value }, "メッセージ")` が正しい。逆にすると obj がメッセージ扱いされ構造化ログが壊れる
5. **Zod は `import * as z from "zod/v4"` で統一** — `zod` ではなく `zod/v4` を使用
6. **`next.config.ts` の `serverExternalPackages`** に以下を含める: `@anthropic-ai/sdk`, `pino`, `pdf-parse`, `mammoth`, `firebase-admin`
7. **Firebase Client SDK は遅延初期化** — モジュールレベルで初期化するとビルド時に `auth/invalid-api-key` エラー。`shared/db/firestore.ts` の `getDb()` / `getFirebaseAuth()` パターンに従う
8. **`standardText`（標準管理規約テキスト）はサーバー側 RAG で取得** — クライアントから渡すのは NG。Vertex AI Search -> `retriever.ts` 経由で取得する

## SSE パターン

- 長時間処理（分析・ドラフト・チャット）は **SSE（Server-Sent Events）** で進捗通知
- `ReadableStream` + `TextEncoder` パターンで実装
- `apphosting.yaml` の `maxRequestTimeoutSeconds: 600` で10分まで対応
- SSE イベント形式: `data: ${JSON.stringify(payload)}\n\n`

## 状態管理

- **クライアント**: Zustand + `sessionStorage`（タブ単位の永続化）— `shared/store.ts`
- **サーバー**: Firestore（永続化）— `shared/db/server-actions.ts` + `shared/db/admin.ts`
- **AI キャッシュ**: Firestore `aiCache` コレクション（SHA-256 ハッシュキー、TTL 30日）— `shared/ai/cache.ts`

## AI モデル使い分け

| 用途 | モデル | 定数 |
|------|--------|------|
| 規約パース（高速・低コスト） | Claude Haiku 4.5 | `MODELS.PARSE` |
| ギャップ分析・ドラフト生成 | Claude Sonnet 4.5 | `MODELS.ANALYSIS` |
| チャット Q&A | Claude Sonnet 4.5 | `MODELS.CHAT` |

## エスカレーションプロトコル

以下の条件で作業を停止し、ユーザーに報告する:

- **3回の試行失敗**: 同じアプローチを3回試して解決しない場合
- **セキュリティの不確実性**: 認証、データ漏洩、非弁リスクに関する判断に迷う場合
- **ドメイン境界の逸脱**: 修正が複数ドメインにまたがり、影響範囲が不明確な場合

報告フォーマット:
- **REASON**: なぜ停止したか
- **ATTEMPTED**: 試行した内容（最大3つ）
- **RECOMMENDATION**: 推奨する次のステップ

## 参照ファイル

詳細な設計情報は以下を参照:

- [references/domain-boundaries.md](references/domain-boundaries.md) — 6ドメインの責務・型・依存関係
- [references/firebase-patterns.md](references/firebase-patterns.md) — Firebase SDK 使い分け・セキュリティルール・キャッシュ層
- [references/api-conventions.md](references/api-conventions.md) — API Route 設計パターン・認証・SSE・バッチ処理
- [references/data-flow.md](references/data-flow.md) — 全データフロー・RAG フロー・キャッシュ戦略・フォールバック
