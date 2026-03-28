# E2E テスト基盤の詳細

## プロジェクト構成

Playwright は4つのプロジェクトで構成されている:

1. **`setup`** — 認証セットアップ（`auth.setup.ts`）
2. **`smoke`** — スモークテスト（@smoke タグ）
3. **`journey`** — ユーザージャーニー通しテスト
4. **`dogfooding`** — 手動テスト支援

## 認証セットアップ (`auth.setup.ts`)

- Firebase Auth でログイン（Email/Password）
- ストレージ状態を `.auth/user.json` に保存
- 他のプロジェクトが `storageState` で再利用

## data-test 属性規約

- 命名: `data-test="{page}-{element}"` （例: `data-test="upload-dropzone"`, `data-test="review-adopt-btn"`）
- 必須箇所: ボタン、入力フィールド、ナビゲーション、進捗表示

## テストデータ

- `e2e/fixtures/sample-bylaws.txt` — テスト用の管理規約テキスト
- 最小限の条文構造（第1条〜第5条程度）

## スクリーンショット

- `e2e/screenshots/` に参考画像を蓄積
- 各ステップの期待される画面を記録
