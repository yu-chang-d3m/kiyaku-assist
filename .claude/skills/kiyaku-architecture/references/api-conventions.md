# API Route 設計規約

## ディレクトリ構造（Next.js App Router）

```
src/app/api/
  ingestion/
    parse/route.ts           # POST: ファイルパース
  analysis/
    start/route.ts           # POST: ギャップ分析開始（SSE）
    [projectId]/route.ts     # GET: 分析結果取得
  drafting/
    generate/route.ts        # POST: バッチドラフト生成（SSE）
    single/route.ts          # POST: 単一条文のドラフト生成
    auto-generate/route.ts   # POST: 自動生成（全条文一括）
  review/
    ...                      # レビュー操作
  chat/
    route.ts                 # POST: チャットメッセージ送信
    stream/route.ts          # POST: チャットストリーミング（SSE）
  export/
    route.ts                 # POST: エクスポート生成
  project/
    ...                      # プロジェクト CRUD
  admin/
    clear-cache/route.ts     # POST: AI キャッシュクリア
    clear-data/route.ts      # POST: データクリア
```

## 認証パターン

API Route での Firebase Auth トークン検証（必要に応じて実装）:

```typescript
import { getAuth } from "firebase-admin/auth";

async function verifyToken(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}
```

## SSE エンドポイントパターン

長時間処理（分析・ドラフト生成・チャット）は SSE で進捗通知:

```typescript
export async function POST(request: NextRequest) {
  // 1. リクエストボディのバリデーション（Zod）
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "バリデーションエラー", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2. SSE ストリーム生成
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // 3. 進捗通知を送信しながら処理
        send({ type: "progress", current: 0, total: 10 });
        // ... 処理 ...
        send({ type: "complete", data: result });
      } catch (error) {
        send({ type: "error", message: String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

## エラーレスポンス

統一フォーマット:

```typescript
// 400: バリデーションエラー
{ error: "バリデーションエラー: メッセージ", details?: ZodIssue[] }

// 401: 認証エラー
{ error: "認証が必要です" }

// 404: リソース不在
{ error: "プロジェクトが見つかりません" }

// 500: サーバーエラー
{ error: "内部エラーが発生しました", details?: unknown }
```

## バッチ処理

- 分析: 最大 **10条文/回** の Claude API 呼び出し、最大 **8並列**
- ドラフト生成: 条文ごとに RAG 検索 + 生成、並列数は設定可能
- Vertex AI Search: 並列検索数は **3**（`retriever.ts` のデフォルト concurrency）

## バリデーション

- リクエストボディは Zod v4 でバリデーション
- API Route 内でスキーマを定義するか、`shared/db/schemas.ts` から import
- `"use server"` ファイルからは Zod スキーマを export しない（ビルドエラー）
