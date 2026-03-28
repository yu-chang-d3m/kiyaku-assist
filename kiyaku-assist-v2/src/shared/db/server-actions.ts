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
import type { Project, ReviewArticle, StandardArticleFirestore } from "@/shared/db/types";
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ReviewArticleSchema,
  StandardArticleSchema,
} from "@/shared/db/schemas";

// ---------- ヘルパー ----------

/** Firestore Timestamp を ISO 文字列に変換する */
function serializeTimestamps<T extends Record<string, unknown>>(doc: T): T {
  const result = { ...doc };
  for (const [key, value] of Object.entries(result)) {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
      (result as Record<string, unknown>)[key] = (value as { toDate: () => Date }).toDate().toISOString();
    }
  }
  return result;
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

  return serializeTimestamps({ id: snap.id, ...(snap.data() as Project) });
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

  return snap.docs.map((d) => serializeTimestamps({ id: d.id, ...(d.data() as Project) }));
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

// ---------- パース結果の永続化 ----------

/**
 * パース結果を Firestore に保存する
 * projects/{projectId}/metadata/parsedBylaws にドキュメントとして保存
 */
export async function saveParsedBylawsToFirestore(
  projectId: string,
  parsedBylaws: unknown,
): Promise<void> {
  const db = getAdminDb();
  await db
    .collection("projects")
    .doc(projectId)
    .collection("metadata")
    .doc("parsedBylaws")
    .set({
      data: JSON.stringify(parsedBylaws),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

/**
 * Firestore からパース結果を取得する
 */
export async function loadParsedBylawsFromFirestore(
  projectId: string,
): Promise<unknown | null> {
  const db = getAdminDb();
  const snap = await db
    .collection("projects")
    .doc(projectId)
    .collection("metadata")
    .doc("parsedBylaws")
    .get();

  if (!snap.exists) return null;
  const raw = snap.data()?.data;
  if (!raw) return null;
  try {
    return JSON.parse(raw as string);
  } catch {
    return null;
  }
}

// ---------- 管理操作 ----------

/**
 * AI キャッシュ（aiCache コレクション）を全件削除する
 */
export async function clearAiCache(): Promise<number> {
  const db = getAdminDb();
  const snap = await db.collection("aiCache").get();
  if (snap.empty) return 0;

  const BATCH_LIMIT = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.size;
}

/**
 * 全プロジェクトとそのサブコレクションを削除する
 */
export async function clearAllProjects(): Promise<number> {
  const db = getAdminDb();
  const snap = await db.collection("projects").get();
  if (snap.empty) return 0;

  const BATCH_LIMIT = 500;
  for (const projectDoc of snap.docs) {
    // サブコレクション: reviewArticles, metadata
    for (const subName of ["reviewArticles", "metadata"]) {
      const subSnap = await projectDoc.ref.collection(subName).get();
      for (let i = 0; i < subSnap.docs.length; i += BATCH_LIMIT) {
        const chunk = subSnap.docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const doc of chunk) batch.delete(doc.ref);
        await batch.commit();
      }
    }
  }

  // プロジェクト本体を削除
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
  }
  return snap.size;
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
/**
 * 指定した条番号のレビュー記事を一括削除する
 */
export async function deleteReviewArticles(
  projectId: string,
  articleNums: string[],
): Promise<number> {
  if (articleNums.length === 0) return 0;

  const db = getAdminDb();
  const BATCH_LIMIT = 500;
  let deleted = 0;

  for (let i = 0; i < articleNums.length; i += BATCH_LIMIT) {
    const chunk = articleNums.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const articleNum of chunk) {
      const articleId = encodeArticleId(articleNum);
      const ref = db
        .collection("projects")
        .doc(projectId)
        .collection("reviewArticles")
        .doc(articleId);
      batch.delete(ref);
    }

    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
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

// ---------- 標準管理規約条文 CRUD ----------

/** 条文番号をドキュメント ID に変換（全角→半角、スペース除去） */
function encodeStandardArticleId(articleNum: string): string {
  return articleNum
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\s+/g, "");
}

/**
 * 標準管理規約条文を一括保存する（全件洗い替え）
 *
 * 既存データを全削除してから新規投入する。
 * Firestore パス: standardArticles/{articleNum}
 */
export async function saveStandardArticles(
  articles: Array<z.infer<typeof StandardArticleSchema>>,
): Promise<number> {
  const validated = articles.map((a) => StandardArticleSchema.parse(a));

  const db = getAdminDb();
  const BATCH_LIMIT = 500;

  // 既存データを全削除
  const existingSnap = await db.collection("standardArticles").get();
  if (!existingSnap.empty) {
    for (let i = 0; i < existingSnap.docs.length; i += BATCH_LIMIT) {
      const chunk = existingSnap.docs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const doc of chunk) batch.delete(doc.ref);
      await batch.commit();
    }
  }

  // 新規投入
  for (let i = 0; i < validated.length; i += BATCH_LIMIT) {
    const chunk = validated.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();

    for (const article of chunk) {
      const docId = encodeStandardArticleId(article.articleNum);
      const ref = db.collection("standardArticles").doc(docId);
      batch.set(ref, {
        ...article,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  return validated.length;
}

/**
 * 標準管理規約条文を全件取得する
 */
export async function getStandardArticles(): Promise<StandardArticleFirestore[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("standardArticles")
    .orderBy("chapter")
    .get();

  return snap.docs.map((d) =>
    serializeTimestamps({ ...(d.data() as StandardArticleFirestore) }),
  );
}

/**
 * 指定した意味グループの標準管理規約条文を取得する
 */
export async function getStandardArticlesByGroup(
  semanticGroup: string,
): Promise<StandardArticleFirestore[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("standardArticles")
    .where("semanticGroup", "==", semanticGroup)
    .orderBy("chapter")
    .get();

  return snap.docs.map((d) =>
    serializeTimestamps({ ...(d.data() as StandardArticleFirestore) }),
  );
}

// ---------- 管理会社案 ----------

/**
 * 管理会社案テキストを ReviewArticle に紐付けて保存
 *
 * 既存の ReviewArticle の managementDraft フィールドを更新する。
 */
export async function saveManagementDraftToReviewArticles(
  projectId: string,
  drafts: Array<{ articleNum: string; managementDraft: string }>,
): Promise<{ updated: number }> {
  const db = getAdminDb();
  const col = db.collection(`projects/${projectId}/reviewArticles`);

  let updated = 0;
  const BATCH_LIMIT = 500;

  for (let i = 0; i < drafts.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = drafts.slice(i, i + BATCH_LIMIT);

    for (const d of chunk) {
      // articleNum で既存ドキュメントを検索
      const snap = await col
        .where("articleNum", "==", d.articleNum)
        .limit(1)
        .get();

      if (!snap.empty) {
        batch.update(snap.docs[0].ref, {
          managementDraft: d.managementDraft,
          updatedAt: new Date().toISOString(),
        });
        updated++;
      }
    }

    await batch.commit();
  }

  // プロジェクトの hasManagementDraft フラグを更新
  if (updated > 0) {
    await db.doc(`projects/${projectId}`).update({
      hasManagementDraft: true,
      updatedAt: new Date().toISOString(),
    });
  }

  return { updated };
}
