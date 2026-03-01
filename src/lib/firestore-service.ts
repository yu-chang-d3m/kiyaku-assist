/**
 * Firestore サービス — プロジェクトおよびレビュー記事の永続化レイヤー
 *
 * Firebase が未設定の場合は全関数がエラーをスローする。
 * 呼び出し側（use-store.ts）で sessionStorage へフォールバックする設計。
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { isFirebaseConfigured, getDb } from "@/lib/firebase";
import type { Project, ReviewArticle } from "@/lib/firestore-types";

// ============================================================
// ヘルパー
// ============================================================

/** Firebase 未設定時にスローする共通ガード */
function ensureConfigured(): void {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase が設定されていません。Firestore は利用できません。"
    );
  }
}

// ============================================================
// プロジェクト CRUD
// ============================================================

/**
 * 新規プロジェクトを作成し、ドキュメント ID を返す
 */
export async function createProject(
  userId: string,
  data: Omit<Project, "createdAt" | "updatedAt">
): Promise<string> {
  ensureConfigured();
  const db = getDb();

  const docRef = await addDoc(collection(db, "projects"), {
    ...data,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * プロジェクトを ID で取得する
 */
export async function getProject(
  projectId: string
): Promise<(Project & { id: string }) | null> {
  ensureConfigured();
  const db = getDb();

  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists()) return null;

  return { id: snap.id, ...(snap.data() as Project) };
}

/**
 * プロジェクトを部分更新する
 *
 * extraFields で Project 型に定義されていない追加フィールド
 * （bylawsMetadata, gapResults 等）も保存できる。
 */
export async function updateProject(
  projectId: string,
  data: Partial<Project>,
  extraFields?: Record<string, unknown>
): Promise<void> {
  ensureConfigured();
  const db = getDb();

  await updateDoc(doc(db, "projects", projectId), {
    ...data,
    ...extraFields,
    updatedAt: serverTimestamp(),
  });
}

/**
 * ユーザーに紐づくプロジェクト一覧を取得する
 */
export async function listProjects(
  userId: string
): Promise<Array<Project & { id: string }>> {
  ensureConfigured();
  const db = getDb();

  const q = query(
    collection(db, "projects"),
    where("userId", "==", userId),
    orderBy("updatedAt", "desc")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Project) }));
}

// ============================================================
// レビュー記事 CRUD
// ============================================================

/**
 * 単一のレビュー記事を保存する（upsert）
 * articleNum をドキュメント ID として使用する
 */
export async function saveReviewArticle(
  projectId: string,
  article: ReviewArticle
): Promise<void> {
  ensureConfigured();
  const db = getDb();

  // articleNum からドキュメント ID に適した文字列を生成
  const articleId = encodeArticleId(article.articleNum);

  await setDoc(
    doc(db, "projects", projectId, "reviewArticles", articleId),
    {
      ...article,
      updatedAt: serverTimestamp(),
    }
  );
}

/**
 * プロジェクトに紐づくレビュー記事を全件取得する
 */
export async function getReviewArticles(
  projectId: string
): Promise<ReviewArticle[]> {
  ensureConfigured();
  const db = getDb();

  const snap = await getDocs(
    collection(db, "projects", projectId, "reviewArticles")
  );

  return snap.docs.map((d) => d.data() as ReviewArticle);
}

/**
 * レビュー記事を一括保存する（バッチ書き込み）
 *
 * Firestore のバッチ書き込みは 500 件が上限のため、
 * 500 件ごとにバッチを分割して処理する。
 */
export async function batchSaveReviewArticles(
  projectId: string,
  articles: ReviewArticle[]
): Promise<void> {
  ensureConfigured();
  const db = getDb();

  const BATCH_LIMIT = 500;

  for (let i = 0; i < articles.length; i += BATCH_LIMIT) {
    const chunk = articles.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const article of chunk) {
      const articleId = encodeArticleId(article.articleNum);
      const ref = doc(
        db,
        "projects",
        projectId,
        "reviewArticles",
        articleId
      );
      batch.set(ref, {
        ...article,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }
}

// ============================================================
// ユーティリティ（内部）
// ============================================================

/**
 * articleNum（例: "第3条"）を Firestore ドキュメント ID に変換する。
 * "/" は Firestore パスの区切りと衝突するためエンコードする。
 */
function encodeArticleId(articleNum: string): string {
  return articleNum.replace(/\//g, "_");
}
