"use server";

/**
 * Server Actions — Firestore への CRUD 操作
 *
 * Firebase Admin SDK を使用してセキュリティルールをバイパスし、
 * サービスアカウント権限で Firestore にアクセスする。
 *
 * v2.1: Client SDK → Admin SDK に移行（権限エラー解消）
 */

import * as z from "zod/v4";
import { getAdminDb } from "@/shared/db/admin";
import { FieldValue } from "firebase-admin/firestore";
import type { Project, ReviewArticle } from "@/shared/db/types";
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ReviewArticleSchema,
} from "@/shared/db/schemas";

// ---------- ヘルパー ----------

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
  const validated = ProjectCreateSchema.parse(data);

  const db = getAdminDb();
  const docRef = await db.collection("projects").add({
    ...validated,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * プロジェクトを ID で取得する
 */
export async function getProject(
  projectId: string,
): Promise<(Project & { id: string }) | null> {
  const db = getAdminDb();
  const snap = await db.collection("projects").doc(projectId).get();

  if (!snap.exists) return null;

  return { id: snap.id, ...(snap.data() as Project) };
}

/**
 * プロジェクトを部分更新する
 */
export async function updateProject(
  projectId: string,
  data: z.infer<typeof ProjectUpdateSchema>,
): Promise<void> {
  const validated = ProjectUpdateSchema.parse(data);

  const db = getAdminDb();
  await db
    .collection("projects")
    .doc(projectId)
    .update({
      ...validated,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * ユーザーに紐づくプロジェクト一覧を取得する
 */
export async function listProjects(
  userId: string,
): Promise<Array<Project & { id: string }>> {
  const db = getAdminDb();
  const snap = await db
    .collection("projects")
    .where("userId", "==", userId)
    .orderBy("updatedAt", "desc")
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Project) }));
}

/**
 * プロジェクトとそのサブコレクション（reviewArticles）を削除する
 */
export async function deleteProject(projectId: string): Promise<void> {
  const db = getAdminDb();
  const BATCH_LIMIT = 500;

  // サブコレクション（reviewArticles）を先に削除
  const reviewSnap = await db
    .collection("projects")
    .doc(projectId)
    .collection("reviewArticles")
    .get();

  for (let i = 0; i < reviewSnap.docs.length; i += BATCH_LIMIT) {
    const chunk = reviewSnap.docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  // プロジェクトドキュメント本体を削除
  await db.collection("projects").doc(projectId).delete();
}

// ---------- レビュー記事 CRUD ----------

/**
 * 単一のレビュー記事を保存する（upsert）
 */
export async function saveReviewArticle(
  projectId: string,
  article: z.infer<typeof ReviewArticleSchema>,
): Promise<void> {
  const validated = ReviewArticleSchema.parse(article);

  const db = getAdminDb();
  const articleId = encodeArticleId(validated.articleNum);

  await db
    .collection("projects")
    .doc(projectId)
    .collection("reviewArticles")
    .doc(articleId)
    .set({
      ...validated,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * プロジェクトに紐づくレビュー記事を全件取得する
 */
export async function getReviewArticles(
  projectId: string,
): Promise<ReviewArticle[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("projects")
    .doc(projectId)
    .collection("reviewArticles")
    .get();

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
  const validated = articles.map((a) => ReviewArticleSchema.parse(a));

  const db = getAdminDb();
  const BATCH_LIMIT = 500;

  for (let i = 0; i < validated.length; i += BATCH_LIMIT) {
    const chunk = validated.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const article of chunk) {
      const articleId = encodeArticleId(article.articleNum);
      const ref = db
        .collection("projects")
        .doc(projectId)
        .collection("reviewArticles")
        .doc(articleId);
      batch.set(ref, {
        ...article,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }
}
