"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import {
  SAMPLE_REVIEW_ARTICLES,
  type Decision,
  type ReviewArticle,
} from "@/lib/sample-review";
import { callDraft, type GapItem as ApiGapItem } from "@/lib/api";
import {
  loadGapResults,
  saveReviewDecisions,
  loadReviewDecisions,
  saveReviewMemos,
  loadReviewMemos,
} from "@/lib/session-store";
import type { Importance } from "@/lib/sample-analysis";

const IMPORTANCE_LABEL = {
  mandatory: "法的必須",
  recommended: "推奨",
  optional: "任意",
} as const;

const IMPORTANCE_STYLE = {
  mandatory: "bg-red-500 text-white",
  recommended: "bg-blue-500 text-white",
  optional: "bg-gray-400 text-white",
} as const;

/** API の importance を UI の Importance にマッピング */
function mapImportance(apiImportance: string): Importance {
  switch (apiImportance) {
    case "high":
      return "mandatory";
    case "medium":
      return "recommended";
    case "low":
      return "optional";
    // 既に UI 型になっている場合
    case "mandatory":
      return "mandatory";
    case "recommended":
      return "recommended";
    case "optional":
      return "optional";
    default:
      return "optional";
  }
}

/** API の status を UI の GapStatus にマッピング */
function mapStatus(
  apiStatus: string
): "missing" | "needs-update" | "ok" {
  switch (apiStatus) {
    case "outdated":
      return "needs-update";
    case "missing":
      return "missing";
    case "ok":
    case "extra":
      return "ok";
    case "needs-update":
      return "needs-update";
    default:
      return "ok";
  }
}

/** ギャップ結果から ReviewArticle 形式に変換 */
function gapToReviewArticle(
  gap: ApiGapItem & { id?: string },
  index: number
): ReviewArticle {
  return {
    id: gap.id ?? `rev-${index + 1}`,
    articleNum: gap.articleNum,
    title: gap.title,
    importance: mapImportance(gap.importance),
    summary: gap.summary,
    explanation: "",
    currentText: null,
    draftText: "",
    baseRef: "標準管理規約（令和7年改正）",
    category: gap.category,
  };
}

export default function ReviewPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const initDone = useRef(false);

  /** 初期化: ギャップ結果を読み込み、ReviewArticle に変換 */
  const initialize = useCallback(() => {
    const gaps = loadGapResults();

    if (!gaps || gaps.length === 0) {
      // ギャップ結果がない → 分析画面にリダイレクト
      router.push("/analysis");
      return;
    }

    // status が "ok" 以外のものをレビュー対象にする
    // API 型でも UI 型でも対応
    const reviewTargets = gaps.filter((g) => {
      const uiStatus = mapStatus(g.status);
      return uiStatus !== "ok";
    });

    if (reviewTargets.length === 0) {
      // 全て対応済み → デモデータにフォールバック
      setArticles(SAMPLE_REVIEW_ARTICLES);
      setIsDemo(true);
    } else {
      const converted = reviewTargets.map((g, i) =>
        gapToReviewArticle(g as ApiGapItem & { id?: string }, i)
      );
      setArticles(converted);
    }

    // セッションストアから判断・メモを復元
    const savedDecisions = loadReviewDecisions();
    if (savedDecisions) {
      setDecisions(savedDecisions);
    }
    const savedMemos = loadReviewMemos();
    if (savedMemos) {
      setMemos(savedMemos);
    }

    setPhase("ready");
  }, [router]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    initialize();
  }, [initialize]);

  const article = articles[currentIndex];
  const decided = Object.values(decisions).filter((d) => d !== null).length;
  const progressPercent =
    articles.length > 0 ? (decided / articles.length) * 100 : 0;

  function handleDecision(decision: Decision) {
    if (!article) return;
    if (
      decision === "pending" &&
      article.importance === "mandatory" &&
      !confirm(
        "この項目は法改正への対応として必須です。\n保留にすると、改正後の規約が法的に不完全になるリスクがあります。\nそれでも保留にしますか？"
      )
    ) {
      return;
    }
    const next = { ...decisions, [article.id]: decision };
    setDecisions(next);
    saveReviewDecisions(next);
  }

  function handleMemoChange(value: string) {
    if (!article) return;
    const next = { ...memos, [article.id]: value };
    setMemos(next);
    saveReviewMemos(next);
  }

  function goTo(index: number) {
    if (index >= 0 && index < articles.length) {
      setCurrentIndex(index);
      setShowExplanation(false);
    }
  }

  /** AIドラフト生成 */
  async function handleGenerateDraft() {
    if (!article) return;
    setDraftLoading((prev) => ({ ...prev, [article.id]: true }));
    setDraftErrors((prev) => {
      const next = { ...prev };
      delete next[article.id];
      return next;
    });

    try {
      const result = await callDraft({
        articleNum: article.articleNum,
        currentText: article.currentText,
        gapSummary: article.summary,
        baseRef: article.baseRef,
      });

      // 該当の article を更新
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id
            ? {
                ...a,
                draftText: result.draft,
                summary: result.summary || a.summary,
                explanation: result.explanation || a.explanation,
              }
            : a
        )
      );
    } catch (err) {
      console.error("ドラフト生成エラー:", err);
      setDraftErrors((prev) => ({
        ...prev,
        [article.id]:
          err instanceof Error
            ? err.message
            : "ドラフト生成中にエラーが発生しました",
      }));
    } finally {
      setDraftLoading((prev) => ({ ...prev, [article.id]: false }));
    }
  }

  const allDone = articles.length > 0 && decided === articles.length;

  // ローディング画面
  if (phase === "loading") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={4} />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 animate-pulse">
                <svg
                  className="w-6 h-6 text-primary animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                レビューデータを準備中...
              </p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  // articles が空の場合のフォールバック（通常は到達しない）
  if (articles.length === 0 || !article) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={4} />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                レビュー対象の項目がありません。
              </p>
              <Button asChild>
                <Link href="/analysis">分析画面に戻る</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  const isDraftLoading = draftLoading[article.id] ?? false;
  const draftError = draftErrors[article.id];

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={4} />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
        <div className="mb-6">
          <Badge variant="secondary" className="mb-2">
            ステップ 4 / 6
          </Badge>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">改正案レビュー</h2>
            <span className="text-sm text-muted-foreground">
              {decided}/{articles.length} 完了
            </span>
          </div>
          <Progress value={progressPercent} className="mt-2" />
        </div>

        {/* デモモード表示 */}
        {isDemo && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 font-medium">
              デモデータを使用しています
            </p>
            <p className="text-xs text-amber-700 mt-1">
              ギャップ分析結果が利用できないため、サンプルデータを表示しています。
            </p>
          </div>
        )}

        {/* レビューカード */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-5">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                [{currentIndex + 1}/{articles.length}] {article.articleNum}（
                {article.title}）
              </span>
              <Badge className={IMPORTANCE_STYLE[article.importance]}>
                {IMPORTANCE_LABEL[article.importance]}
              </Badge>
            </div>

            {/* (1) 平易な要約 */}
            <div>
              <p className="text-sm font-medium mb-1">何が変わる？</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {article.summary}
              </p>
            </div>

            {/* (2) 新旧対照 */}
            <div>
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="text-sm font-medium flex items-center gap-1 mb-2"
              >
                条文の変更内容 {showDiff ? "▲" : "▼"}
              </button>
              {showDiff && (
                <>
                  {article.draftText ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                        <p className="text-xs font-medium text-red-700 mb-1">
                          現行（変更前）
                        </p>
                        <p className="text-sm text-red-900 whitespace-pre-line">
                          {article.currentText ?? "（規定なし）"}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <p className="text-xs font-medium text-blue-700 mb-1">
                          + 改正案（変更後）
                        </p>
                        <p className="text-sm text-blue-900 whitespace-pre-line">
                          {article.draftText}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <p className="text-sm text-muted-foreground">
                          ドラフトが未生成です。下のボタンでAIにドラフトを生成させてください。
                        </p>
                      </div>
                      <Button
                        onClick={handleGenerateDraft}
                        disabled={isDraftLoading}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        {isDraftLoading ? (
                          <span className="flex items-center gap-2">
                            <svg
                              className="w-4 h-4 animate-spin"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            AIドラフト生成中...
                          </span>
                        ) : (
                          "AIドラフト生成"
                        )}
                      </Button>
                      {draftError && (
                        <p className="text-xs text-red-600">{draftError}</p>
                      )}
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                出典: {article.baseRef}
              </p>
            </div>

            {/* (3) 理事会向け説明文 */}
            {article.explanation && (
              <div>
                <button
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="text-sm font-medium flex items-center gap-1"
                >
                  理事会での説明例 {showExplanation ? "▲" : "▼"}
                </button>
                {showExplanation && (
                  <div className="mt-2 p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground italic">
                      「{article.explanation}」
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ドラフトが存在する場合の再生成ボタン */}
            {article.draftText && (
              <div>
                <Button
                  onClick={handleGenerateDraft}
                  disabled={isDraftLoading}
                  variant="outline"
                  size="sm"
                >
                  {isDraftLoading ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      再生成中...
                    </span>
                  ) : (
                    "AIドラフトを再生成"
                  )}
                </Button>
                {draftError && (
                  <p className="text-xs text-red-600 mt-1">{draftError}</p>
                )}
              </div>
            )}

            {/* (4) 判断ボタン */}
            <div className="space-y-3 pt-2">
              <div className="flex gap-3">
                {[
                  {
                    value: "adopted" as Decision,
                    label: "採用",
                    style: "default" as const,
                  },
                  {
                    value: "modified" as Decision,
                    label: "修正",
                    style: "outline" as const,
                  },
                  {
                    value: "pending" as Decision,
                    label: "保留",
                    style: "outline" as const,
                  },
                ].map((btn) => (
                  <Button
                    key={btn.value}
                    variant={
                      decisions[article.id] === btn.value
                        ? "default"
                        : btn.style
                    }
                    onClick={() => handleDecision(btn.value)}
                    className="flex-1 min-h-[44px]"
                  >
                    {btn.label}
                  </Button>
                ))}
              </div>

              {/* メモ欄 */}
              <textarea
                placeholder="メモ（任意）"
                value={memos[article.id] ?? ""}
                onChange={(e) => handleMemoChange(e.target.value)}
                className="w-full text-sm p-3 border rounded-lg bg-background resize-none h-16"
              />
            </div>

            {/* ナビゲーション */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="min-h-[44px]"
              >
                ◀ 前へ
              </Button>

              {currentIndex < articles.length - 1 ? (
                <Button
                  onClick={() => goTo(currentIndex + 1)}
                  className="min-h-[44px]"
                >
                  次へ ▶
                </Button>
              ) : allDone ? (
                <Button asChild className="min-h-[44px]">
                  <Link href="/export">エクスポートへ</Link>
                </Button>
              ) : (
                <Button disabled className="min-h-[44px]">
                  全項目を判断してください
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* セッション管理 */}
        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            ここまで保存して終了
          </Button>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
