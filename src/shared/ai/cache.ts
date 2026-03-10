/**
 * Firestore ベースの AI レスポンスキャッシュ
 *
 * Claude API の呼び出し結果をキャッシュし、
 * 同じ入力に対する再計算を回避する。
 *
 * - キャッシュキーは入力の SHA-256 ハッシュ
 * - TTL（有効期限）付きで Firestore に保存
 * - Firebase 未設定時は何もしない（キャッシュなし動作）
 */

import { sha256Hash } from "@/shared/ai/claude";
import { logger } from "@/shared/observability/logger";

// ---------- 型定義 ----------

/** キャッシュエントリ（Firestore ドキュメント） */
interface CacheEntry {
  cacheKey: string;
  response: unknown;
  createdAt: Date;
  expiresAt: Date;
}

// ---------- キャッシュ操作 ----------

/**
 * キャッシュからレスポンスを取得する
 *
 * @param cacheKey - キャッシュキー（SHA-256 ハッシュ）
 * @returns キャッシュされたレスポンス、またはキャッシュミス時は null
 */
export async function getCachedResponse(cacheKey: string): Promise<unknown | null> {
  try {
    // Firebase の動的 import（未設定時のエラーを防ぐ）
    const { isFirebaseConfigured, getDb } = await import("@/shared/db/firestore");
    if (!isFirebaseConfigured) return null;

    const { doc, getDoc } = await import("firebase/firestore");
    const db = getDb();
    const docRef = doc(db, "aiCache", cacheKey);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data() as CacheEntry;

    // 有効期限チェック
    const expiresAt = data.expiresAt instanceof Date
      ? data.expiresAt
      : new Date((data.expiresAt as unknown as { seconds: number }).seconds * 1000);

    if (expiresAt < new Date()) {
      logger.info({ cacheKey }, "キャッシュ期限切れ");
      return null;
    }

    logger.info({ cacheKey }, "キャッシュヒット");
    return data.response;
  } catch (error) {
    logger.warn({ cacheKey, error }, "キャッシュ取得に失敗（無視して続行）");
    return null;
  }
}

/**
 * レスポンスをキャッシュに保存する
 *
 * @param cacheKey - キャッシュキー（SHA-256 ハッシュ）
 * @param response - 保存するレスポンスデータ
 * @param ttlDays - 有効期限（日数、デフォルト: 30）
 */
export async function setCachedResponse(
  cacheKey: string,
  response: unknown,
  ttlDays: number = 30,
): Promise<void> {
  try {
    const { isFirebaseConfigured, getDb } = await import("@/shared/db/firestore");
    if (!isFirebaseConfigured) return;

    const { doc, setDoc } = await import("firebase/firestore");
    const db = getDb();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const entry: CacheEntry = {
      cacheKey,
      response,
      createdAt: now,
      expiresAt,
    };

    await setDoc(doc(db, "aiCache", cacheKey), entry);
    logger.info({ cacheKey, ttlDays }, "キャッシュに保存");
  } catch (error) {
    logger.warn({ cacheKey, error }, "キャッシュ保存に失敗（無視して続行）");
  }
}

/**
 * 複数の入力値からキャッシュキーを生成する
 *
 * 入力値を結合して SHA-256 ハッシュを計算する。
 * 同じ入力の組み合わせは常に同じキーを返す。
 *
 * @param inputs - キー生成に使用する入力値
 * @returns SHA-256 ハッシュ文字列
 */
export function generateCacheKey(...inputs: string[]): string {
  const combined = inputs.join("|");
  return sha256Hash(combined);
}
