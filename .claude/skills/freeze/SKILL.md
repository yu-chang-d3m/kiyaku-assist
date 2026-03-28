---
name: freeze
preamble-tier: 1
description: |
  編集対象を特定ディレクトリに制限する安全ガードスキル。
  大規模な変更時に意図しないファイル編集を防止する。
  Use when: 特定ドメインだけを修正したい、編集範囲を限定したい、
  安全に作業したい
user-invocable: true
argument-hint: "[directory] (例: src/domains/chat, src/app/api/analysis, off)"
---

# 編集境界制御スキル

> プロジェクト設定・技術スタック・制約は [CLAUDE.md](/Users/uchan/d3m_condo_bylaws_pj/CLAUDE.md) を参照。

## Preamble（実行前チェック）

1. 引数を解析し、制限モード（設定 / 解除）を判定する
2. 指定されたディレクトリが `kiyaku-assist-v2/` 配下に存在することを確認する
3. 現在の制限状態をユーザーに表示する

## 制限モード

### `/freeze <directory>` — 編集範囲を制限

指定されたディレクトリのみ編集可能に制限する。

**引数の例:**
- `/freeze src/domains/chat` — chat ドメインのみ編集可能
- `/freeze src/domains/analysis src/domains/drafting` — 複数ドメイン指定
- `/freeze src/app/api/analysis` — API Route のみ編集可能

### `/freeze off` または `/freeze --all` — 制限を解除

全ファイルの編集を許可する通常モードに戻す。

## 編集ルール

### 編集可能（WRITE）

| 対象 | 条件 |
|------|------|
| 指定ディレクトリ配下 | 全ファイル編集可能 |
| テストファイル | `__tests__/` および `*.test.ts` は常に編集可能 |
| E2E テスト | `e2e/` 配下は常に編集可能 |

### 読み取り専用（READ ONLY）

| 対象 | 理由 |
|------|------|
| `src/shared/` | ドメイン境界の型・ユーティリティ参照用 |
| `src/domains/*/types.ts` | 他ドメインの型定義参照用 |
| その他の指定外ディレクトリ | 意図しない変更を防止 |

### 編集禁止（BLOCKED）

指定ディレクトリ外のファイルへの書き込み・作成は原則禁止。

## 確認表示フォーマット

制限を設定した際、以下のフォーマットで現在の状態を表示する:

```
---
FREEZE: 編集境界を設定しました

編集可能:
  - kiyaku-assist-v2/src/domains/chat/**
  - kiyaku-assist-v2/**/__tests__/**
  - kiyaku-assist-v2/**/*.test.ts
  - kiyaku-assist-v2/e2e/**

読み取り専用:
  - kiyaku-assist-v2/src/shared/**
  - kiyaku-assist-v2/src/domains/*/types.ts
  - その他全ファイル

解除: /freeze off
---
```

## 違反検知

制限範囲外のファイルを編集しようとした場合:

```
---
FREEZE 違反: 編集境界外のファイルです

対象: src/domains/analysis/analyzer.ts
現在の制限: src/domains/chat/** のみ編集可能

選択肢:
  1. 編集をスキップして続行
  2. このファイルを一時的に編集許可に追加
  3. /freeze off で制限を解除

どうしますか？ [1/2/3]
---
```

### 違反時の動作

1. **即座に停止** — 編集を実行する前に警告を出す
2. **ユーザーに選択肢を提示** — スキップ / 一時許可 / 解除の3択
3. **一時許可の場合** — そのファイルのみ編集可能に追加（セッション中のみ）
4. **ログ** — 違反が発生したファイルと選択結果を記録し、セッション終了時にサマリーを表示

## ドメイン境界との連携

DDD 6ドメイン構成を意識した推奨パターン:

| 作業内容 | 推奨 freeze 範囲 |
|---------|-----------------|
| chat ドメインの機能追加 | `/freeze src/domains/chat src/app/api/chat src/app/chat` |
| analysis + drafting の連携修正 | `/freeze src/domains/analysis src/domains/drafting` |
| UI のみの修正 | `/freeze src/app src/components` |
| shared ユーティリティの修正 | `/freeze src/shared`（影響範囲が広いため慎重に） |

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
- **DONE**: 編集境界の設定または解除が完了
- **DONE_WITH_CONCERNS**: 設定完了だが、指定範囲が広すぎる/狭すぎる可能性あり（提案提示）
- **BLOCKED**: 指定されたディレクトリが存在しない、またはパスが不正
- **NEEDS_CONTEXT**: 引数が不足しており、制限対象のディレクトリ指定が必要
