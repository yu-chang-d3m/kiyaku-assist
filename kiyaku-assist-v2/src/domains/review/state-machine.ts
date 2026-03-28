/**
 * 状態遷移マシン — 条文ごとの決定状態を管理する
 *
 * 各条文は以下の状態を持つ:
 * - null: 未決定（初期状態）
 * - "pending": 保留
 * - "adopted": 採用（AI ドラフトをそのまま採用）
 * - "modified": 修正（ユーザーが修正した上で採用）
 *
 * 状態遷移はイベント駆動で、全ての遷移を履歴に記録する。
 */

import type {
  ArticleDecision,
  ReviewEvent,
  ReviewArticleState,
  ReviewProgress,
  ModificationEntry,
} from "@/domains/review/types";

// ---------- 状態遷移ロジック ----------

/**
 * イベントを適用して新しい状態を返す（イミュータブル）
 *
 * @param state - 現在の状態
 * @param event - 適用するイベント
 * @returns 新しい状態
 */
export function applyEvent(
  state: ReviewArticleState,
  event: ReviewEvent,
): ReviewArticleState {
  switch (event.type) {
    case "ADOPT":
      return {
        ...state,
        decision: "adopted",
      };

    case "MODIFY": {
      const entry: ModificationEntry = {
        before: state.currentDraft,
        after: event.newText,
        reason: event.reason,
        modifiedAt: new Date().toISOString(),
      };
      return {
        ...state,
        decision: "modified",
        currentDraft: event.newText,
        history: [...state.history, entry],
      };
    }

    case "RESET":
      return {
        ...state,
        decision: "pending",
      };

    case "ADD_MEMO":
      return {
        ...state,
        memo: event.memo,
      };

    default: {
      // 網羅性チェック
      const _exhaustive: never = event;
      return state;
    }
  }
}

/**
 * 初期状態を作成する
 */
export function createInitialState(
  articleNum: string,
  draft: string,
): ReviewArticleState {
  return {
    articleNum,
    decision: null,
    currentDraft: draft,
    history: [],
    memo: "",
  };
}

/**
 * 指定した決定状態への遷移が有効かどうかを判定する
 */
export function isValidTransition(
  currentDecision: ArticleDecision,
  targetDecision: ArticleDecision,
): boolean {
  // null（未決定）からはどの状態にも遷移可能
  if (currentDecision === null) return true;

  // pending からはどの状態にも遷移可能
  if (currentDecision === "pending") return true;

  // adopted/modified からは pending（リセット）にのみ遷移可能
  if (currentDecision === "adopted" || currentDecision === "modified") {
    return targetDecision === "pending" || targetDecision === null;
  }

  return false;
}

// ---------- 進捗計算 ----------

/**
 * レビュー全体の進捗を計算する
 *
 * @param states - 全条文の状態
 * @returns 進捗情報
 */
export function calculateProgress(states: ReviewArticleState[]): ReviewProgress {
  const total = states.length;
  let adopted = 0;
  let modified = 0;
  let pending = 0;
  let undecided = 0;

  for (const state of states) {
    switch (state.decision) {
      case "adopted":
        adopted++;
        break;
      case "modified":
        modified++;
        break;
      case "pending":
        pending++;
        break;
      case null:
        undecided++;
        break;
    }
  }

  const decided = adopted + modified;
  const progressPercent = total > 0 ? Math.round((decided / total) * 100) : 0;

  return {
    total,
    adopted,
    modified,
    pending,
    undecided,
    progressPercent,
  };
}
