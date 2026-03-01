/**
 * セッションストア — Firestore 接続前の一時的なクライアントサイドデータ保持
 * sessionStorage を使用（タブを閉じるとクリアされる）
 */

import type { ParseResult, GapItem } from "@/lib/api";
import type { Decision, ReviewArticle } from "@/lib/sample-review";

const KEYS = {
  PARSED_BYLAWS: "kiyaku_parsed_bylaws",
  GAP_RESULTS: "kiyaku_gap_results",
  REVIEW_ARTICLES: "kiyaku_review_articles",
  REVIEW_DECISIONS: "kiyaku_review_decisions",
  REVIEW_MEMOS: "kiyaku_review_memos",
  ONBOARDING: "kiyaku_onboarding",
} as const;

function getItem<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setItem(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify(value));
}

// ---- パース結果 ----

export function saveParsedBylaws(result: ParseResult): void {
  setItem(KEYS.PARSED_BYLAWS, result);
}

export function loadParsedBylaws(): ParseResult | null {
  return getItem<ParseResult>(KEYS.PARSED_BYLAWS);
}

// ---- ギャップ分析結果 ----

export function saveGapResults(results: GapItem[]): void {
  setItem(KEYS.GAP_RESULTS, results);
}

export function loadGapResults(): GapItem[] | null {
  return getItem<GapItem[]>(KEYS.GAP_RESULTS);
}

// ---- レビュー記事 ----

export function saveReviewArticles(articles: ReviewArticle[]): void {
  setItem(KEYS.REVIEW_ARTICLES, articles);
}

export function loadReviewArticles(): ReviewArticle[] | null {
  return getItem<ReviewArticle[]>(KEYS.REVIEW_ARTICLES);
}

// ---- レビュー判断 ----

export function saveReviewDecisions(decisions: Record<string, Decision>): void {
  setItem(KEYS.REVIEW_DECISIONS, decisions);
}

export function loadReviewDecisions(): Record<string, Decision> | null {
  return getItem<Record<string, Decision>>(KEYS.REVIEW_DECISIONS);
}

// ---- レビューメモ ----

export function saveReviewMemos(memos: Record<string, string>): void {
  setItem(KEYS.REVIEW_MEMOS, memos);
}

export function loadReviewMemos(): Record<string, string> | null {
  return getItem<Record<string, string>>(KEYS.REVIEW_MEMOS);
}

// ---- オンボーディング ----

export function saveOnboarding(data: Record<string, string>): void {
  setItem(KEYS.ONBOARDING, data);
}

export function loadOnboarding(): Record<string, string> | null {
  return getItem<Record<string, string>>(KEYS.ONBOARDING);
}

// ---- セッション全体のクリア ----

export function clearSession(): void {
  if (typeof window === "undefined") return;
  Object.values(KEYS).forEach((key) => sessionStorage.removeItem(key));
}
