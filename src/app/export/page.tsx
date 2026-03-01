"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import {
  loadGapResults,
  loadReviewDecisions,
  loadReviewMemos,
  loadReviewArticles,
} from "@/lib/session-store";
import type { GapItem } from "@/lib/api";
import {
  SAMPLE_REVIEW_ARTICLES,
  type Decision,
  type ReviewArticle,
} from "@/lib/sample-review";

// ---------- 型 ----------

interface ExportFormat {
  id: string;
  title: string;
  description: string;
  icon: string;
  actionLabel: string;
}

interface ReviewData {
  articles: ReviewArticle[];
  decisions: Record<string, Decision>;
  memos: Record<string, string>;
  gaps: GapItem[];
  isDemo: boolean;
}

// ---------- デモ用フォールバックデータ ----------

const DEMO_DECISIONS: Record<string, Decision> = {
  "rev-1": "adopted",
  "rev-2": "adopted",
  "rev-3": "adopted",
  "rev-4": "adopted",
  "rev-5": "modified",
};

const DEMO_MEMOS: Record<string, string> = {
  "rev-5": "電子投票のシステム選定を先行して検討する",
};

// ---------- エクスポート形式定義 ----------

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "review-pdf",
    title: "レビュー配布用PDF",
    description:
      "理事会メンバーへの印刷配布用。ブラウザの印刷機能でPDF保存できます。",
    icon: "📋",
    actionLabel: "印刷プレビュー",
  },
  {
    id: "resolution-word",
    title: "総会議案用（新旧対照表）",
    description:
      "新旧対照表のMarkdownテキストをクリップボードにコピーします。Wordに貼り付けてご利用ください。",
    icon: "📝",
    actionLabel: "クリップボードにコピー",
  },
  {
    id: "summary-pdf",
    title: "変更サマリー",
    description:
      "住民説明会向けの変更概要テキストをクリップボードにコピーします。",
    icon: "📊",
    actionLabel: "クリップボードにコピー",
  },
  {
    id: "review-record",
    title: "レビュー結果記録（CSV）",
    description:
      "各条文の判断結果（採用/修正/保留）とメモを一覧化したCSVファイルをダウンロードします。",
    icon: "📁",
    actionLabel: "CSVダウンロード",
  },
];

// ---------- 判断ラベル ----------

const DECISION_LABELS: Record<string, string> = {
  adopted: "採用",
  modified: "修正",
  pending: "保留",
};

// ---------- ユーティリティ ----------

/** GapItem から ReviewArticle に変換（review/page.tsx と同等のロジック） */
function gapToReviewArticle(gap: GapItem, index: number): ReviewArticle {
  const importanceMap: Record<string, ReviewArticle["importance"]> = {
    high: "mandatory",
    medium: "recommended",
    low: "optional",
    mandatory: "mandatory",
    recommended: "recommended",
    optional: "optional",
  };
  return {
    id: `rev-${index + 1}`,
    articleNum: gap.articleNum,
    title: gap.title,
    importance: importanceMap[gap.importance] ?? "optional",
    summary: gap.summary,
    explanation: "",
    currentText: null,
    draftText: "",
    baseRef: "標準管理規約（令和7年改正）",
    category: gap.category,
  };
}

/** 新旧対照表のMarkdownを生成 */
function generateComparisonMarkdown(
  articles: ReviewArticle[],
  decisions: Record<string, Decision>
): string {
  const lines: string[] = [
    "# 管理規約 新旧対照表",
    "",
    `作成日: ${new Date().toLocaleDateString("ja-JP")}`,
    "",
    "| 条文 | 項目 | 現行規約 | 改正案 | 判断 |",
    "|------|------|----------|--------|------|",
  ];

  for (const article of articles) {
    const decision = decisions[article.id];
    const decisionLabel = decision ? DECISION_LABELS[decision] ?? "" : "未判断";
    const current = article.currentText
      ? article.currentText.replace(/\n/g, " ")
      : "（規定なし）";
    const draft = article.draftText
      ? article.draftText.replace(/\n/g, " ")
      : "（未生成）";
    lines.push(
      `| ${article.articleNum} | ${article.title} | ${current} | ${draft} | ${decisionLabel} |`
    );
  }

  return lines.join("\n");
}

/** 変更サマリーテキストを生成 */
function generateSummaryText(
  articles: ReviewArticle[],
  decisions: Record<string, Decision>,
  counts: { adopted: number; modified: number; pending: number }
): string {
  const lines: string[] = [
    "===================================",
    "  管理規約 変更サマリー",
    "===================================",
    "",
    `作成日: ${new Date().toLocaleDateString("ja-JP")}`,
    "",
    `■ レビュー結果: 採用 ${counts.adopted}件 / 修正 ${counts.modified}件 / 保留 ${counts.pending}件`,
    "",
    "-----------------------------------",
    "  変わること",
    "-----------------------------------",
    "",
  ];

  const adopted = articles.filter(
    (a) => decisions[a.id] === "adopted" || decisions[a.id] === "modified"
  );
  const pending = articles.filter((a) => decisions[a.id] === "pending");
  const undecided = articles.filter((a) => !decisions[a.id]);

  if (adopted.length > 0) {
    for (const article of adopted) {
      const label =
        decisions[article.id] === "modified" ? "（修正のうえ採用）" : "";
      lines.push(`● ${article.articleNum} ${article.title}${label}`);
      lines.push(`  ${article.summary}`);
      lines.push("");
    }
  } else {
    lines.push("（なし）");
    lines.push("");
  }

  lines.push("-----------------------------------");
  lines.push("  保留（今回は変更しない）");
  lines.push("-----------------------------------");
  lines.push("");

  if (pending.length > 0) {
    for (const article of pending) {
      lines.push(`● ${article.articleNum} ${article.title}`);
      lines.push(`  ${article.summary}`);
      lines.push("");
    }
  } else {
    lines.push("（なし）");
    lines.push("");
  }

  if (undecided.length > 0) {
    lines.push("-----------------------------------");
    lines.push("  未判断");
    lines.push("-----------------------------------");
    lines.push("");
    for (const article of undecided) {
      lines.push(`● ${article.articleNum} ${article.title}`);
      lines.push(`  ${article.summary}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** CSV文字列を生成 */
function generateCSV(
  articles: ReviewArticle[],
  decisions: Record<string, Decision>,
  memos: Record<string, string>
): string {
  const BOM = "\uFEFF"; // Excel用BOM
  const headers = ["条文番号", "項目名", "重要度", "カテゴリ", "概要", "判断", "メモ"];
  const importanceLabels: Record<string, string> = {
    mandatory: "法的必須",
    recommended: "推奨",
    optional: "任意",
  };

  const rows = articles.map((article) => {
    const decision = decisions[article.id];
    const decisionLabel = decision ? DECISION_LABELS[decision] ?? "" : "未判断";
    const memo = memos[article.id] ?? "";
    return [
      article.articleNum,
      article.title,
      importanceLabels[article.importance] ?? article.importance,
      article.category,
      article.summary,
      decisionLabel,
      memo,
    ];
  });

  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvContent = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\n");

  return BOM + csvContent;
}

/** CSVをファイルとしてダウンロード */
function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- メインコンポーネント ----------

export default function ExportPage() {
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [phase, setPhase] = useState<"loading" | "no-data" | "ready">(
    "loading"
  );
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const initDone = useRef(false);

  /** フィードバックを一定時間後にクリア */
  const showFeedback = useCallback((id: string, message: string) => {
    setFeedbacks((prev) => ({ ...prev, [id]: message }));
    setTimeout(() => {
      setFeedbacks((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 3000);
  }, []);

  /** 初期化: セッションストアからデータを読み込み */
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const gaps = loadGapResults();
    const decisions = loadReviewDecisions();
    const memos = loadReviewMemos();
    const savedArticles = loadReviewArticles();

    // レビュー判断データがあるかどうかで分岐
    const hasDecisions =
      decisions && Object.values(decisions).some((d) => d !== null);

    if (hasDecisions) {
      // セッションにレビュー結果がある場合
      let articles: ReviewArticle[];

      if (savedArticles && savedArticles.length > 0) {
        // 保存された ReviewArticle がある場合はそれを使用
        articles = savedArticles;
      } else if (gaps && gaps.length > 0) {
        // ギャップ結果から ReviewArticle に変換
        const reviewTargets = gaps.filter(
          (g) => g.status !== "ok" && g.status !== "extra"
        );
        articles =
          reviewTargets.length > 0
            ? reviewTargets.map((g, i) => gapToReviewArticle(g, i))
            : SAMPLE_REVIEW_ARTICLES;
      } else {
        // ギャップ結果もない → デモ記事で表示
        articles = SAMPLE_REVIEW_ARTICLES;
      }

      setReviewData({
        articles,
        decisions: decisions ?? {},
        memos: memos ?? {},
        gaps: gaps ?? [],
        isDemo: false,
      });
      setPhase("ready");
    } else {
      // レビュー結果がない場合はデモデータにフォールバック
      // ただし、ギャップ分析すらしていない場合は「データなし」表示
      if (!gaps || gaps.length === 0) {
        // デモデータで表示
        setReviewData({
          articles: SAMPLE_REVIEW_ARTICLES,
          decisions: DEMO_DECISIONS,
          memos: DEMO_MEMOS,
          gaps: [],
          isDemo: true,
        });
        setPhase("ready");
      } else {
        // ギャップ分析はしたがレビューが未完了
        setPhase("no-data");
      }
    }
  }, []);

  /** 判断カウントを計算 */
  const counts = reviewData
    ? {
        adopted: Object.values(reviewData.decisions).filter(
          (d) => d === "adopted"
        ).length,
        modified: Object.values(reviewData.decisions).filter(
          (d) => d === "modified"
        ).length,
        pending: Object.values(reviewData.decisions).filter(
          (d) => d === "pending"
        ).length,
      }
    : { adopted: 0, modified: 0, pending: 0 };

  /** エクスポートアクション */
  async function handleExport(formatId: string) {
    if (!reviewData) return;

    switch (formatId) {
      case "review-pdf": {
        window.print();
        showFeedback(formatId, "印刷ダイアログを表示しました");
        break;
      }
      case "resolution-word": {
        const markdown = generateComparisonMarkdown(
          reviewData.articles,
          reviewData.decisions
        );
        try {
          await navigator.clipboard.writeText(markdown);
          showFeedback(formatId, "新旧対照表をコピーしました");
        } catch {
          showFeedback(formatId, "コピーに失敗しました。手動でコピーしてください");
        }
        break;
      }
      case "summary-pdf": {
        const summary = generateSummaryText(
          reviewData.articles,
          reviewData.decisions,
          counts
        );
        try {
          await navigator.clipboard.writeText(summary);
          showFeedback(formatId, "変更サマリーをコピーしました");
        } catch {
          showFeedback(
            formatId,
            "コピーに失敗しました。手動でコピーしてください"
          );
        }
        break;
      }
      case "review-record": {
        const csv = generateCSV(
          reviewData.articles,
          reviewData.decisions,
          reviewData.memos
        );
        const date = new Date().toISOString().split("T")[0];
        downloadCSV(csv, `レビュー結果_${date}.csv`);
        showFeedback(formatId, "CSVファイルをダウンロードしました");
        break;
      }
    }
  }

  // ---- ローディング ----
  if (phase === "loading") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={5} />
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
                エクスポートデータを準備中...
              </p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---- レビュー未完了 ----
  if (phase === "no-data") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={5} />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
                <span className="text-2xl" aria-hidden="true">
                  📝
                </span>
              </div>
              <div>
                <p className="font-medium mb-1">レビューが完了していません</p>
                <p className="text-sm text-muted-foreground">
                  エクスポートするには、まず改正案のレビューを完了してください。
                </p>
              </div>
              <Button asChild className="min-h-[44px]">
                <Link href="/review">レビュー画面へ</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---- メイン表示 ----
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={5} />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8 print:max-w-none print:px-8">
        <div className="mb-8 print:hidden">
          <Badge variant="secondary" className="mb-2">
            ステップ 5 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">改正案エクスポート</h2>
          <p className="text-muted-foreground">
            レビュー結果をもとに、用途に応じた形式でダウンロードできます。
          </p>
        </div>

        {/* デモモード表示 */}
        {reviewData?.isDemo && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg print:hidden">
            <p className="text-sm text-amber-800 font-medium">
              デモデータを使用しています
            </p>
            <p className="text-xs text-amber-700 mt-1">
              レビュー結果が利用できないため、サンプルデータを表示しています。
            </p>
          </div>
        )}

        {/* レビューサマリー */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">レビュー結果サマリー</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {counts.adopted}
                </p>
                <p className="text-xs text-muted-foreground">採用</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">
                  {counts.modified}
                </p>
                <p className="text-xs text-muted-foreground">修正</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">
                  {counts.pending}
                </p>
                <p className="text-xs text-muted-foreground">保留</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 印刷用コンテンツ（通常は非表示、print時のみ表示） */}
        <div className="hidden print:block">
          <h1 className="text-xl font-bold mb-4">
            管理規約改正案 レビュー結果
          </h1>
          <p className="text-sm mb-4">
            作成日: {new Date().toLocaleDateString("ja-JP")}
          </p>
          <table className="w-full border-collapse text-sm mb-8">
            <thead>
              <tr>
                <th className="border p-2 text-left bg-gray-100">条文</th>
                <th className="border p-2 text-left bg-gray-100">項目</th>
                <th className="border p-2 text-left bg-gray-100">概要</th>
                <th className="border p-2 text-left bg-gray-100">判断</th>
                <th className="border p-2 text-left bg-gray-100">メモ</th>
              </tr>
            </thead>
            <tbody>
              {reviewData?.articles.map((article) => {
                const decision = reviewData.decisions[article.id];
                const memo = reviewData.memos[article.id] ?? "";
                return (
                  <tr key={article.id}>
                    <td className="border p-2">{article.articleNum}</td>
                    <td className="border p-2">{article.title}</td>
                    <td className="border p-2">{article.summary}</td>
                    <td className="border p-2">
                      {decision
                        ? DECISION_LABELS[decision] ?? ""
                        : "未判断"}
                    </td>
                    <td className="border p-2">{memo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Separator className="mb-6 print:hidden" />

        {/* エクスポート形式カード */}
        <div className="space-y-4 mb-8 print:hidden">
          {EXPORT_FORMATS.map((fmt) => (
            <Card key={fmt.id}>
              <CardContent className="flex items-start gap-4 py-4">
                <span className="text-3xl mt-1" aria-hidden="true">
                  {fmt.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{fmt.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmt.description}
                  </p>
                  {feedbacks[fmt.id] && (
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      {feedbacks[fmt.id]}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 min-h-[44px]"
                  onClick={() => handleExport(fmt.id)}
                >
                  {fmt.actionLabel}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 次のステップ案内 */}
        <Card className="bg-muted/50 print:hidden">
          <CardContent className="py-6">
            <p className="font-medium mb-2">お疲れさまでした！</p>
            <p className="text-sm text-muted-foreground mb-4">
              ダウンロードした資料を使って、以下のステップで規約改正を進めてください。
            </p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                <strong>理事会で検討</strong> —
                レビュー配布用PDFを印刷して理事会メンバーに配布し、意見を集約
              </li>
              <li>
                <strong>住民説明会</strong> —
                変更サマリーを使って住民に改正内容を説明
              </li>
              <li>
                <strong>総会で決議</strong> —
                総会議案用の新旧対照表を議案書に添付し、特別決議で可決
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mt-4">
              重要な条文については、マンション管理士や弁護士への確認をお勧めします。
            </p>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
