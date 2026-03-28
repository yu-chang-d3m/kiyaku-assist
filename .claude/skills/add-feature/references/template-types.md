# 型定義テンプレート集

キヤクアシスト v2 で使用する型定義の標準パターンをまとめる。

## Request / Response パターン

新しい機能を追加する際の基本的な型定義テンプレート。

```typescript
// src/domains/{domain}/types.ts

/** {Feature} のリクエスト型 */
export interface {Feature}Request {
  /** プロジェクト ID */
  projectId: string;
  /** ユーザー ID */
  userId: string;
  // 機能固有のフィールドを追加
}

/** {Feature} のレスポンス型 */
export interface {Feature}Response {
  /** 処理成功フラグ */
  success: boolean;
  /** 処理結果データ */
  data: {Feature}Result;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/** {Feature} の結果データ型 */
export interface {Feature}Result {
  // 機能固有の結果フィールドを定義
}
```

## GapAnalysisItem 型（参考）

分析ドメインで使用されるギャップ分析結果の型。新しい分析系機能の参考にする。

```typescript
// src/domains/analysis/types.ts より

export interface GapAnalysisItem {
  /** 条文番号（例: "第12条"） */
  articleNumber: string;
  /** 条文タイトル */
  articleTitle: string;
  /** 現行規約の内容 */
  currentContent: string;
  /** 標準管理規約の内容 */
  standardContent: string;
  /** 乖離の種類 */
  gapType: 'missing' | 'outdated' | 'conflicting' | 'custom' | 'compliant';
  /** 乖離の深刻度 */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** 改正が必要な理由 */
  reason: string;
  /** 推奨アクション */
  recommendation: string;
  /** 関連する法令条文 */
  relatedLawArticles: string[];
}
```

## ReviewArticle 型（参考）

レビュードメインで使用される条文レビュー結果の型。新しいレビュー系機能の参考にする。

```typescript
// src/domains/review/types.ts より

export interface ReviewArticle {
  /** 条文番号 */
  articleNumber: string;
  /** 条文タイトル */
  articleTitle: string;
  /** レビューステータス */
  status: 'approved' | 'needs_revision' | 'pending' | 'flagged';
  /** レビューコメント */
  comments: ReviewComment[];
  /** 法的リスクレベル */
  legalRisk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** 強行規定違反の有無 */
  violatesMandatoryProvision: boolean;
}

export interface ReviewComment {
  /** コメント種別 */
  type: 'suggestion' | 'warning' | 'error' | 'info';
  /** コメント本文 */
  message: string;
  /** 根拠条文 */
  legalBasis?: string;
}
```

## SSE イベント型パターン

長時間処理の進捗通知に使用する Server-Sent Events の型定義。

```typescript
// src/domains/{domain}/types.ts

/** SSE イベントの共通型 */
export type {Feature}SSEEvent =
  | { type: 'progress'; data: { step: number; totalSteps: number; message: string } }
  | { type: 'partial'; data: Partial<{Feature}Result> }
  | { type: 'complete'; data: {Feature}Result }
  | { type: 'error'; data: { error: string; details?: unknown } };
```

**API Route での SSE 送信パターン:**

```typescript
// src/app/api/{endpoint}/route.ts

export async function POST(request: Request) {
  const body = await request.json();
  // バリデーション...

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'progress', data: { step: 1, totalSteps: 3, message: '処理中...' } })}\n\n`
        ));

        // ドメインロジック呼び出し
        const result = await domainFunction(body);

        // 完了
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'complete', data: result })}\n\n`
        ));
      } catch (error) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'error', data: { error: String(error) } })}\n\n`
        ));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

## Zod スキーマの標準パターン

Zod スキーマは `src/shared/db/schemas.ts` に定義する（`"use server"` ファイルには置かない）。

```typescript
// src/shared/db/schemas.ts

import { z } from 'zod';

/** {Feature} リクエストのバリデーションスキーマ */
export const {feature}RequestSchema = z.object({
  projectId: z.string().min(1, 'プロジェクト ID は必須です'),
  userId: z.string().min(1, 'ユーザー ID は必須です'),
  // 機能固有のフィールド
});

/** {Feature} レスポンスのバリデーションスキーマ */
export const {feature}ResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    // 機能固有の結果フィールド
  }),
  error: z.string().optional(),
});

// 型推論
export type {Feature}RequestInput = z.infer<typeof {feature}RequestSchema>;
```

**Zod スキーマの配置ルール:**

| 配置場所 | 用途 | 注意点 |
|---------|------|-------|
| `src/shared/db/schemas.ts` | Firestore ドキュメントのバリデーション | `"use server"` ファイルには置かない |
| `src/app/api/{endpoint}/route.ts` 内のローカル定義 | API リクエストボディのバリデーション | Route ファイル内に閉じる場合はローカル定義でも可 |
| `src/domains/{domain}/types.ts` | ドメイン固有の入出力バリデーション | 他ドメインから参照しない場合に限りローカル定義可 |
