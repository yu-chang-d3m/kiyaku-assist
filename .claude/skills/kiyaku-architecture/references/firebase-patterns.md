# Firebase 設計パターン

## Client SDK vs Admin SDK の使い分け

| ファイル / レイヤー | SDK | 理由 |
|---------------------|-----|------|
| `shared/db/firestore.ts` | **Client SDK** | クライアントコンポーネントから Firestore にアクセス。遅延初期化パターン |
| `shared/auth/auth-context.tsx` | **Client SDK** | Firebase Auth のログイン/ログアウト、認証状態監視 |
| `shared/auth/auth-guard.tsx` | **Client SDK** | クライアント側の認証ガード |
| `shared/db/admin.ts` | **Admin SDK** | API Route / Server Actions からの Firestore アクセス |
| `shared/ai/cache.ts` | **Admin SDK** | AI レスポンスキャッシュ（サーバー側のみ） |
| `shared/db/server-actions.ts` | **Admin SDK** | Server Actions からのデータ操作 |
| `app/api/*/route.ts` | **Admin SDK** | API Route ハンドラー |

**鉄則**: サーバー側のコード（API Route, Server Actions）では**必ず Admin SDK** を使用する。Client SDK だと `request.auth` が null になり `PERMISSION_DENIED` エラーが発生する。

## 遅延初期化パターン

### Client SDK（`shared/db/firestore.ts`）

```typescript
// モジュールレベルでは設定の有無だけ判定
export const isFirebaseConfigured: boolean = Boolean(firebaseConfig.apiKey);

// 実際の初期化は呼び出し時（遅延初期化）
let _app: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (_app) return _app;
  _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export function getDb(): Firestore { /* ... */ }
export function getFirebaseAuth(): Auth { /* ... */ }
```

モジュールレベルで `initializeApp()` を呼ぶと、ビルド時に環境変数が未設定で `auth/invalid-api-key` エラーになる。

### Admin SDK（`shared/db/admin.ts`）

```typescript
let _adminApp: App | null = null;
let _adminDb: Firestore | null = null;

function getAdminApp(): App {
  if (_adminApp) return _adminApp;
  if (getApps().length > 0) {
    _adminApp = getApps()[0];
    return _adminApp;
  }
  _adminApp = initializeApp({ projectId });
  return _adminApp;
}

export function getAdminDb(): Firestore {
  if (!_adminDb) {
    _adminDb = getFirestore(getAdminApp());
  }
  return _adminDb;
}
```

## Firestore セキュリティルール概要

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // プロジェクト: 所有者のみアクセス可
    match /projects/{projectId} {
      allow read, write: if request.auth != null
        && resource.data.userId == request.auth.uid;
    }

    // レビュー記事: 認証済みユーザー（プロジェクト所有者チェックはアプリ層）
    match /reviewArticles/{articleId} {
      allow read, write: if request.auth != null;
    }

    // AI キャッシュ: サーバー側のみ（Admin SDK でバイパス）
    match /aiCache/{cacheKey} {
      allow read, write: if false; // Admin SDK 経由のみ
    }
  }
}
```

## ADC（Application Default Credentials）

| 環境 | 認証方法 |
|------|----------|
| Firebase App Hosting（本番） | ADC が自動提供。設定不要 |
| Cloud Run / GCE | サービスアカウントが自動で使用される |
| ローカル開発 | `gcloud auth application-default login` を事前実行 |

Admin SDK の `initializeApp()` にサービスアカウント JSON は不要。ADC が自動的に使用される。

## キャッシュ層（`shared/ai/cache.ts`）

- **Firestore コレクション**: `aiCache`
- **キャッシュキー**: リクエスト内容の SHA-256 ハッシュ（`shared/ai/claude.ts` の `sha256Hash()`）
- **TTL**: 30日（`expiresAt` フィールドで管理）
- **SDK**: Admin SDK 必須（セキュリティルールで Client SDK からのアクセスは拒否）
- **構造**:
  ```typescript
  interface CacheEntry {
    cacheKey: string;
    response: unknown;
    createdAt: Timestamp;
    expiresAt: Timestamp;
  }
  ```
- 期限切れエントリは読み取り時に遅延削除
