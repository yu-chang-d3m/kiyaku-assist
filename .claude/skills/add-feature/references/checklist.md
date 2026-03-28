# 整合性チェックリスト詳細

機能追加の実装完了後に確認すべき項目と、よくある失敗パターンをまとめる。

## 1. ドメイン境界違反チェック

**確認内容**: `src/domains/{domainA}/` から `src/domains/{domainB}/` への直接 import がないか

**許可される依存方向:**
```
src/app/        → src/domains/  → src/shared/
(UI・API Route)   (ビジネスロジック)  (共通基盤)
```

**禁止される依存:**
- `domains/analysis/` → `domains/drafting/` （ドメイン間の直接依存）
- `domains/` → `app/` （逆方向の依存）
- `shared/` → `domains/` （逆方向の依存）

**よくある失敗パターン:**
- 分析結果を下書きドメインで使いたいとき、`domains/analysis/types.ts` を `domains/drafting/` から直接 import する → `shared/types/` に共有型を定義して間接参照にする
- Server Action 内でドメインロジックと UI 状態を混在させる → ドメインロジックは必ず `domains/` に分離

## 2. serverExternalPackages チェック

**確認内容**: `next.config.ts` の `serverExternalPackages` に、サーバーサイドでのみ使用する Node.js ネイティブ依存パッケージを追加したか

**よくある失敗パターン:**
- `pdf-parse` を静的 import して全 Route がクラッシュする → `serverExternalPackages` に追加し、動的 import (`await import('pdf-parse')`) を使用する
- `sharp` や `canvas` 等のネイティブモジュールを追加時に設定漏れ → ローカルでは動くが Cloud Build で失敗する

**チェック方法:**
```bash
# 新しく追加した npm パッケージにネイティブ依存がないか確認
npm ls --all | grep -E "(node-gyp|prebuild|native)"
```

## 3. package-lock.json 同期チェック

**確認内容**: `package.json` への依存追加後に `npm install` を実行し、`package-lock.json` が更新されているか

**よくある失敗パターン:**
- `package.json` に手動でパッケージを追記したが `npm install` を忘れた → Cloud Build の `npm ci` で「lockfile out of sync」エラー
- `npm install` の代わりに `npm install --save` を使い忘れて `devDependencies` に入るべきものが `dependencies` に入る

**チェック方法:**
```bash
# lockfile の整合性チェック
npm ci --dry-run
```

## 4. Firestore セキュリティルール チェック

**確認内容**: 新しいコレクション・ドキュメントパスへのアクセスが `firestore.rules` で許可されているか

**よくある失敗パターン:**
- 新しいコレクション `projects/{projectId}/newFeature` を追加したが `firestore.rules` にルールを追加しなかった → ローカルの Firebase Emulator では Admin SDK 経由で動くが、本番のクライアント SDK アクセスで `PERMISSION_DENIED`
- Client SDK（フロントエンド）をサーバーサイド（API Route）で使ってしまう → Admin SDK を使えばセキュリティルールをバイパスできるが、クライアント SDK はルールに従う

**チェック方法:**
```bash
# firestore.rules の該当パスにルールがあるか確認
grep -n "newCollectionName" firestore.rules
```

## 5. 環境変数チェック

**確認内容**: 新しい環境変数を `apphosting.yaml` に追加したか

**よくある失敗パターン:**
- `.env.local` にのみ環境変数を追加し、`apphosting.yaml` への追加を忘れた → ローカルでは動くがデプロイ後に undefined
- シークレット値を `apphosting.yaml` に平文で書いてしまう → Secret Manager を使う（`availability: SECRET`）

**チェック方法:**
```bash
# コード内で参照している環境変数を列挙
grep -rn "process.env\." src/ | grep -oP 'process\.env\.\K[A-Z_]+' | sort -u

# apphosting.yaml に定義済みの環境変数を列挙
grep -E "^  [A-Z_]+:" apphosting.yaml | awk '{print $1}' | tr -d ':'
```

## 6. ビルドチェック

**確認内容**: `npm run build` がエラーなく完了するか

**よくある失敗パターン:**
- Zod スキーマを `"use server"` ディレクティブのあるファイルに置いた → クライアントコンポーネントから参照できずビルドエラー。Zod スキーマは `src/shared/db/schemas.ts` に置く
- `"use client"` コンポーネントから Server Component 専用 API を呼んでいる → `import "server-only"` でガード
- TypeScript の型エラーを `@ts-ignore` で潰してビルドを通す → 型エラーは正しく修正する

**チェック方法:**
```bash
cd kiyaku-assist-v2 && npm run build
```

## 7. ユニットテストチェック

**確認内容**: `npm run test` で全テストが通過するか

**よくある失敗パターン:**
- 既存テストが新しいコードの副作用で壊れている → テスト実行前に `git stash` して既存テストが通ることを確認
- AI 依存部分のモックが不完全 → `vi.mock()` でモジュール全体をモック化し、テスト対象のロジックのみをテスト
- 非同期テストで `await` を忘れて false positive → `expect` を `await expect` で書く

**チェック方法:**
```bash
cd kiyaku-assist-v2 && npm run test
```
