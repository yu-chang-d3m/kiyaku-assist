# PRD: キヤクアシスト v2 — 再設計版

**作成日**: 2026-04-03
**バージョン**: 1.0
**前提**: v0.3 PRD + 実装フィードバック + Codex レビューを踏まえたゼロベース再設計
**上位ドキュメント**: [vision.md](vision.md) — プロジェクトの思想・目的・提供価値

---

## 1. 上位目的

> **高品質な初稿を短時間で作り、理事会レビューの負荷を下げる**

キヤクアシストは「AIが最終版を自動確定するツール」ではない。運用モデルは以下の通り:

```
AI が初稿を生成 → 理事会がレビュー（印刷配布・xlsx 回覧）→ フィードバック会 → プロダクト上で最終版を確定
```

このサイクルを支援するために、以下を実現する:
1. レビューに耐える品質の初稿を、専門家に頼らず短時間で生成する
2. レビュー台帳（xlsx）と印刷資料（PDF/Word）を、そのまま理事会に配れる品質で出力する
3. オフラインのレビュー結果をプロダクトに戻し、版を管理して最終確定する

---

## 2. 市場環境

### 2.1 タイミング

| 日付 | イベント |
|------|----------|
| 2025年10月 | 国交省 標準管理規約を全面改正（令和7年改正） |
| **2026年4月1日** | **改正区分所有法 施行** |
| 2026年4〜6月 | 多くのマンションの通常総会シーズン |

### 2.2 ペルソナ

**田中さん（52歳・マンション理事長）**: 築20年60戸、IT企業マネージャー。法律は門外漢。管理会社の見積もりが高額で自力検討中。

---

## 3. ユーザージャーニーと機能定義

### 3.1 ジャーニーマップ（6ステップ）

```
[0.始める]  → [1.理解する] → [2.現状を把握する] → [3.差分を分析する] → [4.改正案を作る] → [5.合意を形成する]
 初回登録・     法改正の      現行規約を          AIが標準規約と     AIが初稿を       レビュー台帳・
 属性ヒアリング  概要を学ぶ    アップロード         比較・課題特定      生成・レビュー    印刷資料を生成
```

### 3.2 全画面共通 UI

| 要素 | 仕様 |
|------|------|
| **ジャーニー進捗バー** | ヘッダーに6ステップを常時表示。現在ステップをハイライト |
| **自動保存** | 全操作は Firestore にリアルタイム同期。「操作を間違えてデータが消えた」を起こさない |
| **再開** | プロジェクト単位で再開可能。`currentStep` に基づき適切なページに遷移 |
| **免責フッター** | 全画面に「AI生成の初稿です。専門家の確認を推奨します」を表示 |
| **進捗の見える化** | 「あと何件残っているか」「どこまで終わったか」を常に表示 |
| **専門用語の平易化** | 法律用語には必ず平易な説明を添える |
| **取り消し・やり直し** | 判断はいつでも変更可能。修正履歴を保持 |

### 3.3 機能定義

#### F0: オンボーディング

| 項目 | 仕様 |
|------|------|
| **目的** | マンション属性を収集し、プロジェクトを Firestore に作成 |
| **入力** | マンション名、戸数、法人格、規約有無、文書種別、総会予定 |
| **出力** | Firestore `projects/{id}` ドキュメント |
| **重要** | この時点で `projectId` が確定する。以降の全ステップはこの ID に紐づく |

#### F1: 法改正かんたんガイド

| 項目 | 仕様 |
|------|------|
| **目的** | 改正区分所有法と標準管理規約改正のポイントを平易に解説 |
| **形式** | FAQ + ステップバイステップ。「施行前 vs 施行後」の判断フロー含む |

#### F2: 現行規約アップロード & パース

| 項目 | 仕様 |
|------|------|
| **目的** | 現行規約を構造化データに変換し、Firestore に保存 |
| **対応形式** | PDF / Word / テキスト |
| **パース結果** | `projects/{id}/parsedBylaws` サブコレクション（Firestore に直接保存） |
| **確認ステップ** | パース結果を表示し、ユーザーに「正しく読み取れていますか？」を確認 |

#### F3: AI ギャップ分析

| 項目 | 仕様 |
|------|------|
| **目的** | 現行規約と令和7年改正標準管理規約を比較し、課題を特定 |
| **入力** | Firestore の `parsedBylaws` |
| **出力** | Firestore の `reviewArticles/{articleId}` に直接保存 |
| **分類** | 各条文に `importance`（法的必須/推奨/任意）、`semanticGroup`（課題グループ）、`issueGroup` を付与 |
| **部分成功** | 各バッチの成功分は即座に Firestore に保存。失敗分は「未分析」としてマーク。再実行可能 |

#### F4: 改正案ドラフト生成 & レビュー

**F4a: 初稿生成**

| 項目 | 仕様 |
|------|------|
| **目的** | ギャップ分析結果に基づき、各条文の改正案初稿を生成 |
| **出力** | `reviewArticles` の `draft`, `reformText`, `detailedBackground`, `impactOnResidents`, `riskIfUnchanged`, `transitionalMeasure` を更新 |
| **品質担保** | 標準管理規約をテンプレートベースとし、マンション固有情報を差し込む方式。「何が変わるか」「なぜ変えるか」「理事会での説明例」を条文ごとに必ず生成 |
| **べき等性** | `draft` が既にある条文はスキップ |

**F4b: レビュー**

| 項目 | 仕様 |
|------|------|
| **画面の考え方** | 課題起点（Issue-first）で情報を提示。「なぜ変えるのか（課題グループ）」→「何が重要か（優先度）」→「具体的な条文」の順で理解を導く |
| **ビューモード** | **課題グループビュー**（デフォルト: issueGroup でグルーピング）/ テーブルビュー / ダッシュボードビュー |
| **条文ごとの必須表示情報** | (1) 平易な要約 (2) なぜ変えるのか（背景・リスク）(3) 新旧対照 (4) 理事会での説明例 — 画面上・印刷物の両方で必ず提示 |
| **判断ボタン** | 採用 / 修正 / 現行維持 / 管理会社案を採用 / 保留（5択） |
| **一括操作** | 「初稿を一括反映」（AI推奨を初期値として設定。個別に変更可能） |
| **管理会社案** | 管理会社案がある場合は3カラム比較表示 |
| **オフライン結果の反映** | 印刷物や xlsx に書き込まれたフィードバックを、レビュー画面から条文ごとに反映する UI |

**F4c: 版管理と最終確定**

| 項目 | 仕様 |
|------|------|
| **版の概念** | 初稿（AI生成）→ レビュー反映版 → 最終確定版 |
| **最終確定フロー** | 全条文の判断が完了した状態で「最終確定」ボタンを押すと、確定日時が記録される |
| **確定後の変更** | 確定後も修正可能だが、「確定済みの条文を変更しますか？」の確認ダイアログを表示 |
| **履歴** | 各条文の判断変更履歴を保持。「誰が・いつ・何に変えたか」が追跡可能（Phase 2 でマルチユーザー対応時に有用） |

#### F5: AI チャット（規約 Q&A — 補助機能）

| 項目 | 仕様 |
|------|------|
| **位置付け** | レビュー中の疑問を解消するための**補助機能**。独立した自由質問 AI ではなく、条文や論点に紐づく Q&A |
| **アクセス** | ヘッダーからチャット画面に遷移。Phase 2 で条文詳細パネルから直接起動を検討 |
| **RAG** | Vertex AI Search で標準管理規約を検索し、コンテキストとして Claude に渡す |
| **ガードレール** | 3段階: `pass`（通常回答）/ `warning`（制限モード+専門家誘導）/ `blocked`（回答拒否+専門家誘導） |

#### F6: レビュー用資料生成

| 項目 | 仕様 |
|------|------|
| **位置付け** | 単なるエクスポートではなく、**理事会レビューの実務に使える資料の生成** |

**印刷配布用（PDF / Word）**:

| 要件 | 仕様 |
|------|------|
| **レイアウト** | A4縦、本文12pt以上、条文テキスト14pt以上 |
| **構成** | 表紙 → 全体サマリー → 課題グループ別セクション → 条文ごとの新旧対照 |
| **条文ごとの内容** | 平易な要約、なぜ変えるか（背景・リスク）、新旧対照、理事会での説明例 |
| **改ページ** | 課題グループの区切りで改ページ。条文が途中で切れない |
| **メモ欄** | 各条文の下にメモ書き込み用の罫線スペース |
| **白黒対応** | 色だけでなく記号（＋、取消線、→）で変更を表現 |
| **Word 表紙** | マンション名・所在地・管理会社名・判断件数・作成日・版（初稿/レビュー反映版/最終確定版） |

**レビュー台帳用（Excel / xlsx）**:

| 列 | 内容 |
|----|------|
| 条文番号 | 第○条 |
| 章名 | 総則、管理組合等 |
| 重要度 | 法的必須 / 推奨 / 任意 |
| 課題グループ | 電子化対応、管理組合法人化等 |
| 現行条文 | 現行規約の全文 |
| AI改正案 | AIが生成した初稿 |
| 変更理由 | なぜこの変更が必要か |
| 未変更リスク | 変更しなかった場合のリスク |
| AI推奨判断 | 採用 / 修正 / 現行維持等 |
| レビュー担当 | （空欄: 理事会で記入） |
| コメント | （空欄: 理事会で記入） |
| 会議結論 | （空欄: フィードバック会で記入） |
| 対応状況 | （空欄: 反映作業の追跡用） |
| 最終確定 | （空欄: 確定時にチェック） |

**その他**:
- CSV: データ保存・議事録添付用
- Markdown: テキストベースの共有・加工用

**共通仕様**:
- デフォルトの並び順は課題グループ → 優先度順。章番号順も選択可
- 法的必須で保留の条文がある場合は警告バナー

---

## 4. 設計原則

### 4.1 データフローは一本道

```
Firestore がシングルソースオブトゥルース（SSOT）

sessionStorage はキャッシュのみ。Firestore と矛盾したら Firestore を信じる。
sessionStorage が空でも Firestore からリカバリーできる。
```

**禁止事項**:
- sessionStorage にしか存在しないデータに依存するフロー
- 一時 ID（`project-${Date.now()}`）の生成。プロジェクトは必ず Firestore で作成してから使う
- API エラー時の `clearSession()`（セッション全消去は過剰）

### 4.2 AI 処理は失敗前提で設計

- **べき等性**: 同じ入力で再実行しても副作用なし
- **部分成功の保存**: 10条文中7条文が完了した時点で Firestore に保存済み。残り3条文だけ再実行可能
- **リカバリー UI**: 「処理結果を確認する」ボタンで部分結果を表示
- **進捗の永続化**: SSE 切断後もサーバー側は処理を続行し、結果を Firestore に保存

### 4.3 テストが品質の門番

| 層 | ツール | 対象 | 実行タイミング |
|---|---|---|---|
| **E2E ジャーニー** | Playwright | 全6ステップの通しフロー | デプロイ前/後に必須 |
| **E2E スモーク** | Playwright | 公開ページ・認証ガード | デプロイ後に自動実行 |
| **API 統合** | Vitest | API Route の入出力 | コミット時 |
| **ドメイン単体** | Vitest | ビジネスロジック | コミット時 |
| **Gate** | tsc + ESLint | 型安全性 | コミット時 |

**ルール**: API 認証・バリデーション変更後は必ず E2E を実行してからデプロイ。

---

## 5. データアーキテクチャ

### 5.1 Firestore データモデル

```
/projects/{projectId}
  - userId: string
  - condoName, condoType, unitCount, documentType
  - currentStep: 0-5
  - analysisStatus: "not-started" | "in-progress" | "completed" | "partial"
  - draftStatus: "not-started" | "in-progress" | "completed" | "partial"
  - version: "draft" | "reviewed" | "finalized"      ← v1.0 新設
  - finalizedAt: Timestamp | null                     ← v1.0 新設
  - createdAt, updatedAt: Timestamp

  /parsedBylaws/{articleId}
    - articleNum, chapterTitle, title, body, paragraphs

  /reviewArticles/{articleId}
    - projectId, articleNum, chapter, category
    - original: string | null
    - draft: string
    - reformText: string
    - summary: string                      ← 平易な要約（必須表示）
    - explanation: string                  ← 理事会での説明例（必須表示）
    - detailedBackground: string           ← なぜ変えるか（必須表示）
    - impactOnResidents: string            ← 住民への影響
    - riskIfUnchanged: string              ← 未変更リスク（必須表示）
    - transitionalMeasure: string          ← 経過措置
    - importance: "mandatory" | "recommended" | "optional"
    - semanticGroup: string
    - issueGroup: string
    - decision: "adopted" | "modified" | "keep-current" | "adopt-management" | "pending" | null
    - memo: string
    - modificationHistory: string[]
    - baseRef: string
    - relatedLawRefs: string[]
    - analysisStatus: "completed" | "failed"
    - draftStatus: "completed" | "failed" | "not-started"
    - reviewAssignee: string | null          ← v1.0 新設: レビュー担当
    - reviewStatus: "not-started" | "in-review" | "reviewed" | "remanded"  ← v1.0 新設
    - meetingConclusion: string | null       ← v1.0 新設: フィードバック会の結論
    - remandReason: string | null            ← v1.0 新設: 差戻し理由
    - isFinalized: boolean                   ← v1.0 新設: 最終確定フラグ
    - finalizedAt: Timestamp | null          ← v1.0 新設
    - updatedAt: Timestamp
```

### 5.2 データフロー

```
F0 → Firestore: projects/{id} 作成（projectId 確定）
F2 → Firestore: parsedBylaws に保存
F3 → Firestore: reviewArticles に保存（課題分類・重要度付き）
F4a → Firestore: reviewArticles 更新（初稿・背景・リスク・説明例）
F4b → Firestore: reviewArticles 更新（decision, memo, reviewStatus 等）
F4c → Firestore: reviewArticles 更新（isFinalized, meetingConclusion）
F6 → Firestore: reviewArticles 読み取り → 資料生成 → ダウンロード
```

### 5.3 sessionStorage の役割（キャッシュのみ）

| 用途 | 方針 |
|------|------|
| projectId | キャッシュ。Firestore からも取得可能 |
| parsedBylaws | キャッシュ。Firestore が SSOT |
| onboarding | キャッシュ。Firestore の project ドキュメントが SSOT |
| gapResults | **廃止** |
| decisions/memos | **廃止**。Firestore が SSOT |

---

## 6. 技術アーキテクチャ

### 6.1 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router), React 19, TypeScript 5 |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI |
| 状態管理 | Zustand（キャッシュ）, Firestore（SSOT） |
| AI | Claude API（Haiku 4.5: パース、Sonnet 4.5: 分析/ドラフト/チャット） |
| RAG | Vertex AI Search + Claude |
| 認証 | Firebase Authentication（メール/PW + Google） |
| DB | Firestore |
| ホスティング | Firebase App Hosting (asia-east1) |
| テスト | Vitest (unit), Playwright (E2E) |
| エクスポート | @react-pdf/renderer, docx, exceljs |

### 6.2 API 認証

| エンドポイント | 認証 | 所有者チェック |
|--------------|------|--------------|
| `/api/project` | verifyAuth | uid で直接取得 |
| `/api/project/[id]` | verifyAuth | verifyProjectOwner |
| `/api/ingestion/*` | verifyAuth | — |
| `/api/analysis/*` | verifyAuth | verifyProjectOwner |
| `/api/drafting/*` | verifyAuth | verifyProjectOwner |
| `/api/review/*` | verifyAuth | verifyProjectOwner |
| `/api/chat/*` | verifyAuth | — |
| `/api/export` | verifyAuth | verifyProjectOwner |
| `/api/admin/*` | verifyAdmin | — |

### 6.3 セキュリティ

| 項目 | 対策 |
|------|------|
| アクセス制御 | Firestore Security Rules + API Route で二重チェック |
| アップロード | サーバー側メモリ内パース→即破棄 |
| 非弁ガードレール | 3段階（pass/warning/blocked） |
| 管理者 API | ADMIN_UIDS 環境変数による allowlist |

---

## 7. Phase 分け

### Phase 1（MVP）

- F0〜F6（Firestore SSOT、べき等 AI 処理、E2E テスト駆動）
- 版管理（初稿 / レビュー反映版 / 最終確定版）
- レビュー台帳 xlsx（必須列定義済み）
- 印刷品質の PDF/Word（改ページ・メモ欄・白黒対応）
- 単棟型 / シングルユーザー / 日本語のみ

### Phase 2

- マルチユーザー・理事会共有（レビュー担当の割り当て、承認ワークフロー）
- 条文からのチャット直接起動（サイドパネル）
- 総会議案書テンプレート（議案の要領付き）
- 住民説明資料ジェネレーター
- Document AI / 個人情報マスキング / データ保持ポリシー

### Phase 3

- 長期修繕計画連携 / 専門家マッチング / 団地型対応

---

## 8. 成功指標

| 指標 | 目標 |
|------|------|
| 初稿作成時間（F2開始〜F4a完了） | 30分以内 |
| レビュー準備時間（F4a完了〜F6完了） | 10分以内 |
| 法的必須条文の対応完了率 | 100% |
| 最終確定までの往復回数 | 3回以内 |
| ジャーニー完走率（F0→F6） | 70%以上 |
