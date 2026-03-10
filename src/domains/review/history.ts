/**
 * 修正履歴管理
 *
 * 条文の修正履歴を管理し、差分の要約や履歴の取得を行う。
 */

import type { ModificationEntry, ReviewArticleState } from "@/domains/review/types";

// ---------- 公開 API ----------

/**
 * 修正履歴を時系列で取得する（新しい順）
 */
export function getHistory(state: ReviewArticleState): ModificationEntry[] {
  return [...state.history].reverse();
}

/**
 * 直近の修正を取得する
 */
export function getLatestModification(
  state: ReviewArticleState,
): ModificationEntry | null {
  if (state.history.length === 0) return null;
  return state.history[state.history.length - 1];
}

/**
 * 修正回数を取得する
 */
export function getModificationCount(state: ReviewArticleState): number {
  return state.history.length;
}

/**
 * 修正履歴のサマリーを生成する（テキスト形式）
 */
export function formatHistorySummary(state: ReviewArticleState): string {
  if (state.history.length === 0) {
    return "修正履歴はありません。";
  }

  const lines: string[] = [];
  lines.push(`## ${state.articleNum} の修正履歴（全 ${state.history.length} 件）`);
  lines.push("");

  for (let i = state.history.length - 1; i >= 0; i--) {
    const entry = state.history[i];
    const date = new Date(entry.modifiedAt);
    const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

    lines.push(`### 修正 #${i + 1}（${dateStr}）`);
    lines.push(`**理由**: ${entry.reason}`);
    lines.push("");
    lines.push("修正前:");
    lines.push("```");
    lines.push(truncateText(entry.before, 200));
    lines.push("```");
    lines.push("");
    lines.push("修正後:");
    lines.push("```");
    lines.push(truncateText(entry.after, 200));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 修正履歴を文字列配列に変換する（Firestore 保存用）
 *
 * v1 互換: modificationHistory フィールドは string[] 形式
 */
export function historyToStringArray(state: ReviewArticleState): string[] {
  return state.history.map((entry) => {
    const date = new Date(entry.modifiedAt);
    const dateStr = date.toISOString();
    return `[${dateStr}] ${entry.reason}: ${truncateText(entry.after, 100)}`;
  });
}

// ---------- ユーティリティ ----------

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}
