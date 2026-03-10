/**
 * Zustand ストア — プロジェクトデータの状態管理
 *
 * persist middleware + sessionStorage でタブ単位の永続化を実現。
 * v2 ではドメイン型（ParseResult, GapAnalysisItem, ReviewArticle 等）に合わせて再設計。
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ParseResult } from "@/domains/ingestion/types";
import type { GapAnalysisItem } from "@/domains/analysis/types";
import type { ReviewArticle } from "@/shared/db/types";

// ---------- ストア型定義 ----------

interface ProjectState {
  // データ
  /** パース結果 */
  parsedBylaws: ParseResult | null;
  /** ギャップ分析結果 */
  gapResults: GapAnalysisItem[] | null;
  /** ユーザーの決定（条番号 → 決定状態） */
  reviewDecisions: Record<string, string> | null;
  /** ユーザーメモ（条番号 → メモ） */
  reviewMemos: Record<string, string> | null;
  /** レビュー記事一覧 */
  reviewArticles: ReviewArticle[] | null;
  /** オンボーディングデータ */
  onboarding: Record<string, string> | null;
  /** 現在のプロジェクト ID */
  projectId: string | null;

  // アクション
  setParsedBylaws: (result: ParseResult) => void;
  setGapResults: (results: GapAnalysisItem[]) => void;
  setReviewDecisions: (decisions: Record<string, string>) => void;
  setReviewMemos: (memos: Record<string, string>) => void;
  setReviewArticles: (articles: ReviewArticle[]) => void;
  setOnboarding: (data: Record<string, string>) => void;
  setProjectId: (id: string) => void;
  clearSession: () => void;
}

// ---------- 初期値 ----------

const initialState = {
  parsedBylaws: null,
  gapResults: null,
  reviewDecisions: null,
  reviewMemos: null,
  reviewArticles: null,
  onboarding: null,
  projectId: null,
} satisfies Omit<
  ProjectState,
  | "setParsedBylaws"
  | "setGapResults"
  | "setReviewDecisions"
  | "setReviewMemos"
  | "setReviewArticles"
  | "setOnboarding"
  | "setProjectId"
  | "clearSession"
>;

// ---------- ストア本体 ----------

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      ...initialState,

      setParsedBylaws: (result) => set({ parsedBylaws: result }),
      setGapResults: (results) => set({ gapResults: results }),
      setReviewDecisions: (decisions) => set({ reviewDecisions: decisions }),
      setReviewMemos: (memos) => set({ reviewMemos: memos }),
      setReviewArticles: (articles) => set({ reviewArticles: articles }),
      setOnboarding: (data) => set({ onboarding: data }),
      setProjectId: (id) => set({ projectId: id }),
      clearSession: () => set({ ...initialState }),
    }),
    {
      name: "kiyaku-project-v2",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

// ---------- 互換関数（save/load パターン） ----------
// 各ページの import 先を store.ts に変えるだけで動く

export const saveParsedBylaws = (result: ParseResult) =>
  useProjectStore.getState().setParsedBylaws(result);

export const loadParsedBylaws = (): ParseResult | null =>
  useProjectStore.getState().parsedBylaws;

export const saveGapResults = (results: GapAnalysisItem[]) =>
  useProjectStore.getState().setGapResults(results);

export const loadGapResults = (): GapAnalysisItem[] | null =>
  useProjectStore.getState().gapResults;

export const saveReviewDecisions = (decisions: Record<string, string>) =>
  useProjectStore.getState().setReviewDecisions(decisions);

export const loadReviewDecisions = (): Record<string, string> | null =>
  useProjectStore.getState().reviewDecisions;

export const saveReviewMemos = (memos: Record<string, string>) =>
  useProjectStore.getState().setReviewMemos(memos);

export const loadReviewMemos = (): Record<string, string> | null =>
  useProjectStore.getState().reviewMemos;

export const saveReviewArticles = (articles: ReviewArticle[]) =>
  useProjectStore.getState().setReviewArticles(articles);

export const loadReviewArticles = (): ReviewArticle[] | null =>
  useProjectStore.getState().reviewArticles;

export const saveOnboarding = (data: Record<string, string>) =>
  useProjectStore.getState().setOnboarding(data);

export const loadOnboarding = (): Record<string, string> | null =>
  useProjectStore.getState().onboarding;

export const saveProjectId = (id: string) =>
  useProjectStore.getState().setProjectId(id);

export const loadProjectId = (): string | null =>
  useProjectStore.getState().projectId;

export const clearSession = (): void =>
  useProjectStore.getState().clearSession();
