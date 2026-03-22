"use client";

/**
 * ギャップ分析ページ
 *
 * パース済みの条文データを読み込み、SSE ストリーミングでギャップ分析を実行する。
 * 分析結果はサマリーカード + フィルター付き条文リストで表示する。
 *
 * v1 からの改善点:
 * - SSE ストリーミング対応（startAnalysis + コールバックパターン）
 * - v2 のドメイン型（GapAnalysisItem, AnalysisResult）に対応
 * - StepId が文字列ベースに移行
 * - import パスを v2 の @/shared/* に統一
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { startAnalysis, startAutoGenerate } from "@/shared/api-client";
import {
  loadParsedBylaws,
  saveGapResults,
  loadGapResults,
  loadProjectId,
  loadOnboarding,
} from "@/shared/store";
import { cn } from "@/lib/utils";
import { AuthGuard } from "@/shared/auth/auth-guard";
import type { GapAnalysisItem, GapType, AnalysisResult } from "@/domains/analysis/types";

// ---------- 表示用定数 ----------

/** GapType の日本語ラベル */
const GAP_TYPE_LABELS: Record<GapType, string> = {
  missing: "未対応",
  outdated: "要修正",
  partial: "一部対応",
  compliant: "対応済み",
  custom: "独自条文",
};

/** GapType のスタイル */
const GAP_TYPE_STYLES: Record<GapType, string> = {
  missing: "bg-red-100 text-red-800 border-red-200",
  outdated: "bg-amber-100 text-amber-800 border-amber-200",
  partial: "bg-yellow-100 text-yellow-800 border-yellow-200",
  compliant: "bg-green-100 text-green-800 border-green-200",
  custom: "bg-gray-100 text-gray-800 border-gray-200",
};

/** 重要度の日本語ラベル */
const IMPORTANCE_LABELS: Record<GapAnalysisItem["importance"], string> = {
  mandatory: "法的必須",
  recommended: "推奨",
  optional: "任意",
};

/** 重要度のスタイル */
const IMPORTANCE_STYLES: Record<GapAnalysisItem["importance"], string> = {
  mandatory: "bg-red-500 text-white",
  recommended: "bg-blue-500 text-white",
  optional: "bg-gray-400 text-white",
};

// ---------- フィルター型 ----------

type FilterStatus = GapType | "all";

// ---------- 分析フェーズ ----------

type AnalysisPhase = "loading" | "ready" | "analyzing" | "drafting" | "done" | "error";

// ---------- コンポーネント ----------

export default function AnalysisPage() {
  return <AuthGuard><AnalysisPageContent /></AuthGuard>;
}

function AnalysisPageContent() {
  const router = useRouter();
  const [phase, setPhase] = useState<AnalysisPhase>("loading");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [results, setResults] = useState<GapAnalysisItem[]>([]);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [draftProgressMsg, setDraftProgressMsg] = useState("");
  const [draftProgressPercent, setDraftProgressPercent] = useState(0);
  const [draftMode, setDraftMode] = useState<"smart" | "precise">("smart");
  const controllerRef = useRef<AbortController | null>(null);
  const draftControllerRef = useRef<AbortController | null>(null);

  /** パース済みデータの存在チェック + キャッシュ済み結果の読み込み */
  useEffect(() => {
    const parsed = loadParsedBylaws();
    if (!parsed) {
      router.push("/upload");
      return;
    }

    // 既にストアに分析結果がある場合はそれを使う
    const cached = loadGapResults();
    if (cached && cached.length > 0) {
      setResults(cached);
      setPhase("done");
      return;
    }

    // データはあるが分析未実施 → 準備完了
    setPhase("ready");
  }, [router]);

  /** 分析を開始する */
  const handleStartAnalysis = useCallback(() => {
    const parsed = loadParsedBylaws();
    if (!parsed) {
      router.push("/upload");
      return;
    }

    const projectId = loadProjectId() ?? `project-${Date.now()}`;

    // パース済み条文を分析 API の入力形式に変換（全テキストを結合）
    const articles = parsed.articles.map((a) => {
      const parts: string[] = [];
      if (a.title) parts.push(`（${a.title}）`);
      if (a.body) parts.push(a.body);
      for (const p of a.paragraphs) {
        parts.push(`${p.num} ${p.body}`);
        for (const item of p.items) {
          parts.push(`  ${item.body}`);
        }
      }
      const fullText = parts.join("\n");
      return {
        articleNum: a.articleNum,
        category: a.chapterTitle,
        currentText: fullText || null,
      };
    });

    setPhase("analyzing");
    setProgressMsg("分析を準備中...");
    setProgressPercent(0);

    const controller = startAnalysis(projectId, articles, {
      onProgress: (data) => {
        setProgressMsg(
          `${data.articleNum} を分析中... (${data.current}/${data.total})`,
        );
        setProgressPercent(Math.round((data.current / data.total) * 100));
      },
      onComplete: (data: AnalysisResult) => {
        setResults(data.items);
        saveGapResults(data.items);
        // 分析完了 → 自動ドラフト生成フェーズへ
        handleStartDrafting(projectId);
      },
      onError: (message) => {
        setErrorMsg(message);
        setPhase("error");
      },
    });

    controllerRef.current = controller;
  }, [router]);

  /** 自動ドラフト生成を開始する */
  const handleStartDrafting = useCallback((pid: string) => {
    setPhase("drafting");
    setDraftProgressMsg("ドラフト生成を準備中...");
    setDraftProgressPercent(0);

    // オンボーディングデータからマンション属性を取得
    const onboarding = loadOnboarding();
    const condoContext = {
      condoName: onboarding?.condoName ?? "マンション",
      condoType: (onboarding?.condoType ?? "unknown") as "corporate" | "non-corporate" | "unknown",
      unitCount: (onboarding?.unitCount ?? "medium") as "small" | "medium" | "large" | "xlarge",
    };

    const controller = startAutoGenerate(pid, draftMode, condoContext, {
      onProgress: (data) => {
        const phaseLabel = data.phase === "retrieval" ? "検索" : data.phase === "retry" ? "リトライ" : "生成";
        setDraftProgressMsg(
          `${data.articleNum}（${phaseLabel}中）... (${data.current}/${data.total})`,
        );
        if (data.total > 0) {
          setDraftProgressPercent(Math.round((data.current / data.total) * 100));
        }
      },
      onComplete: () => {
        setPhase("done");
      },
      onError: (message) => {
        // ドラフト生成のエラーはワーニングにとどめ、分析結果は残す
        console.error("自動ドラフト生成エラー:", message);
        setPhase("done");
      },
    });

    draftControllerRef.current = controller;
  }, [draftMode]);

  /** クリーンアップ: コンポーネント破棄時に SSE を中断 */
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      draftControllerRef.current?.abort();
    };
  }, []);

  // ---------- 集計 ----------

  const counts = {
    missing: results.filter((r) => r.gapType === "missing").length,
    outdated: results.filter((r) => r.gapType === "outdated").length,
    partial: results.filter((r) => r.gapType === "partial").length,
    compliant: results.filter((r) => r.gapType === "compliant").length,
    mandatory: results.filter(
      (r) => r.importance === "mandatory" && r.gapType !== "compliant",
    ).length,
  };

  const filteredResults =
    filter === "all"
      ? results
      : results.filter((r) => r.gapType === filter);

  // ---------- ローディング / 準備完了 / 分析中 ----------

  if (phase === "loading") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep="analysis" />
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
                パース結果を読み込み中...
              </p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep="analysis" />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <div className="text-4xl mb-2">📊</div>
              <h3 className="text-lg font-semibold">ギャップ分析の準備完了</h3>
              <p className="text-sm text-muted-foreground">
                パース済みの条文データをAIが標準管理規約と比較し、差分を分析します。
                分析後、自動的に改正案のドラフトも生成します。
              </p>
              <div className="flex items-center gap-3 justify-center mt-3">
                <label className="text-xs text-muted-foreground">生成モード:</label>
                <select
                  value={draftMode}
                  onChange={(e) => setDraftMode(e.target.value as "smart" | "precise")}
                  className="text-sm border rounded px-2 py-1"
                >
                  <option value="smart">スマート（高速・推奨）</option>
                  <option value="precise">精密（正確・時間がかかります）</option>
                </select>
              </div>
              <Button onClick={handleStartAnalysis} size="lg" className="mt-4">
                分析を開始
              </Button>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  if (phase === "analyzing") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep="analysis" />
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
              <div>
                <h3 className="text-lg font-semibold mb-1">
                  ギャップ分析を実行中
                </h3>
                <p className="text-sm text-muted-foreground">{progressMsg}</p>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                複数条文をまとめてAIが分析します。しばらくお待ちください。
              </p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  if (phase === "drafting") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep="analysis" />
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
              <div>
                <h3 className="text-lg font-semibold mb-1">
                  改正案ドラフトを自動生成中
                </h3>
                <p className="text-sm text-muted-foreground">{draftProgressMsg}</p>
              </div>
              <Progress value={draftProgressPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">
                分析結果に基づいてAIが改正案のドラフトを生成しています。
                <br />
                完了後、レビュー画面に進めます。
              </p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep="analysis" />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <div className="text-4xl mb-2">⚠️</div>
              <h3 className="text-lg font-semibold text-destructive">
                分析中にエラーが発生しました
              </h3>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <div className="flex flex-col gap-3 mt-4">
                <Button onClick={handleStartAnalysis} variant="outline">
                  もう一度試す
                </Button>
                <Button
                  onClick={() => router.push("/upload")}
                  variant="ghost"
                >
                  アップロードに戻る
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---------- done: 分析結果表示 ----------

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep="analysis" />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            ステップ 4 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">ギャップ分析結果</h2>
          <p className="text-muted-foreground">
            現行規約を令和7年改正の標準管理規約と比較した結果です。
          </p>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card
            className={cn(
              "cursor-pointer hover:ring-2 ring-red-300",
              filter === "missing" && "ring-2 ring-red-400",
            )}
            onClick={() =>
              setFilter((prev) => (prev === "missing" ? "all" : "missing"))
            }
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-red-600">
                {counts.missing}
              </p>
              <p className="text-xs text-muted-foreground">未対応</p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "cursor-pointer hover:ring-2 ring-amber-300",
              filter === "outdated" && "ring-2 ring-amber-400",
            )}
            onClick={() =>
              setFilter((prev) => (prev === "outdated" ? "all" : "outdated"))
            }
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-amber-600">
                {counts.outdated + counts.partial}
              </p>
              <p className="text-xs text-muted-foreground">要修正</p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "cursor-pointer hover:ring-2 ring-green-300",
              filter === "compliant" && "ring-2 ring-green-400",
            )}
            onClick={() =>
              setFilter((prev) =>
                prev === "compliant" ? "all" : "compliant",
              )
            }
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {counts.compliant}
              </p>
              <p className="text-xs text-muted-foreground">対応済み</p>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "cursor-pointer hover:ring-2 ring-primary/30",
              filter === "all" && "ring-2 ring-primary/50",
            )}
            onClick={() => setFilter("all")}
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-primary">
                {counts.mandatory}
              </p>
              <p className="text-xs text-muted-foreground">法的必須</p>
            </CardContent>
          </Card>
        </div>

        {/* フィルター表示 */}
        {filter !== "all" && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">
              フィルター: {GAP_TYPE_LABELS[filter]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilter("all")}
            >
              クリア
            </Button>
          </div>
        )}

        <Separator className="mb-6" />

        {/* 分析結果リスト */}
        <div className="space-y-3 mb-8">
          {filteredResults.map((item, index) => (
            <Card key={`${item.articleNum}-${index}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className={GAP_TYPE_STYLES[item.gapType]}
                      >
                        {GAP_TYPE_LABELS[item.gapType]}
                      </Badge>
                      <Badge className={IMPORTANCE_STYLES[item.importance]}>
                        {IMPORTANCE_LABELS[item.importance]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.category}
                      </span>
                    </div>
                    <p className="font-medium text-sm">
                      {item.articleNum}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.gapSummary}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredResults.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              該当する条文はありません
            </div>
          )}
        </div>

        {/* CTA: 次のステップへ */}
        <Card className="bg-muted/50">
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
            <div>
              <p className="font-medium">
                {counts.mandatory}件の法的必須項目を含む
                {counts.missing + counts.outdated + counts.partial}
                件の改正が必要です
              </p>
              <p className="text-sm text-muted-foreground">
                AIが改正案のドラフトを生成済みです。レビュー画面で確認・判断できます。
              </p>
            </div>
            <Button size="lg" asChild>
              <Link href="/review">次のステップへ</Link>
            </Button>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
