# データフロー

## 全体フロー

```
[ユーザー]
  |
  v
1. アップロード（PDF/Word/テキスト）
  |
  v
2. パース（ingestion）
  | ParsedArticle[] + ParseMetadata
  v
3. ギャップ分析（analysis）
  | GapAnalysisItem[]
  v
4. ドラフト生成（drafting）
  | DraftResult[] -> ReviewArticle[]（Firestore 保存）
  v
5. レビュー（review）
  | ReviewArticleState（adopted/modified/pending）
  v
6. エクスポート（export）
  | Markdown / CSV / PDF
  v
[出力ファイル]
```

## 各ステップの詳細

### 1. アップロード -> パース

```
ファイル(PDF/DOCX/TXT)
  |
  +-> parsers/index.ts（ファイル形式判定）
  |     |
  |     +-> pdf-parser.ts   -- pdf-parse v2（動的 import）
  |     +-> docx-parser.ts  -- mammoth
  |     +-> text-parser.ts  -- 正規表現パース
  |
  +-> normalizer.ts（章番号推定、条番号統一）
  |
  v
ParseResult { articles: ParsedArticle[], metadata: ParseMetadata }
  |
  +-> Zustand store（クライアント側 sessionStorage）
  +-> Firestore（サーバー側永続化）
```

### 2. ギャップ分析

```
ParsedArticle[]
  |
  +-> retriever.ts
  |     |
  |     +-> shared/ai/search.ts（Vertex AI Search）
  |     |     standardText を RAG で取得
  |     |
  |     v
  |   RetrievalResult[]（関連する標準管理規約の条文）
  |
  +-> analyzer.ts
  |     |
  |     +-> shared/ai/claude.ts（Claude Sonnet — tool_use）
  |     +-> shared/ai/cache.ts（キャッシュ確認 -> ヒットなら API 呼び出しスキップ）
  |     |
  |     +-- バッチ: 最大10条文/回、最大8並列
  |     |
  |     v
  |   GapAnalysisItem[]
  |
  +-> SSE で進捗通知（api/analysis/start/route.ts）
  |
  v
GapAnalysisItem[] -> Zustand store + Firestore
```

### 3. ドラフト生成

```
GapAnalysisItem[] + CondoContext
  |
  +-> drafter.ts
  |     |
  |     +-> shared/ai/search.ts（Vertex AI Search — RAG）
  |     +-> shared/ai/claude.ts（Claude Sonnet）
  |     +-> shared/ai/cache.ts（キャッシュ）
  |     |
  |     v
  |   DraftResult[]
  |
  +-> SSE で進捗通知（api/drafting/generate/route.ts）
  |
  v
DraftResult[] -> ReviewArticle[]（Firestore に保存）
```

### 4. レビュー

```
ReviewArticle[]（Firestore から取得）
  |
  +-> state-machine.ts
  |     |
  |     +-- ReviewEvent（ADOPT / MODIFY / RESET / ADD_MEMO）
  |     +-- applyEvent() で新しい状態を計算（イミュータブル）
  |     |
  |     v
  |   ReviewArticleState
  |
  +-> history.ts（修正履歴管理）
  |
  v
更新された ReviewArticle -> Firestore に保存
```

### 5. エクスポート

```
ReviewArticle[]（Firestore から取得、フィルタ適用）
  |
  +-> presentation.ts（共通整形: 差分ハイライト、章グルーピング）
  |     |
  |     v
  |   ExportArticle[]（整形済み）
  |
  +-> generators/
  |     |
  |     +-> markdown.ts  -> .md ファイル
  |     +-> csv.ts       -> .csv ファイル
  |     +-> pdf.tsx      -> .pdf ファイル（@react-pdf/renderer）
  |
  v
ExportResult { content, filename, mimeType }
```

## standardText の RAG フロー

```
条文テキスト（クエリ）
  |
  v
Vertex AI Search（Discovery Engine API）
  |  データストア: standard-rules-ds
  |  エンジン: standard-rules-engine
  |  ADC で認証
  |
  v
SearchResult[]（content, metadata, relevanceScore）
  |
  +-> relevanceScore >= 0.3 でフィルタリング
  |
  v
RetrievedDocument[]
  |
  +-> analyzer.ts（分析プロンプトのコンテキストとして使用）
  +-> drafter.ts（ドラフト生成プロンプトのコンテキストとして使用）
  +-> rag.ts（チャット回答のコンテキストとして使用）
```

## キャッシュ戦略

```
リクエスト
  |
  +-> sha256Hash(リクエスト内容) -> cacheKey
  |
  +-> Firestore aiCache コレクション
  |     |
  |     +-- GET: cacheKey でドキュメント取得
  |     |     |
  |     |     +-> 存在 & 未期限切れ -> キャッシュヒット（API 呼び出しスキップ）
  |     |     +-> 存在 & 期限切れ   -> 遅延削除 -> キャッシュミス
  |     |     +-> 不存在           -> キャッシュミス
  |     |
  |     +-- SET: API レスポンスを保存（TTL 30日）
  |
  v
レスポンス
```

## フォールバック戦略

| 機能 | 正常時 | フォールバック |
|------|--------|--------------|
| 標準管理規約テキスト | Vertex AI Search（RAG） | コンテンツスタッフィング（ローカルデータ） |
| データ永続化 | Firestore | localStorage（デモモード） |
| AI レスポンスキャッシュ | Firestore aiCache | キャッシュなし（毎回 API 呼び出し） |
| 認証 | Firebase Auth | 未認証でもデモモード利用可 |
