/**
 * Zustand ストア — プロジェクトデータのキャッシュ管理
 *
 * Firestore が SSOT（Single Source of Truth）。
 * persist middleware + sessionStorage はタブ単位の高速キャッシュとして機能。
 *
 * キャッシュ対象: parsedBylaws, onboarding, projectId
 * Firestore 直接取得（ストアに持たない）: gapResults, reviewDecisions, reviewMemos, reviewArticles
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ParseResult } from "@/domains/ingestion/types";

// ---------- ストア型定義 ----------

interface ProjectState {
  // キャッシュデータ（Firestore SSOT のローカルキャッシュ）
  /** パース結果（キャッシュ） */
  parsedBylaws: ParseResult | null;
  /** オンボーディングデータ（キャッシュ） */
  onboarding: Record<string, string> | null;
  /** 現在のプロジェクト ID（キャッシュ） */
  projectId: string | null;

  // アクション
  setParsedBylaws: (result: ParseResult) => void;
  setOnboarding: (data: Record<string, string>) => void;
  setProjectId: (id: string) => void;
  /** キャッシュをクリア（ログアウト時等） */
  clearSession: () => void;
}

// ---------- 初期値 ----------

const initialState = {
  parsedBylaws: null,
  onboarding: null,
  projectId: null,
} satisfies Omit<
  ProjectState,
  | "setParsedBylaws"
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
// キャッシュの読み書き用。Firestore SSOT データは各ページで直接取得する。

export const saveParsedBylaws = (result: ParseResult) =>
  useProjectStore.getState().setParsedBylaws(result);

export const loadParsedBylaws = (): ParseResult | null =>
  useProjectStore.getState().parsedBylaws;

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
