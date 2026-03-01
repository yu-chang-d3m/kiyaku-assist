"use client";

/**
 * ハイブリッドストアフック
 *
 * Firebase が設定済み＆ユーザー認証済みの場合は Firestore を使用し、
 * それ以外の場合は sessionStorage にフォールバックする。
 *
 * session-store.ts と同じ関数シグネチャ（同期的）を維持するため、
 * Firestore への非同期書き込みは内部で fire-and-forget する。
 * 読み込みは sessionStorage のキャッシュを優先し、
 * Firestore からの読み込みは初回マウント時にバックグラウンドで行う。
 *
 * 【設計方針】
 * - saveParsedBylaws / loadParsedBylaws:
 *   パース結果は大きいため、本文は常に sessionStorage に保持。
 *   Firestore には章のメタデータ（章番号・タイトル・条文数）のみ保存。
 * - saveReviewArticles / loadReviewArticles:
 *   Firestore に全文保存 + sessionStorage にもキャッシュ。
 * - その他（gap, decisions, memos）:
 *   Firestore プロジェクトドキュメント内のフィールドまたは
 *   サブコレクションとして保存 + sessionStorage にもキャッシュ。
 */

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import * as sessionStore from "@/lib/session-store";
import * as firestoreService from "@/lib/firestore-service";
import type { ParseResult, GapItem } from "@/lib/api";
import type { Decision, ReviewArticle } from "@/lib/sample-review";

// ============================================================
// 内部: プロジェクト ID の管理
// ============================================================

const PROJECT_ID_KEY = "kiyaku_current_project_id";

/** 現在のプロジェクト ID を取得する */
function getCurrentProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PROJECT_ID_KEY);
}

/** 現在のプロジェクト ID を設定する */
export function setCurrentProjectId(id: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PROJECT_ID_KEY, id);
}

// ============================================================
// 型定義
// ============================================================

export interface StoreActions {
  /** パース結果を保存する */
  saveParsedBylaws: (result: ParseResult) => void;
  /** パース結果を読み込む */
  loadParsedBylaws: () => ParseResult | null;

  /** ギャップ分析結果を保存する */
  saveGapResults: (results: GapItem[]) => void;
  /** ギャップ分析結果を読み込む */
  loadGapResults: () => GapItem[] | null;

  /** レビュー判断を保存する */
  saveReviewDecisions: (decisions: Record<string, Decision>) => void;
  /** レビュー判断を読み込む */
  loadReviewDecisions: () => Record<string, Decision> | null;

  /** レビューメモを保存する */
  saveReviewMemos: (memos: Record<string, string>) => void;
  /** レビューメモを読み込む */
  loadReviewMemos: () => Record<string, string> | null;

  /** レビュー記事を保存する */
  saveReviewArticles: (articles: ReviewArticle[]) => void;
  /** レビュー記事を読み込む */
  loadReviewArticles: () => ReviewArticle[] | null;

  /** Firestore が有効かどうか */
  isFirestoreActive: boolean;
}

// ============================================================
// フック本体
// ============================================================

export function useStore(): StoreActions {
  const { user, configured } = useAuth();
  const isFirestoreActive = configured && user !== null;

  // Firestore 書き込み中のエラーを抑制するための ref
  const pendingWrites = useRef<Promise<void>[]>([]);

  /**
   * Firestore への非同期書き込みを fire-and-forget で実行する。
   * エラーが発生した場合は console.warn で報告し、sessionStorage のデータはそのまま残す。
   */
  const fireAndForget = useCallback((fn: () => Promise<void>) => {
    const p = fn().catch((err) => {
      console.warn("[useStore] Firestore 書き込みエラー:", err);
    });
    pendingWrites.current.push(p);
  }, []);

  // ----------------------------------------------------------
  // パース結果（本文が大きいので Firestore にはメタデータのみ）
  // ----------------------------------------------------------

  const saveParsedBylaws = useCallback(
    (result: ParseResult) => {
      // 常に sessionStorage に全文保存
      sessionStore.saveParsedBylaws(result);

      if (isFirestoreActive) {
        const projectId = getCurrentProjectId();
        if (projectId) {
          // Firestore にはメタデータのみ保存（本文は大きいため除外）
          const metadata = result.chapters.map((ch) => ({
            chapter: ch.chapter,
            title: ch.title,
            articleCount: ch.articles.length,
          }));
          fireAndForget(() =>
            firestoreService.updateProject(projectId, {}, { bylawsMetadata: metadata })
          );
        }
      }
    },
    [isFirestoreActive, fireAndForget]
  );

  const loadParsedBylaws = useCallback((): ParseResult | null => {
    // パース結果は常に sessionStorage から読む（本文はローカルのみ）
    return sessionStore.loadParsedBylaws();
  }, []);

  // ----------------------------------------------------------
  // ギャップ分析結果
  // ----------------------------------------------------------

  const saveGapResults = useCallback(
    (results: GapItem[]) => {
      sessionStore.saveGapResults(results);

      if (isFirestoreActive) {
        const projectId = getCurrentProjectId();
        if (projectId) {
          fireAndForget(() =>
            firestoreService.updateProject(projectId, {}, { gapResults: results })
          );
        }
      }
    },
    [isFirestoreActive, fireAndForget]
  );

  const loadGapResults = useCallback((): GapItem[] | null => {
    return sessionStore.loadGapResults();
  }, []);

  // ----------------------------------------------------------
  // レビュー判断
  // ----------------------------------------------------------

  const saveReviewDecisions = useCallback(
    (decisions: Record<string, Decision>) => {
      sessionStore.saveReviewDecisions(decisions);

      if (isFirestoreActive) {
        const projectId = getCurrentProjectId();
        if (projectId) {
          fireAndForget(() =>
            firestoreService.updateProject(projectId, {}, { reviewDecisions: decisions })
          );
        }
      }
    },
    [isFirestoreActive, fireAndForget]
  );

  const loadReviewDecisions = useCallback(
    (): Record<string, Decision> | null => {
      return sessionStore.loadReviewDecisions();
    },
    []
  );

  // ----------------------------------------------------------
  // レビューメモ
  // ----------------------------------------------------------

  const saveReviewMemos = useCallback(
    (memos: Record<string, string>) => {
      sessionStore.saveReviewMemos(memos);

      if (isFirestoreActive) {
        const projectId = getCurrentProjectId();
        if (projectId) {
          fireAndForget(() =>
            firestoreService.updateProject(projectId, {}, { reviewMemos: memos })
          );
        }
      }
    },
    [isFirestoreActive, fireAndForget]
  );

  const loadReviewMemos = useCallback((): Record<string, string> | null => {
    return sessionStore.loadReviewMemos();
  }, []);

  // ----------------------------------------------------------
  // レビュー記事
  // ----------------------------------------------------------

  const saveReviewArticles = useCallback(
    (articles: ReviewArticle[]) => {
      // sessionStorage にもキャッシュ
      sessionStore.saveReviewArticles(articles);

      if (isFirestoreActive) {
        const projectId = getCurrentProjectId();
        if (projectId) {
          // ReviewArticle（sample-review.ts）→ Firestore ReviewArticle 型に変換
          const firestoreArticles = articles.map((a) =>
            mapToFirestoreArticle(a)
          );
          fireAndForget(() =>
            firestoreService.batchSaveReviewArticles(
              projectId,
              firestoreArticles
            )
          );
        }
      }
    },
    [isFirestoreActive, fireAndForget]
  );

  const loadReviewArticles = useCallback((): ReviewArticle[] | null => {
    return sessionStore.loadReviewArticles();
  }, []);

  // ----------------------------------------------------------
  // Firestore からの初回読み込み（バックグラウンド同期）
  // ----------------------------------------------------------

  useEffect(() => {
    if (!isFirestoreActive) return;
    const projectId = getCurrentProjectId();
    if (!projectId) return;

    // Firestore からレビュー記事を読み込み、sessionStorage にキャッシュ
    const syncReviewArticles = async () => {
      try {
        const articles = await firestoreService.getReviewArticles(projectId);
        if (articles.length > 0) {
          const mapped = articles.map((a) => mapFromFirestoreArticle(a));
          // sessionStorage に既にデータがない場合のみ上書き
          if (!sessionStore.loadReviewArticles()) {
            sessionStore.saveReviewArticles(mapped);
          }
        }
      } catch (err) {
        console.warn("[useStore] Firestore 初回同期エラー:", err);
      }
    };

    // Firestore からプロジェクトデータを読み込み、gap/decisions/memos を復元
    const syncProjectData = async () => {
      try {
        const project = await firestoreService.getProject(projectId);
        if (!project) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = project as any;

        if (data.gapResults && !sessionStore.loadGapResults()) {
          sessionStore.saveGapResults(data.gapResults);
        }
        if (data.reviewDecisions && !sessionStore.loadReviewDecisions()) {
          sessionStore.saveReviewDecisions(data.reviewDecisions);
        }
        if (data.reviewMemos && !sessionStore.loadReviewMemos()) {
          sessionStore.saveReviewMemos(data.reviewMemos);
        }
      } catch (err) {
        console.warn("[useStore] プロジェクトデータ同期エラー:", err);
      }
    };

    syncReviewArticles();
    syncProjectData();
  }, [isFirestoreActive]);

  return {
    saveParsedBylaws,
    loadParsedBylaws,
    saveGapResults,
    loadGapResults,
    saveReviewDecisions,
    loadReviewDecisions,
    saveReviewMemos,
    loadReviewMemos,
    saveReviewArticles,
    loadReviewArticles,
    isFirestoreActive,
  };
}

// ============================================================
// 型変換ヘルパー
// ============================================================

/**
 * sample-review.ts の ReviewArticle → firestore-types.ts の ReviewArticle に変換
 */
function mapToFirestoreArticle(
  a: ReviewArticle
): import("@/lib/firestore-types").ReviewArticle {
  return {
    chapter: 0, // フロント側の ReviewArticle には chapter がないため仮値
    articleNum: a.articleNum,
    original: a.currentText,
    draft: a.draftText,
    summary: a.summary,
    explanation: a.explanation,
    importance: a.importance,
    baseRef: a.baseRef,
    decision: null,
    modificationHistory: [],
    memo: "",
    category: a.category,
  };
}

/**
 * firestore-types.ts の ReviewArticle → sample-review.ts の ReviewArticle に変換
 */
function mapFromFirestoreArticle(
  a: import("@/lib/firestore-types").ReviewArticle
): ReviewArticle {
  return {
    id: a.articleNum.replace(/\//g, "_"),
    articleNum: a.articleNum,
    title: a.summary.slice(0, 30), // タイトルは summary から生成
    importance: a.importance,
    summary: a.summary,
    explanation: a.explanation,
    currentText: a.original,
    draftText: a.draft,
    baseRef: a.baseRef,
    category: a.category,
  };
}
