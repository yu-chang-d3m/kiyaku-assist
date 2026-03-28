# ドメイン境界定義

6ドメインの責務・入出力型・依存関係の詳細。

## 1. ingestion（規約取り込み）

**責務**: PDF/Word/テキストファイルをアップロード・パースし、構造化 JSON に変換する。

**ディレクトリ**: `src/domains/ingestion/`

**ファイル構成**:
- `types.ts` — `ParsedArticle`, `ParseResult`, `ParseMetadata`, `ArticleParser`
- `parsers/pdf-parser.ts` — PDF パーサー（pdf-parse v2 を動的 import）
- `parsers/docx-parser.ts` — Word パーサー（mammoth）
- `parsers/text-parser.ts` — プレーンテキストパーサー
- `parsers/index.ts` — パーサーファクトリ（ファイル形式に応じて適切なパーサーを返す）
- `normalizer.ts` — パース結果の正規化（章番号推定、条番号フォーマット統一）

**入力**: ファイルバイナリ（PDF/DOCX）またはテキスト
**出力**: `ParseResult`（`ParsedArticle[]` + `ParseMetadata`）

**外部依存**:
- `pdf-parse` v2 — **動的 import 必須**（DOMMatrix 依存）
- `mammoth` — DOCX -> HTML -> テキスト変換

**注意事項**:
- pdf-parse v2 はレタースペーシング・TAB区切り・タイトル行分離等の出力特性がある（前処理で吸収）
- Claude Haiku でパース補助（構造が曖昧な場合）

---

## 2. analysis（ギャップ分析）

**責務**: パースされた現行規約と標準管理規約を比較し、ギャップ（差分）を分析する。

**ディレクトリ**: `src/domains/analysis/`

**ファイル構成**:
- `types.ts` — `GapAnalysisItem`, `AnalysisResult`, `AnalysisSummary`, `RetrievalResult`, `RetrievedDocument`
- `analyzer.ts` — Claude tool_use によるバッチ分析（最大10条文/回、最大8並列）
- `retriever.ts` — Vertex AI Search から標準管理規約の関連条文を取得

**入力**: `ParsedArticle[]`（ingestion の出力）
**出力**: `GapAnalysisItem[]`（条文ごとのギャップ分析結果）

**外部依存**:
- Claude API（Sonnet）— `shared/ai/claude.ts` 経由
- Vertex AI Search — `shared/ai/search.ts` -> `retriever.ts`

**データフロー**:
1. `retriever.ts` が条文テキストで Vertex AI Search を検索
2. 関連する標準管理規約の条文を取得
3. `analyzer.ts` が Claude tool_use で現行 vs 標準のギャップを分析
4. バッチ処理: 最大10条文をまとめて1回の API 呼び出し、最大8並列で実行

---

## 3. drafting（ドラフト生成）

**責務**: ギャップ分析結果とマンション情報をもとに、改定条文ドラフトを生成する。

**ディレクトリ**: `src/domains/drafting/`

**ファイル構成**:
- `types.ts` — `DraftRequest`, `DraftResult`, `BatchDraftResult`, `CondoContext`, `DraftProgressCallback`
- `drafter.ts` — Claude API + RAG でドラフト生成。附則の自動生成を含む

**入力**: `GapAnalysisItem` + `CondoContext`（マンション属性）
**出力**: `DraftResult`（生成されたドラフト本文、要約、解説、参照先）

**外部依存**:
- Claude API（Sonnet）— `shared/ai/claude.ts` 経由
- Vertex AI Search — RAG で標準管理規約の条文を参照

**注意事項**:
- `standardText` はサーバー側 RAG で取得（クライアントから渡さない）
- 生成モード: `smart`（重要度別最適化）/ `precise`（1件ずつ丁寧に）
- 附則は対象条文一覧から自動生成

---

## 4. review（レビュー・決定）

**責務**: ドラフト条文に対するユーザーの決定（採用/修正/保留）を管理する。

**ディレクトリ**: `src/domains/review/`

**ファイル構成**:
- `types.ts` — `ArticleDecision`, `ReviewEvent`, `ReviewArticleState`, `ReviewProgress`, `ModificationEntry`
- `state-machine.ts` — イベント駆動の状態遷移マシン（イミュータブル）
- `history.ts` — 修正履歴の管理

**入力**: `ReviewEvent`（ADOPT / MODIFY / RESET / ADD_MEMO）
**出力**: `ReviewArticleState`（更新された状態）

**外部依存**: なし（純粋ドメインロジック）

**状態遷移**:
```
null（未決定） --> adopted（採用）
null（未決定） --> modified（修正）
null（未決定） --> pending（保留）
pending --> adopted / modified
adopted / modified --> pending（リセット）
```

---

## 5. chat（チャット Q&A）

**責務**: RAG ベースでユーザーの質問に回答する。非弁ガードレール（弁護士法72条）を適用。

**ディレクトリ**: `src/domains/chat/`

**ファイル構成**:
- `types.ts` — `ChatMessage`, `ChatRequest`, `ChatResponse`, `GuardrailResult`, `RagContext`
- `rag.ts` — Vertex AI Search + Claude で回答生成
- `guardrails.ts` — 非弁ガードレール（法的助言リスクの検知・フィルタリング）

**入力**: `ChatRequest`（ユーザーメッセージ + 会話履歴）
**出力**: `ChatResponse`（回答 + ガードレール判定 + 参照資料）

**外部依存**:
- Claude API（Sonnet）— `shared/ai/claude.ts` 経由
- Vertex AI Search — `shared/ai/search.ts` 経由

**ガードレール判定**:
- `pass` — 問題なし
- `warning` — 法的助言に近い内容（免責文を付記）
- `blocked` — 個別の法的紛争に関する具体的助言（弁護士への相談を推奨）

---

## 6. export（エクスポート）

**責務**: レビュー完了した条文を各種フォーマットで出力する。

**ディレクトリ**: `src/domains/export/`

**ファイル構成**:
- `types.ts` — `ExportArticle`, `ExportOptions`, `ExportFilter`, `ExportResult`, `ExportGenerator`
- `presentation.ts` — 共通整形レイヤー（差分ハイライト、章グルーピング）
- `generators/markdown.ts` — Markdown 生成
- `generators/csv.ts` — CSV 生成
- `generators/pdf.tsx` — PDF 生成（@react-pdf/renderer）
- `generators/index.ts` — ジェネレーターファクトリ

**入力**: `ExportArticle[]` + `ExportOptions`
**出力**: `ExportResult`（コンテンツ + ファイル名 + MIME タイプ）

**外部依存**:
- `@react-pdf/renderer` — PDF 生成

**アーキテクチャ**: 共通整形レイヤー（`presentation.ts`）で条文データを整形した後、各ジェネレーターがフォーマット固有の変換を行う。差分ハイライト（現行 vs 改定案）は共通整形レイヤーで処理。
