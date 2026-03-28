---
name: careful
description: |
  破壊的コマンドの実行前に警告を出す安全ガードスキル。
  rm -rf、git push --force、DROP TABLE、git reset --hard 等の
  取り消し不能な操作を検知し、ユーザー確認を求める。
  Use when: 危険なコマンド実行前、本番環境操作、データ削除、
  force push、リセット、クリーンアップ
---

# 安全ガードスキル

> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。

## 目的

取り消し不能な破壊的操作の実行前にユーザーの明示的な確認を求める。
gstack の `/careful` パターンに基づく。

## 検知対象コマンド

### ファイルシステム（CRITICAL）
- `rm -rf` / `rm -r` — ディレクトリ再帰削除
- `find ... -delete` — パターンマッチ削除
- `> file` / `truncate` — ファイル内容の上書き・切り詰め

### Git（HIGH）
- `git push --force` / `git push -f` — 強制プッシュ（リモート履歴の上書き）
- `git reset --hard` — ローカル変更の完全破棄
- `git clean -fd` — 未追跡ファイルの一括削除
- `git branch -D` — ブランチの強制削除
- `git checkout -- .` / `git restore .` — 作業ツリーの変更破棄

### データベース（CRITICAL）
- `DROP TABLE` / `DROP DATABASE` — テーブル/DB 削除
- `DELETE FROM ... WHERE` なし — 全行削除
- `TRUNCATE TABLE` — テーブルデータの全削除

### Firebase / GCP（HIGH）
- `firebase functions:delete` — Cloud Functions 削除
- `gcloud projects delete` — プロジェクト削除
- `gcloud firestore databases delete` — Firestore DB 削除
- Firestore セキュリティルールの `allow write: if true` — 全公開

### プロセス（MEDIUM）
- `kill -9` / `killall` — プロセス強制終了
- `npm cache clean --force` — キャッシュ強制クリア

## 警告フォーマット

破壊的コマンドを検知した場合、以下のフォーマットで警告する:

```
---
WARNING: 破壊的操作を検知しました

コマンド: [検知されたコマンド]
リスク: [CRITICAL / HIGH / MEDIUM]
影響: [何が失われるか/変更されるかの具体的な説明]
復元: [復元可能かどうか、復元方法があれば記載]

続行しますか？ [y/N]
---
```

## 動作ルール

1. **検知した時点で即座に停止** — コマンドを実行する前に警告を出す
2. **代替案を提示** — より安全な方法があれば提案する
   - `git push --force` → `git push --force-with-lease`
   - `rm -rf dir` → ゴミ箱移動（`mv dir ~/.Trash/`）
   - `git reset --hard` → `git stash` で退避後にリセット
3. **ユーザーが明示的に承認するまで実行しない**
4. **本番環境への影響がある場合は二重確認** — Firebase/GCP 操作は特に慎重に
5. **3回連続で破壊的操作が要求された場合、エスカレーション** — 作業の方向性自体を再確認する
