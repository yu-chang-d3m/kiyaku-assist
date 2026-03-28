# Vertex AI Search（Discovery Engine）操作手順

## 前提

- GCP プロジェクト: `kiyaku-assist`
- リージョン: `global`
- データストア ID: `standard-rules-ds`
- エンジン ID: `standard-rules-engine`
- 認証: ADC（`gcloud auth application-default login`）
- 無料枠: 月10,000クエリ + 10GiB ストレージ

## データストアの作成（初回のみ）

```bash
# データストア作成
gcloud discovery-engine data-stores create standard-rules-ds \
  --project=kiyaku-assist \
  --location=global \
  --display-name="Standard Rules Datastore" \
  --industry-vertical=GENERIC \
  --content-config=CONTENT_REQUIRED

# 検索エンジン作成
gcloud discovery-engine engines create standard-rules-engine \
  --project=kiyaku-assist \
  --location=global \
  --display-name="Standard Rules Search Engine" \
  --data-store-ids=standard-rules-ds \
  --solution-type=SOLUTION_TYPE_SEARCH
```

## ドキュメントのインポート

```bash
# GCS にアップロード
gsutil -m cp kiyaku-assist-v2/data/*.md gs://kiyaku-assist-data/standard-rules/

# データストアにインポート（GCS ソース）
gcloud discovery-engine documents import \
  --data-store=standard-rules-ds \
  --project=kiyaku-assist \
  --location=global \
  --source=gcs \
  --gcs-uri="gs://kiyaku-assist-data/standard-rules/*.md" \
  --auto-generate-ids
```

## 検索テスト

```bash
# CLI でテストクエリ
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://discoveryengine.googleapis.com/v1/projects/kiyaku-assist/locations/global/collections/default_collection/engines/standard-rules-engine/servingConfigs/default_search:search" \
  -d '{"query": "共用部分の変更", "pageSize": 5}'
```

## アプリケーション側の設定

- `src/shared/ai/search.ts` がリトリーバーとして Vertex AI Search を呼び出す
- 環境変数（`apphosting.yaml`）:
  - `VERTEX_AI_SEARCH_DATASTORE_ID=standard-rules-ds`
  - `VERTEX_AI_SEARCH_ENGINE_ID=standard-rules-engine`
  - `GCP_PROJECT_ID=kiyaku-assist`
  - `GCP_LOCATION=global`

## フォールバック

- Vertex AI Search 未設定時: リトリーバーが空配列を返す → AI がコンテンツスタッフィングで動作
- 検索失敗時: 章単位の全文を返す（`src/shared/ai/search.ts` 内のフォールバックロジック）

## トラブルシューティング

- **認証エラー**: `gcloud auth application-default login` で再認証
- **データストアが見つからない**: `gcloud discovery-engine data-stores list --project=kiyaku-assist --location=global` で確認
- **インデックス未完了**: インポート後、インデックス構築に数分〜数十分かかる場合がある
