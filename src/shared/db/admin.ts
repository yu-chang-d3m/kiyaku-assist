/**
 * Firebase Admin SDK — サーバー側 Firestore アクセス
 *
 * API Route / Server Actions からは Admin SDK を使用することで、
 * Firestore セキュリティルールをバイパスし、サービスアカウント権限でアクセスする。
 *
 * Firebase App Hosting では Application Default Credentials (ADC) が自動提供されるため、
 * サービスアカウント JSON は不要。
 */

import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let _adminApp: App | null = null;
let _adminDb: Firestore | null = null;

/**
 * Firebase Admin App を取得する（遅延初期化）
 */
function getAdminApp(): App {
  if (_adminApp) return _adminApp;

  if (getApps().length > 0) {
    _adminApp = getApps()[0];
    return _adminApp;
  }

  // Firebase App Hosting / Cloud Run では ADC が自動提供される
  // ローカル開発では GOOGLE_APPLICATION_CREDENTIALS 環境変数 or gcloud auth application-default login
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // ADC（App Hosting / Cloud Run / gcloud auth application-default login）
  _adminApp = initializeApp({ projectId });

  return _adminApp;
}

/**
 * Admin Firestore インスタンスを取得する
 */
export function getAdminDb(): Firestore {
  if (!_adminDb) {
    _adminDb = getFirestore(getAdminApp());
  }
  return _adminDb;
}
