"use client";

/**
 * 条文レビュー画面
 *
 * ギャップ分析の結果をもとに、各条文を1件ずつカード形式で表示し、
 * ユーザーが「採用 / 修正 / 保留」を判断する。
 *
 * v1 からの改善点:
 * - API クライアント経由でデータ取得（api-client.ts）
 * - StepId が文字列ベース（"review"）
 * - Zustand ストア（@/shared/store）で永続化
 * - フィルター機能（全て / 未決定 / 採用 / 修正 / 保留）
 * - 編集可能な AI ドラフトテキストエリア
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/shared/auth/auth-context";
import type { StepId } from "@/shared/journey";
import {
  getReviewArticles,
  patchReviewArticle,
  decideReview,
  callDraftSingle,
} from "@/shared/api-client";
import type { ReviewArticle } from "@/shared/db/types";
import type { GapAnalysisItem } from "@/domains/analysis/types";
import {
  useProjectStore,
  loadProjectId,
  loadGapResults,
  saveReviewDecisions,
  loadReviewDecisions,
  saveReviewMemos,
  loadReviewMemos,
} from "@/shared/store";

// ---------- 定数 ----------

/** 重要度ラベル */
const IMPORTANCE_LABEL: Record<string, string> = {
  mandatory: "法的必須",
  recommended: "推奨",
  optional: "任意",
};

/** 重要度スタイル */
const IMPORTANCE_STYLE: Record<string, string> = {
  mandatory: "bg-red-500 text-white",
  recommended: "bg-blue-500 text-white",
  optional: "bg-gray-400 text-white",
};

/** 判断の型 */
type Decision = "adopted" | "modified" | "pending";

/** フィルターの選択肢 */
type FilterType = "all" | "undecided" | "adopted" | "modified" | "pending";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "全て" },
  { value: "undecided", label: "未決定" },
  { value: "adopted", label: "採用" },
  { value: "modified", label: "修正" },
  { value: "pending", label: "保留" },
];

// ---------- コンポーネント ----------

export default function ReviewPage() {
  const router = useRouter();
  const { user } = useAuth();

  // 状態管理
  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCurrentText, setShowCurrentText] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  const initDone = useRef(false);

  // ---------- 初期化 ----------

  /** GapAnalysisItem → ReviewArticle に変換する */
  const gapItemsToReviewArticles = useCallback(
    (items: GapAnalysisItem[], pid: string): ReviewArticle[] => {
      return items.map((item, index) => ({
        id: item.articleNum,
        projectId: pid,
        chapter: 0,
        articleNum: item.articleNum,
        original: item.currentText,
        draft: "",
        summary: item.gapSummary,
        explanation: item.rationale,
        importance: item.importance,
        baseRef: item.standardRef,
        decision: null,
        modificationHistory: [],
        memo: "",
        category: item.category,
      }));
    },
    [],
  );

  const initialize = useCallback(async () => {
    try {
      const pid = loadProjectId() ?? "default";

      // Firestore からレビュー記事を取得
      let fetched: ReviewArticle[] = [];
      const result = await getReviewArticles(pid);
      fetched = result.articles ?? [];

      // Firestore にデータがない場合、sessionStorage のギャップ分析結果からフォールバック
      if (fetched.length === 0) {
        const gapResults = loadGapResults();
        if (gapResults && gapResults.length > 0) {
          fetched = gapItemsToReviewArticles(gapResults, pid);
        } else {
          router.push("/analysis");
          return;
        }
      }

      setArticles(fetched);

      // ストアから判断・メモを復元
      const savedDecisions = loadReviewDecisions();
      if (savedDecisions && Object.keys(savedDecisions).length > 0) {
        setDecisions(savedDecisions);
      } else {
        const initialDecisions: Record<string, string> = {};
        for (const a of fetched) {
          if (a.id && a.decision) {
            initialDecisions[a.id] = a.decision;
          }
        }
        setDecisions(initialDecisions);
      }

      const savedMemos = loadReviewMemos();
      if (savedMemos && Object.keys(savedMemos).length > 0) {
        setMemos(savedMemos);
      } else {
        const initialMemos: Record<string, string> = {};
        for (const a of fetched) {
          if (a.id && a.memo) {
            initialMemos[a.id] = a.memo;
          }
        }
        setMemos(initialMemos);
      }

      setPhase("ready");
    } catch (err) {
      console.error("レビューデータの読み込みに失敗:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "データの読み込みに失敗しました"
      );
      setPhase("error");
    }
  }, [router, gapItemsToReviewArticles]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    initialize();
  }, [initialize]);

  // ---------- フィルタリング ----------

  const filteredArticles = articles.filter((a) => {
    const aid = a.id ?? "";
    if (filter === "all") return true;
    if (filter === "undecided") return !decisions[aid];
    return decisions[aid] === filter;
  });

  const article = filteredArticles[currentIndex];
  const decided = Object.values(decisions).filter(
    (d) => d !== null && d !== undefined && d !== ""
  ).length;
  const progressPercent =
    articles.length > 0 ? (decided / articles.length) * 100 : 0;

  // ---------- ハンドラ ----------

  /** 判断を確定 */
  async function handleDecision(decision: Decision) {
    if (!article?.id) return;

    // 法的必須の保留に対する警告
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

    // API に判断を送信（非同期、エラーは静かに処理）
    const pid = loadProjectId();
    if (pid) {
      try {
        await decideReview(pid, article.articleNum, { type: decision === "adopted" ? "ADOPT" : decision === "modified" ? "MODIFY" as const : "RESET" as const, ...(decision === "modified" ? { newText: article.draft, reason: "レビュー画面で修正" } : {}) } as import("@/domains/review/types").ReviewEvent);
      } catch (err) {
        console.error("判断の保存に失敗:", err);
      }
    }
  }

  /** メモ変更 */
  function handleMemoChange(value: string) {
    if (!article?.id) return;
    const next = { ...memos, [article.id]: value };
    setMemos(next);
    saveReviewMemos(next);
  }

  /** ドラフト編集 */
  function handleDraftEdit(value: string) {
    if (!article?.id) return;
    setEditedDrafts((prev) => ({ ...prev, [article.id!]: value }));
  }

  /** ドラフト保存 */
  async function handleDraftSave() {
    if (!article?.id) return;
    const pid = loadProjectId();
    if (!pid) return;

    const editedText = editedDrafts[article.id];
    if (editedText === undefined) return;

    try {
      await patchReviewArticle(pid, {
        articleNum: article.articleNum,
        draft: editedText,
      });
      // articles 配列も更新
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id ? { ...a, draft: editedText } : a
        )
      );
    } catch (err) {
      console.error("ドラフト保存に失敗:", err);
    }
  }

  /** ナビゲーション */
  function goTo(index: number) {
    if (index >= 0 && index < filteredArticles.length) {
      setCurrentIndex(index);
      setShowCurrentText(false);
    }
  }

  /** AIドラフト再生成 */
  async function handleGenerateDraft() {
    if (!article?.id) return;
    const pid = loadProjectId() ?? "default";

    setDraftLoading((prev) => ({ ...prev, [article.id!]: true }));
    setDraftErrors((prev) => {
      const next = { ...prev };
      delete next[article.id!];
      return next;
    });

    try {
      const result = await callDraftSingle({
        articleNum: article.articleNum,
        category: article.category,
        currentText: article.original,
        standardText: "",
        gapSummary: article.summary,
        importance: article.importance,
        condoContext: { condoName: "マンション", condoType: "unknown", unitCount: "medium" },
      });

      // 該当の article を更新
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id
            ? {
                ...a,
                draft: result.draft,
                summary: result.summary || a.summary,
                explanation: result.explanation || a.explanation,
              }
            : a
        )
      );
      // 編集中ドラフトもクリア
      setEditedDrafts((prev) => {
        const next = { ...prev };
        delete next[article.id!];
        return next;
      });
    } catch (err) {
      console.error("ドラフト生成エラー:", err);
      setDraftErrors((prev) => ({
        ...prev,
        [article.id!]:
          err instanceof Error
            ? err.message
            : "ドラフト生成中にエラーが発生しました",
      }));
    } finally {
      setDraftLoading((prev) => ({ ...prev, [article.id!]: false }));
    }
  }

  const allDone = articles.length > 0 && decided === articles.length;

  // ---------- ローディング画面 ----------

  if (phase === "loading") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={"review" as StepId} />
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

  // ---------- エラー画面 ----------

  if (phase === "error") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={"review" as StepId} />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-sm text-red-600">{errorMessage}</p>
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

  // ---------- 空の場合（フィルター結果含む） ----------

  if (filteredArticles.length === 0 || !article) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={"review" as StepId} />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
          {/* 進捗バー */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">改正案レビュー</h2>
              <span className="text-sm text-muted-foreground">
                {decided}/{articles.length} 完了
              </span>
            </div>
            <Progress value={progressPercent} className="mt-2" />
          </div>

          {/* フィルター */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={filter === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilter(opt.value);
                  setCurrentIndex(0);
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                {filter === "all"
                  ? "レビュー対象の項目がありません。"
                  : `「${FILTER_OPTIONS.find((o) => o.value === filter)?.label}」に該当する項目はありません。`}
              </p>
              {filter !== "all" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilter("all");
                    setCurrentIndex(0);
                  }}
                >
                  フィルターをリセット
                </Button>
              )}
            </CardContent>
          </Card>

          {/* 次のステップへ */}
          {allDone && (
            <div className="mt-6 text-center">
              <Button asChild size="lg" className="min-h-[44px]">
                <Link href="/export">次のステップへ</Link>
              </Button>
            </div>
          )}
        </main>
        <AppFooter />
      </div>
    );
  }

  const articleId = article.id ?? "";
  const isDraftLoading = draftLoading[articleId] ?? false;
  const draftError = draftErrors[articleId];
  const currentDraftText = editedDrafts[articleId] ?? article.draft ?? "";
  const isDraftEdited =
    editedDrafts[articleId] !== undefined &&
    editedDrafts[articleId] !== article.draft;

  // ---------- メイン表示 ----------

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={"review" as StepId} />

      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
        {/* ヘッダー＆進捗 */}
        <div className="mb-6">
          <Badge variant="secondary" className="mb-2">
            ステップ 5 / 6
          </Badge>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">改正案レビュー</h2>
            <span className="text-sm text-muted-foreground">
              {decided}/{articles.length} 完了
            </span>
          </div>
          <Progress value={progressPercent} className="mt-2" />
        </div>

        {/* フィルター */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter(opt.value);
                setCurrentIndex(0);
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* レビューカード */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-5">
            {/* カードヘッダー: 条番号、カテゴリ、重要度バッジ */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                [{currentIndex + 1}/{filteredArticles.length}]{" "}
                {article.articleNum}
                {article.category && `（${article.category}）`}
              </span>
              <Badge
                className={
                  IMPORTANCE_STYLE[article.importance] ??
                  IMPORTANCE_STYLE.optional
                }
              >
                {IMPORTANCE_LABEL[article.importance] ?? "任意"}
              </Badge>
            </div>

            {/* 要約: 何が変わる？ */}
            <div>
              <p className="text-sm font-medium mb-1">何が変わる？</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {article.summary}
              </p>
            </div>

            {/* 現行規約テキスト（折りたたみ） */}
            <div>
              <button
                onClick={() => setShowCurrentText(!showCurrentText)}
                className="text-sm font-medium flex items-center gap-1 mb-2"
              >
                現行規約テキスト {showCurrentText ? "▲" : "▼"}
              </button>
              {showCurrentText && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-xs font-medium text-red-700 mb-1">
                    現行（変更前）
                  </p>
                  <p className="text-sm text-red-900 whitespace-pre-line">
                    {article.original ?? "（規定なし）"}
                  </p>
                </div>
              )}
            </div>

            {/* AI ドラフト（編集可能テキストエリア） */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">AI ドラフト</p>
                {isDraftEdited && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDraftSave}
                    className="text-xs"
                  >
                    編集を保存
                  </Button>
                )}
              </div>
              {article.draft ? (
                <textarea
                  value={currentDraftText}
                  onChange={(e) => handleDraftEdit(e.target.value)}
                  className="w-full text-sm p-3 border rounded-lg bg-blue-50 border-blue-100 text-blue-900 resize-none min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-sm text-muted-foreground">
                    ドラフトが未生成です。下のボタンでAIにドラフトを生成させてください。
                  </p>
                </div>
              )}
              <Button
                onClick={handleGenerateDraft}
                disabled={isDraftLoading}
                variant="outline"
                size="sm"
                className="w-full mt-2"
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
                    {article.draft ? "再生成中..." : "AIドラフト生成中..."}
                  </span>
                ) : article.draft ? (
                  "AIドラフトを再生成"
                ) : (
                  "AIドラフト生成"
                )}
              </Button>
              {draftError && (
                <p className="text-xs text-red-600 mt-1">{draftError}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                出典: {article.baseRef}
              </p>
            </div>

            {/* 変更理由・解説 */}
            {article.explanation && (
              <div>
                <p className="text-sm font-medium mb-1">変更理由・解説</p>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {article.explanation}
                  </p>
                </div>
              </div>
            )}

            {/* 判断ボタン（採用 / 修正 / 保留） */}
            <div className="space-y-3 pt-2">
              <div className="flex gap-3">
                {(
                  [
                    { value: "adopted" as Decision, label: "採用" },
                    { value: "modified" as Decision, label: "修正" },
                    { value: "pending" as Decision, label: "保留" },
                  ] as const
                ).map((btn) => (
                  <Button
                    key={btn.value}
                    variant={
                      decisions[articleId] === btn.value
                        ? "default"
                        : "outline"
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
                value={memos[articleId] ?? ""}
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
                前へ
              </Button>

              {currentIndex < filteredArticles.length - 1 ? (
                <Button
                  onClick={() => goTo(currentIndex + 1)}
                  className="min-h-[44px]"
                >
                  次へ
                </Button>
              ) : allDone ? (
                <Button asChild className="min-h-[44px]">
                  <Link href="/export">次のステップへ</Link>
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
