"use server";

/**
 * Server Actions — Firestore への CRUD 操作
 *
 * Next.js の Server Actions として実装し、
 * クライアントから直接呼び出せるようにする。
 *
 * v1 からの改善点:
 * - Zod バリデーションの導入
 * - 'use server' ディレクティブによる Server Actions 化
 * - エラーハンドリングの標準化
 */

import * as z from "zod/v4";
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
import { isFirebaseConfigured, getDb } from "@/shared/db/firestore";
import type { Project, ReviewArticle } from "@/shared/db/types";
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ReviewArticleSchema,
} from "@/shared/db/schemas";

// ---------- ヘルパー ----------

/** Firebase 未設定時にスローする共通ガード */
function ensureConfigured(): void {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase が設定されていません。Firestore は利用できません。",
    );
  }
}

/** articleNum をドキュメント ID に変換（"/" を "_" にエスケープ） */
function encodeArticleId(articleNum: string): string {
  return articleNum.replace(/\//g, "_");
}

// ---------- プロジェクト CRUD ----------

/**
 * 新規プロジェクトを作成し、ドキュメント ID を返す
 */
export async function createProject(
  data: z.infer<typeof ProjectCreateSchema>,
): Promise<string> {
  ensureConfigured();

  // Zod バリデーション
  const validated = ProjectCreateSchema.parse(data);

  const db = getDb();
  const docRef = await addDoc(collection(db, "projects"), {
    ...validated,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * プロジェクトを ID で取得する
 */
export async function getProject(
  projectId: string,
): Promise<(Project & { id: string }) | null> {
  ensureConfigured();

  const db = getDb();
  const snap = await getDoc(doc(db, "projects", projectId));

  if (!snap.exists()) return null;

  return { id: snap.id, ...(snap.data() as Project) };
}

/**
 * プロジェクトを部分更新する
 */
export async function updateProject(
  projectId: string,
  data: z.infer<typeof ProjectUpdateSchema>,
): Promise<void> {
  ensureConfigured();

  // Zod バリデーション
  const validated = ProjectUpdateSchema.parse(data);

  const db = getDb();
  await updateDoc(doc(db, "projects", projectId), {
    ...validated,
    updatedAt: serverTimestamp(),
  });
}

/**
 * ユーザーに紐づくプロジェクト一覧を取得する
 */
export async function listProjects(
  userId: string,
): Promise<Array<Project & { id: string }>> {
  ensureConfigured();

  const db = getDb();
  const q = query(
    collection(db, "projects"),
    where("userId", "==", userId),
    orderBy("updatedAt", "desc"),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Project) }));
}

// ---------- レビュー記事 CRUD ----------

/**
 * 単一のレビュー記事を保存する（upsert）
 */
export async function saveReviewArticle(
  projectId: string,
  article: z.infer<typeof ReviewArticleSchema>,
): Promise<void> {
  ensureConfigured();

  // Zod バリデーション
  const validated = ReviewArticleSchema.parse(article);

  const db = getDb();
  const articleId = encodeArticleId(validated.articleNum);

  await setDoc(
    doc(db, "projects", projectId, "reviewArticles", articleId),
    {
      ...validated,
      updatedAt: serverTimestamp(),
    },
  );
}

/**
 * プロジェクトに紐づくレビュー記事を全件取得する
 */
export async function getReviewArticles(
  projectId: string,
): Promise<ReviewArticle[]> {
  ensureConfigured();

  const db = getDb();
  const snap = await getDocs(
    collection(db, "projects", projectId, "reviewArticles"),
  );

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ReviewArticle, "id">),
  }));
}

/**
 * レビュー記事を一括保存する（バッチ書き込み）
 *
 * Firestore のバッチ書き込みは 500 件が上限のため、分割して処理する。
 */
export async function batchSaveReviewArticles(
  projectId: string,
  articles: Array<z.infer<typeof ReviewArticleSchema>>,
): Promise<void> {
  ensureConfigured();

  // 全件バリデーション
  const validated = articles.map((a) => ReviewArticleSchema.parse(a));

  const db = getDb();
  const BATCH_LIMIT = 500;

  for (let i = 0; i < validated.length; i += BATCH_LIMIT) {
    const chunk = validated.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    for (const article of chunk) {
      const articleId = encodeArticleId(article.articleNum);
      const ref = doc(db, "projects", projectId, "reviewArticles", articleId);
      batch.set(ref, {
        ...article,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }
}
