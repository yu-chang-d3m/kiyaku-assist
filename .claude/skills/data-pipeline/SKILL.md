---
name: data-pipeline
preamble-tier: 3
description: |
  キヤクアシスト v2 の基準データ取込・RAG パイプライン管理スキル。
  国交省 PDF の取込、Markdown 変換、Vertex AI Search データストア更新を管理。
  Use when: データ取込、PDF変換、基準データ更新、RAG、Vertex AI Search、
  データストア、リトリーバー、標準管理規約データ
user-invocable: true
argument-hint: "[ingest|update-rag|verify|status]"
---

# 基準データパイプラインスキル

## Preamble（実行前チェック）

1. CLAUDE.md を読み、RAG パイプライン設定を確認する
2. `gcloud` CLI が利用可能か確認する
3. Vertex AI Search のプロジェクト ID・データストア ID を確認する

## パイプライン概要

```
国交省 PDF → pdftotext → Markdown → 手動校正 → data/ 配置 → Vertex AI Search 登録
```

## 実行モード

### `/data-pipeline ingest` — PDF 取込・変換
1. PDF ファイルのパスを確認
2. `pdftotext -layout {input}.pdf {output}.txt` で テキスト抽出
3. テキストを Markdown に整形:
   - 章・条・項の見出しを `##` `###` に変換
   - 表をMarkdownテーブルに変換
   - 不要なヘッダー・フッター（ページ番号等）を除去
   - レタースペーシング（文字間スペース）を除去（pdf-parse v2 の特性）
   - TAB 区切りの列をスペースに統一
4. `kiyaku-assist-v2/data/` に配置
5. 元 PDF も同じディレクトリに保存（トレーサビリティ）

詳細は [references/pdf-to-markdown.md](references/pdf-to-markdown.md) を参照。

### `/data-pipeline update-rag` — Vertex AI Search 更新
1. GCP プロジェクト確認: `kiyaku-assist`
2. データストア ID: `standard-rules-ds`
3. エンジン ID: `standard-rules-engine`
4. ロケーション: `global`
5. データストアへのドキュメント登録:
   ```bash
   # ドキュメントのインポート（GCS 経由）
   gsutil cp kiyaku-assist-v2/data/*.md gs://kiyaku-assist-data/
   # Discovery Engine API でインポート
   ```
6. インデックス再構築を待機

詳細は [references/vertex-ai-search.md](references/vertex-ai-search.md) を参照。

### `/data-pipeline verify` — リトリーバー検証
1. テストクエリを実行して期待する条文が返るか確認:
   - 「管理組合法人の理事の選任」→ 第49条関連が返ること
   - 「共用部分の変更」→ 第17条関連が返ること
   - 「規約の変更手続き」→ 第31条関連が返ること
2. Top-K の結果を表示
3. 関連度スコアの確認

### `/data-pipeline status` — 現在の状態確認
1. `data/` ディレクトリのファイル一覧とサイズ
2. Vertex AI Search データストアのステータス
3. 最終更新日時

## PDF 前処理の注意点

pdf-parse v2 の出力特性（`src/domains/ingestion/parsers/pdf-parser.ts` で使用）:
- **レタースペーシング**: 「管 理 組 合」のように文字間にスペースが入る → 除去が必要
- **TAB 区切り**: 表の列が TAB で区切られる → スペースまたは `|` に変換
- **タイトル行分離**: 見出しが本文と分離される → 結合が必要
- **ページまたぎ**: 条文がページ境界で分割される → 結合が必要

## 基準データの一覧

| ファイル | 内容 | サイズ目安 | 優先度 |
|---------|------|-----------|--------|
| `mlit_r7_standard_rules.md` | 令和7年改正 標準管理規約本文 | ~111K chars | Must |
| `mlit_r7_shinkyu.md` | 令和7年改正 新旧対照表 | ~113K chars | Must |
| `mlit_r7_overview.md` | 改正概要 | ~3K chars | Should |
| `mlit_r7_procedures.md` | 改正手続留意点 | ~3K chars | Should |

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
- **DONE**: データ取込・変換・データストア更新すべて完了、検証済み
- **DONE_WITH_CONCERNS**: 処理完了だがパース品質に懸念あり（差分提示）
- **BLOCKED**: PDF 変換エラーまたは Vertex AI Search API エラーで続行不可
- **NEEDS_CONTEXT**: 対象ファイルや更新範囲の指定が必要
