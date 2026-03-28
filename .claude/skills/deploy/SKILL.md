---
name: deploy
description: |
  キヤクアシスト v2 のデプロイワークフロー。
  ビルド確認→テスト実行→Git push→Firebase App Hosting 自動デプロイの安全なフロー。
  Use when: デプロイ、リリース、本番反映、push
user-invocable: true
argument-hint: "[確認メッセージ（省略可）]"
---

# デプロイワークフロー

キヤクアシスト v2 を本番環境にデプロイする安全なフローを実行する。

## Preamble（実行前チェック）

1. CLAUDE.md を読み、プロジェクト設定を確認する
2. `kiyaku-assist-v2/` ディレクトリが存在することを確認
3. `git status` で現在のブランチが `main` であることを確認

## プロジェクトパス

- リポジトリルート: `/Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2`
- アプリディレクトリ: `/Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2`

## ワークフロー手順

### 1. 事前チェック

```bash
cd /Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2
git status
```

- 未コミットの変更がある場合は、ユーザーに内容を提示して「コミットしてからデプロイするか」を確認する
- 未コミットの変更がなければ次のステップへ

### 2. ビルド確認

```bash
cd /Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2
npm run build
```

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
git diff --name-only
```

- `package-lock.json` に変更があれば、`package.json` との整合性が取れていなかった可能性がある
- 変更があった場合はステージに追加してコミットに含める

### 5. Git コミット & プッシュ

```bash
cd /Users/uchan/d3m_condo_bylaws_pj/kiyaku-assist-v2
git add <変更ファイル>
git commit -m "<変更内容に応じたコミットメッセージ>"
git push origin main
```

- 変更内容を分析して適切なコミットメッセージを作成する
- `git push origin main` で Firebase App Hosting の自動デプロイが発火する

### 6. デプロイ確認

- Firebase App Hosting が `main` ブランチへの push をトリガーに自動デプロイを実行する
- **本番 URL**: https://kiyaku-assist--kiyaku-assist.asia-east1.hosted.app

デプロイステータスの確認方法:

```bash
# Firebase コンソールで確認
# https://console.firebase.google.com/project/kiyaku-assist/apphosting

# Cloud Build のログ確認
gcloud builds list --project=kiyaku-assist --region=asia-east1 --limit=5
```

- デプロイ完了まで通常 3-5 分程度かかる
- ユーザーにデプロイ発火済みであること、および確認方法を案内する

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

## 完了報告

実行結果を以下のいずれかで報告する:
- **DONE**: ビルド・テスト通過、push 完了、デプロイ発火確認済み
- **DONE_WITH_CONCERNS**: push 完了だがテスト警告あり（詳細提示）
- **BLOCKED**: ビルドエラーまたはテスト失敗で解決不能（エラー内容と試行結果を提示）
- **NEEDS_CONTEXT**: コミット内容の判断にユーザー確認が必要
