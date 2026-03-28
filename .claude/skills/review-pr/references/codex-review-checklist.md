# Codex / 外部ツール生成コード レビューチェックリスト

Codex や外部ツールで生成されたコードをレビューする際の詳細チェック項目。

## 1. ハードコード値チェック

- API エンドポイント URL が `http://localhost:3000` になっていないか
- テスト用のダミーデータが本番コードに含まれていないか
- Firebase プロジェクト ID がハードコードされていないか
- API キーやトークンが直書きされていないか
- タイムアウト値やリトライ回数が適切か（マジックナンバーの有無）

## 2. 環境差チェック

- `process.env` の参照が `apphosting.yaml` の変数名と一致しているか
- Node.js バージョン依存のコードがないか（App Hosting は Node.js 20）
- パス区切り文字がOS依存になっていないか
- ファイルシステムへの直接書き込みがないか（App Hosting はリードオンリー）
- `localhost` や `127.0.0.1` への参照がないか

## 3. UI 重複チェック

- `src/components/ui/` の既存コンポーネントで代替可能なカスタムコンポーネントがないか
- shadcn/ui のスタイル（new-york）と異なるスタイルが混在していないか
- Tailwind CSS v4 の構文で書かれているか（v3 構文の混在がないか）
- 既存のレイアウトコンポーネント（`PageHeader`, `StepLayout` 等）が活用されているか
- アイコンライブラリが `lucide-react` に統一されているか

## 4. 既存実装との一貫性

- **インポートパス**: `@/` エイリアスの使用（相対パスの `../../` は NG）
- **命名規約**:
  - ファイル名: kebab-case（`my-component.tsx`）
  - コンポーネント: PascalCase（`MyComponent`）
  - 関数・変数: camelCase（`myFunction`）
  - 型: PascalCase + サフィックス（`MyRequest`, `MyResponse`）
  - 定数: UPPER_SNAKE_CASE（`MAX_RETRY_COUNT`）
- **エラーハンドリング**: `{ error: string }` レスポンス形式
- **ログ出力**: `console.error` でサーバーサイドエラーを記録
- **認証チェック**: API Route の冒頭で `getAuthUser()` を呼び出し
