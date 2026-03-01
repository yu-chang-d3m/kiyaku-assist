"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import {
  SAMPLE_GAP_RESULTS,
  IMPORTANCE_LABELS,
  STATUS_LABELS,
  type GapStatus,
  type Importance,
  type GapItem as UIGapItem,
} from "@/lib/sample-analysis";
import { callAnalyze, type GapItem as ApiGapItem } from "@/lib/api";
import {
  loadParsedBylaws,
  saveGapResults as saveGapResultsToStore,
  loadGapResults,
} from "@/lib/session-store";

const STATUS_STYLES: Record<GapStatus, string> = {
  missing: "bg-red-100 text-red-800 border-red-200",
  "needs-update": "bg-amber-100 text-amber-800 border-amber-200",
  ok: "bg-green-100 text-green-800 border-green-200",
};

const IMPORTANCE_STYLES: Record<Importance, string> = {
  mandatory: "bg-red-500 text-white",
  recommended: "bg-blue-500 text-white",
  optional: "bg-gray-400 text-white",
};

type FilterStatus = GapStatus | "all";

/** API の status を UI の GapStatus にマッピング */
function mapStatus(apiStatus: ApiGapItem["status"]): GapStatus {
  switch (apiStatus) {
    case "outdated":
      return "needs-update";
    case "missing":
      return "missing";
    case "ok":
    case "extra":
      return "ok";
    default:
      return "ok";
  }
}

/** API の importance を UI の Importance にマッピング */
function mapImportance(apiImportance: ApiGapItem["importance"]): Importance {
  switch (apiImportance) {
    case "high":
      return "mandatory";
    case "medium":
      return "recommended";
    case "low":
      return "optional";
    default:
      return "optional";
  }
}

/** API のギャップ結果を UI 型に変換 */
function convertApiGapToUI(apiGap: ApiGapItem, index: number): UIGapItem {
  return {
    id: `gap-${index + 1}`,
    articleNum: apiGap.articleNum,
    title: apiGap.title,
    status: mapStatus(apiGap.status),
    importance: mapImportance(apiGap.importance),
    summary: apiGap.summary,
    category: apiGap.category,
  };
}

type AnalysisPhase = "loading" | "analyzing" | "done" | "error";

export default function AnalysisPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [results, setResults] = useState<UIGapItem[]>([]);
  const [phase, setPhase] = useState<AnalysisPhase>("loading");
  const [progressMsg, setProgressMsg] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const analysisStarted = useRef(false);

  /** 章ごとに順次 API 呼び出しを行う分析処理 */
  const runAnalysis = useCallback(async () => {
    const parsed = loadParsedBylaws();
    if (!parsed) {
      router.push("/upload");
      return;
    }

    // 既にセッションストアに分析結果がある場合はそれを使う
    const cached = loadGapResults();
    if (cached && cached.length > 0) {
      // セッションストアには API 型で保存されているので UI 型に変換
      // ただし、既に UI 型で保存されている可能性もあるため判定する
      const firstItem = cached[0];
      const hasUIFields = "id" in firstItem;
      if (hasUIFields) {
        setResults(cached as unknown as UIGapItem[]);
      } else {
        setResults(
          (cached as unknown as ApiGapItem[]).map((g, i) =>
            convertApiGapToUI(g, i)
          )
        );
      }
      setPhase("done");
      return;
    }

    const chapters = parsed.chapters;
    const totalChapters = chapters.length;
    const allGaps: ApiGapItem[] = [];

    setPhase("analyzing");

    try {
      for (let i = 0; i < totalChapters; i++) {
        const ch = chapters[i];
        const chapterText = ch.articles.map((a) => a.content).join("\n\n");
        setProgressMsg(
          `第${ch.chapter}章を分析中... (${i + 1}/${totalChapters}章)`
        );

        const result = await callAnalyze(chapterText, ch.chapter);
        allGaps.push(...result.gaps);
      }

      // セッションストアに API 型で保存
      saveGapResultsToStore(allGaps);

      // UI 型に変換して表示
      const uiResults = allGaps.map((g, i) => convertApiGapToUI(g, i));
      setResults(uiResults);
      setPhase("done");
    } catch (err) {
      console.error("分析エラー:", err);
      // デモモードにフォールバック
      setResults(SAMPLE_GAP_RESULTS);
      setIsDemo(true);
      setErrorMsg(
        err instanceof Error ? err.message : "分析中にエラーが発生しました"
      );
      setPhase("done");
    }
  }, [router]);

  useEffect(() => {
    if (analysisStarted.current) return;
    analysisStarted.current = true;
    runAnalysis();
  }, [runAnalysis]);

  const filteredResults =
    filter === "all" ? results : results.filter((r) => r.status === filter);

  const counts = {
    missing: results.filter((r) => r.status === "missing").length,
    needsUpdate: results.filter((r) => r.status === "needs-update").length,
    ok: results.filter((r) => r.status === "ok").length,
    mandatory: results.filter(
      (r) => r.importance === "mandatory" && r.status !== "ok"
    ).length,
  };

  // ローディング・分析中画面
  if (phase === "loading" || phase === "analyzing") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={3} />
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
                <p className="text-sm text-muted-foreground">
                  {progressMsg || "パース結果を読み込み中..."}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                章ごとにAIが分析を行います。しばらくお待ちください。
              </p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={3} />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            ステップ 3 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">ギャップ分析結果</h2>
          <p className="text-muted-foreground">
            現行規約を令和7年改正の標準管理規約と比較した結果です。
          </p>
        </div>

        {/* デモモード表示 */}
        {isDemo && (
          <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 font-medium">
              デモデータを使用しています
            </p>
            <p className="text-xs text-amber-700 mt-1">
              API接続に失敗したため、サンプルデータを表示しています。
              {errorMsg && `（${errorMsg}）`}
            </p>
          </div>
        )}

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card
            className="cursor-pointer hover:ring-2 ring-red-300"
            onClick={() => setFilter("missing")}
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-red-600">
                {counts.missing}
              </p>
              <p className="text-xs text-muted-foreground">未対応</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:ring-2 ring-amber-300"
            onClick={() => setFilter("needs-update")}
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-amber-600">
                {counts.needsUpdate}
              </p>
              <p className="text-xs text-muted-foreground">要修正</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:ring-2 ring-green-300"
            onClick={() => setFilter("ok")}
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-green-600">{counts.ok}</p>
              <p className="text-xs text-muted-foreground">対応済み</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:ring-2 ring-primary/30"
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
              フィルター:{" "}
              {filter === "missing"
                ? "未対応"
                : filter === "needs-update"
                  ? "要修正"
                  : "対応済み"}
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
          {filteredResults.map((item) => (
            <Card key={item.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className={STATUS_STYLES[item.status]}
                      >
                        {STATUS_LABELS[item.status]}
                      </Badge>
                      <Badge className={IMPORTANCE_STYLES[item.importance]}>
                        {IMPORTANCE_LABELS[item.importance]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.category}
                      </span>
                    </div>
                    <p className="font-medium text-sm">
                      {item.articleNum} {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.summary}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <Card className="bg-muted/50">
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
            <div>
              <p className="font-medium">
                {counts.mandatory}件の法的必須項目を含む
                {counts.missing + counts.needsUpdate}
                件の改正が必要です
              </p>
              <p className="text-sm text-muted-foreground">
                次のステップでAIが改正案のドラフトを生成します。1条文ずつ確認・判断できます。
              </p>
            </div>
            <Button size="lg" asChild>
              <Link href="/review">次へ: 改正案レビュー</Link>
            </Button>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
