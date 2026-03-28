---
name: deploy
preamble-tier: 3
description: |
  キヤクアシスト v2 のデプロイワークフロー。
  ビルド確認→テスト実行→Git push→Firebase App Hosting 自動デプロイの安全なフロー。
  Use when: デプロイ、リリース、本番反映、push
user-invocable: true
argument-hint: "[確認メッセージ（省略可）]"
---

# デプロイワークフロー

キヤクアシスト v2 を本番環境にデプロイする安全なフローを実行する。

> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。

## Preamble（実行前チェック）

1. CLAUDE.md を読み、プロジェクト設定を確認する
2. `kiyaku-assist-v2/` ディレクトリが存在することを確認
3. `git status` で現在のブランチが `main` であることを確認

> **注意**: Preamble のチェックでブロッカーが見つかった場合は、ワークフローを開始せず即座に **BLOCKED** または **NEEDS_CONTEXT** で報告する。

## プロジェクトパス

- リポジトリルート（Git）: `/Users/uchan/d3m_condo_bylaws_pj`
- アプリディレクトリ（npm）: `/Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2`

## ワークフロー手順

### 1. 事前チェック

```bash
cd /Users/uchan/d3m_condo_bylaws_pj
git status
```

- 未コミットの変更がある場合は、ユーザーに内容を提示して「コミットしてからデプロイするか」を確認する
- 未コミットの変更がなければ次のステップへ
- **CHANGELOG.md 確認**: `CHANGELOG.md` の `[Unreleased]` セクションに今回の変更が記載されているか確認する。未記載の場合はユーザーに「CHANGELOG を更新してからデプロイするか」を確認する

### 2. ビルド確認

```bash
cd /Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2
npm run build
```
（npm コマンドはアプリディレクトリで実行する）

- ビルドエラーが発生した場合:
  - エラー内容を分析し、修正を提案・実行する
  - 修正後に再度 `npm run build` を実行する
  - ビルドが成功するまで繰り返す

### 3. テスト実行

```bash
cd /Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2
npm run test
```

- Vitest ユニットテストを実行する
- テスト失敗がある場合:
  - 失敗内容を分析し、修正を提案・実行する
  - 修正後に再度テストを実行する
  - 全テストが通るまで繰り返す

### 4. package-lock.json 同期確認

```bash
cd /Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2
npm install --package-lock-only
```

```bash
cd /Users/uchan/d3m_condo_bylaws_pj
git diff --name-only
```

- `package-lock.json` に変更があれば、`package.json` との整合性が取れていなかった可能性がある
- 変更があった場合はステージに追加してコミットに含める

### 5. Git コミット & プッシュ

```bash
cd /Users/uchan/d3m_condo_bylaws_pj
git add <変更ファイル>
git commit -m "<変更内容に応じたコミットメッセージ>"
git push origin main
```

- 変更内容を分析して適切なコミットメッセージを作成する
- `git push origin main` で Firebase App Hosting の自動デプロイが発火する

### 6. デプロイ後検証（ビルド監視 → ヘルスチェック）

`git push` 後、以下の 3 段階で本番反映を自動検証する。

#### 6a. ビルド監視

Cloud Build のステータスをポーリングし、ビルド完了を待つ。

```bash
# 最大 5 分間（30 秒間隔 × 10 回）ポーリング
TIMEOUT=300
INTERVAL=30
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(gcloud builds list --project=kiyaku-assist --region=asia-east1 --limit=1 --format='value(status)')
  echo "[${ELAPSED}s] ビルドステータス: $STATUS"

  if [ "$STATUS" = "SUCCESS" ]; then
    echo "✅ ビルド成功"
    break
  elif [ "$STATUS" = "FAILURE" ] || [ "$STATUS" = "CANCELLED" ] || [ "$STATUS" = "TIMEOUT" ]; then
    echo "❌ ビルド失敗: $STATUS"
    # ビルド ID を取得してログ確認コマンドを提示
    BUILD_ID=$(gcloud builds list --project=kiyaku-assist --region=asia-east1 --limit=1 --format='value(id)')
    echo "ログ確認: gcloud builds log $BUILD_ID --project=kiyaku-assist --region=asia-east1"
    break
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "⚠️ タイムアウト（${TIMEOUT}秒）— ビルドがまだ完了していません"
fi
```

- `SUCCESS` → 次のステップ（ヘルスチェック）へ
- `FAILURE` / `CANCELLED` / `TIMEOUT` → **DONE_WITH_CONCERNS** で報告し、ビルドログを提示
- タイムアウト → **DONE_WITH_CONCERNS** で報告し、手動確認を案内

#### 6b. ヘルスチェック

ビルド成功後、本番 URL に HTTP リクエストを送り応答を確認する。

```bash
# コールドスタートを考慮して最大 60 秒待機（15 秒間隔 × 4 回）
HEALTH_URL="https://kiyaku-assist--kiyaku-assist.asia-east1.hosted.app"
HEALTH_TIMEOUT=60
HEALTH_INTERVAL=15
HEALTH_ELAPSED=0

while [ $HEALTH_ELAPSED -lt $HEALTH_TIMEOUT ]; do
  HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL")
  echo "[${HEALTH_ELAPSED}s] HTTP ステータス: $HTTP_STATUS"

  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ ヘルスチェック成功 — 本番 URL が正常に応答"
    break
  fi

  sleep $HEALTH_INTERVAL
  HEALTH_ELAPSED=$((HEALTH_ELAPSED + HEALTH_INTERVAL))
done

if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ ヘルスチェック失敗 — HTTP $HTTP_STATUS（期待値: 200）"
fi
```

- HTTP 200 → 次のステップ（結果報告）へ
- 200 以外 → **DONE_WITH_CONCERNS** で報告（HTTP ステータスコードを含める）

#### 6c. 結果報告

ビルド監視とヘルスチェックの結果に基づき、完了ステータスを決定する:

| ビルド | ヘルスチェック | ステータス | 報告内容 |
|--------|---------------|-----------|---------|
| SUCCESS | 200 | **DONE** | 全ステップ完了、本番反映確認済み |
| SUCCESS | 200 以外 | **DONE_WITH_CONCERNS** | ビルド成功だが本番 URL が応答しない（HTTP ステータス提示） |
| FAILURE 等 | — | **DONE_WITH_CONCERNS** | ビルド失敗（ビルドログ提示、ロールバック手順案内） |
| タイムアウト | — | **DONE_WITH_CONCERNS** | ビルド未完了（手動確認 URL 提示） |

手動確認用リンク:
- Firebase コンソール: https://console.firebase.google.com/project/kiyaku-assist/apphosting
- Cloud Build ログ: `gcloud builds list --project=kiyaku-assist --region=asia-east1 --limit=5`

### 7. ロールバック手順（デプロイ失敗時）

本番環境でエラーが発生した場合のロールバック:

```bash
# 前回の正常なロールアウトに戻す
firebase apphosting:rollouts:create kiyaku-assist --git-branch main --project kiyaku-assist

# Cloud Build のログでエラー内容を確認
gcloud builds log <BUILD_ID> --project=kiyaku-assist --region=asia-east1
```

## 注意事項

- **デプロイ先リージョン**: asia-east1（東京）
- **Cloud Build のリージョン**: asia-east1（App Hosting と同じ）
- **maxRequestTimeoutSeconds**: 600（SSE 長時間処理対応、`apphosting.yaml` で設定）
- **環境変数**: `apphosting.yaml` で管理。`ANTHROPIC_API_KEY` は Secret Manager で管理
- **リソース制限**: CPU 1コア、メモリ 512MiB、最大2インスタンス、最小0インスタンス（コールドスタートあり）

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
- **DONE**: 全ステップ完了、エビデンスあり
- **DONE_WITH_CONCERNS**: 完了したが既知の問題あり（リスト提示）
- **BLOCKED**: 続行不可（ブロッカーと試行内容を提示）
- **NEEDS_CONTEXT**: 必要な情報が不足（質問を提示）

## セッションログ

スキル実行完了後、以下でログを記録する:
```bash
./scripts/log-skill-usage.sh <skill-name> <outcome> [duration_s]
```
- outcome: success | error | abort | blocked
- ログ先: ~/.kiyaku/analytics/skill-usage.jsonl
