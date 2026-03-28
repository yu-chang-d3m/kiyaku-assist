/**
 * Firestore アクセス層
 *
 * Firebase App の初期化と Firestore / Auth インスタンスの遅延取得を担う。
 *
 * v1 からの改善点:
 * - 遅延初期化パターンを維持しつつ、isFirebaseConfigured を const export
 * - Auth インスタンスの取得も同ファイルに集約
 * - 型安全性の向上
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

// ---------- Firebase 設定 ----------

/** 環境変数から Firebase 設定を構築 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Firebase が設定済みかどうか
 *
 * apiKey が存在すれば設定済みとみなす。
 * 未設定時はデモモードで動作する（Firestore アクセスは全てスキップ）。
 */
export const isFirebaseConfigured: boolean = Boolean(firebaseConfig.apiKey);

// ---------- 遅延初期化 ----------

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

/**
 * Firebase App を取得する（遅延初期化）
 *
 * @returns Firebase App インスタンス、未設定時は null
 */
function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (_app) return _app;
  _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

/**
 * Firestore インスタンスを取得する
 *
 * @throws Firebase が未設定の場合
 */
export function getDb(): Firestore {
  if (!_db) {
    const app = getFirebaseApp();
    if (!app) {
      throw new Error(
        "Firebase が設定されていません。Firestore は利用できません。" +
          ".env.local に Firebase の環境変数を設定してください。",
      );
    }
    _db = getFirestore(app);
  }
  return _db;
}

/**
 * Firebase Auth インスタンスを取得する
 *
 * @throws Firebase が未設定の場合
 */
export function getFirebaseAuth(): Auth {
  if (!_auth) {
    const app = getFirebaseApp();
    if (!app) {
      throw new Error(
        "Firebase が設定されていません。Auth は利用できません。" +
          ".env.local に Firebase の環境変数を設定してください。",
      );
    }
    _auth = getAuth(app);
  }
  return _auth;
}
