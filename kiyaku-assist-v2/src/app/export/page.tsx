"use client";

/**
 * エクスポート画面
 *
 * レビュー結果を Markdown / CSV 形式でダウンロードする。
 * API 経由（callExport）で Blob を取得し、ブラウザでダウンロードを実行する。
 *
 * v1 からの改善点:
 * - callExport() API を使用した Blob ダウンロード
 * - StepId が文字列ベース（"export"）
 * - Zustand ストアからレビューデータを取得
 * - 印刷用スタイルの考慮
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { diffChars } from "diff";
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
import { cn } from "@/lib/utils";
import type { StepId } from "@/shared/journey";
import {
  getReviewArticles,
  getReviewProgress,
  callExport,
  syncCurrentStep,
} from "@/shared/api-client";
import type { ReviewArticle } from "@/shared/db/types";
import type { ReviewProgress } from "@/domains/review/types";
import {
  loadProjectId,
  loadReviewDecisions,
  loadOnboarding,
} from "@/shared/store";
import { AuthGuard } from "@/shared/auth/auth-guard";
import {
  getDecisionLabel,
  getImportanceLabel,
  groupExportArticlesByChapter,
  toExportArticle,
} from "@/domains/export/presentation";

// ---------- 差分ハイライト（印刷プレビュー用） ----------

/** 現行規約セル: 削除部分を赤+取り消し線でハイライト */
function PrintOriginalDiff({ original, draft }: { original: string; draft: string }) {
  const parts = useMemo(() => diffChars(original, draft), [original, draft]);
  return (
    <td className="border border-gray-300 p-2 align-top whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.added) return null;
        if (part.removed) {
          return (
            <span key={i} className="bg-red-200 text-red-900 line-through">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </td>
  );
}

/** 改定案セル: 追加部分を緑+下線でハイライト */
function PrintDraftDiff({ original, draft }: { original: string; draft: string }) {
  const parts = useMemo(() => diffChars(original, draft), [original, draft]);
  return (
    <td className="border border-gray-300 p-2 align-top whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.removed) return null;
        if (part.added) {
          return (
            <span key={i} className="bg-green-200 text-green-900 underline">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </td>
  );
}

// ---------- 型定義 ----------

interface ExportFormat {
  id: string;
  title: string;
  description: string;
  icon: string;
  format: "markdown" | "csv" | "pdf" | "word";
  actionLabel: string;
}

// ---------- 定数 ----------

/** エクスポート形式定義 */
const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "markdown",
    title: "Markdown（新旧対照表）",
    description:
      "新旧対照表と変更サマリーを含む Markdown ファイルをダウンロードします。Word などへの貼り付けに便利です。",
    icon: "M",
    format: "markdown",
    actionLabel: "Markdown ダウンロード",
  },
  {
    id: "csv",
    title: "CSV（レビュー結果一覧）",
    description:
      "各条文の判断結果（採用/修正/保留）とメモを一覧化した CSV ファイルをダウンロードします。Excel で開けます。",
    icon: "C",
    format: "csv",
    actionLabel: "CSV ダウンロード",
  },
  {
    id: "pdf",
    title: "PDF（新旧対照表）",
    description:
      "Markdown と同じ内容の新旧対照表を PDF ファイルとしてダウンロードします。印刷して配布する用途に向いています。",
    icon: "P",
    format: "pdf",
    actionLabel: "PDF ダウンロード",
  },
  {
    id: "word",
    title: "Word（新旧対照表）",
    description:
      "表紙・サマリー・新旧対照表を含む Word ファイルをダウンロードします。理事会への配布・編集用に最適です。",
    icon: "W",
    format: "word",
    actionLabel: "Word ダウンロード",
  },
];

// ---------- ユーティリティ ----------

/** Blob をファイルとしてダウンロード */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- コンポーネント ----------

export default function ExportPage() {
  return <AuthGuard><ExportPageContent /></AuthGuard>;
}

function ExportPageContent() {
  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [condoName, setCondoName] = useState("マンション");
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "adopted" | "modified" | "keep-current" | "adopt-management" | "pending" | null>>({});
  const [phase, setPhase] = useState<"loading" | "no-data" | "ready">(
    "loading"
  );
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [exportLoading, setExportLoading] = useState<Record<string, boolean>>(
    {}
  );

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

  // ---------- 初期化 ----------

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const pid = loadProjectId();

    if (!pid) {
      setPhase("no-data");
      return;
    }

    // onboarding からマンション名を復元
    const onboarding = loadOnboarding();
    if (onboarding?.condoName) {
      setCondoName(onboarding.condoName);
    }

    (async () => {
      try {
        // API からレビュー記事と進捗を並行取得
        const [articlesRes, progressRes] = await Promise.all([
          getReviewArticles(pid),
          getReviewProgress(pid),
        ]);

        if (
          !articlesRes.articles ||
          articlesRes.articles.length === 0
        ) {
          setPhase("no-data");
          return;
        }

        setArticles(articlesRes.articles);
        setProgress(progressRes.progress);

        // ストアから判断・メモを復元
        const savedDecisions = loadReviewDecisions();
        if (savedDecisions) {
          setDecisions(savedDecisions);
        } else {
          // API の decision を初期値として使用
          const d: Record<string, "adopted" | "modified" | "keep-current" | "adopt-management" | "pending" | null> = {};
          for (const a of articlesRes.articles) {
            if (a.id && a.decision) d[a.id] = a.decision;
          }
          setDecisions(d);
        }
        setPhase("ready");
        // エクスポート画面到達 → step=5 を記録
        syncCurrentStep(pid, 5);
      } catch (err) {
        console.error("エクスポートデータの読み込みに失敗:", err);
        setPhase("no-data");
      }
    })();
  }, []);

  // ---------- カウント計算 ----------

  const counts = {
    adopted: Object.values(decisions).filter((d) => d === "adopted").length,
    modified: Object.values(decisions).filter((d) => d === "modified").length,
    pending: Object.values(decisions).filter((d) => d === "pending").length,
    undecided: articles.length -
      Object.values(decisions).filter(
        (d) => d === "adopted" || d === "modified" || d === "pending"
      ).length,
  };

  // ---------- エクスポートアクション ----------

  async function handleExport(fmt: ExportFormat) {
    const pid = loadProjectId();
    if (!pid) return;

    setExportLoading((prev) => ({ ...prev, [fmt.id]: true }));

    try {
      const blob = await callExport({
        projectId: pid,
        condoName,
        format: fmt.format,
        includeTimestamp: true,
      });

      const date = new Date().toISOString().split("T")[0];
      const extMap: Record<string, string> = { csv: "csv", pdf: "pdf", word: "docx", markdown: "md" };
      const ext = extMap[fmt.format] ?? "md";
      const filename = `管理規約_${fmt.format === "csv" ? "レビュー結果" : "新旧対照表"}_${date}.${ext}`;

      downloadBlob(blob, filename);
      showFeedback(fmt.id, "ダウンロードを開始しました");
    } catch (err) {
      console.error("エクスポートエラー:", err);
      showFeedback(
        fmt.id,
        err instanceof Error ? err.message : "エクスポートに失敗しました"
      );
    } finally {
      setExportLoading((prev) => ({ ...prev, [fmt.id]: false }));
    }
  }

  // ---------- ローディング ----------

  if (phase === "loading") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader showProgress={false} />
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
              <p className="text-base text-muted-foreground">
                エクスポートデータを準備中...
              </p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---------- レビュー未完了 ----------

  if (phase === "no-data") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader showProgress={false} />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
                <span className="text-2xl font-bold text-amber-600">!</span>
              </div>
              <div>
                <p className="font-medium mb-1">レビューが完了していません</p>
                <p className="text-base text-muted-foreground">
                  エクスポートするには、まず改正案のレビューを完了してください。
                </p>
              </div>
              <Button asChild>
                <Link href="/review">レビュー画面へ</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---------- メイン表示 ----------

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={"export" as StepId} />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8 print:max-w-none print:px-8">
        {/* ヘッダー（印刷時は非表示） */}
        <div className="mb-8 print:hidden">
          <Badge variant="secondary" className="mb-2">
            ステップ 6 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">改正案エクスポート</h2>
          <p className="text-muted-foreground">
            レビュー結果をもとに、用途に応じた形式でダウンロードできます。
          </p>
        </div>

        {/* レビューサマリー */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">レビュー結果サマリー</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {counts.adopted}
                </p>
                <p className="text-sm text-muted-foreground">採用</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">
                  {counts.modified}
                </p>
                <p className="text-sm text-muted-foreground">修正</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">
                  {counts.pending}
                </p>
                <p className="text-sm text-muted-foreground">保留</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">
                  {counts.undecided}
                </p>
                <p className="text-sm text-muted-foreground">未決定</p>
              </div>
            </div>
            {progress && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  全 {articles.length} 条文中{" "}
                  {counts.adopted + counts.modified + counts.pending} 件判断済み
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 印刷用コンテンツ（通常は非表示、print時のみ表示） */}
        <div className="hidden print:block">
          <h1 className="text-xl font-bold mb-2">{condoName} 管理規約改定案</h1>
          <p className="text-sm text-gray-600 mb-1">
            生成日: {new Date().toLocaleDateString("ja-JP")}
          </p>
          <p className="text-sm text-gray-600 mb-4">対象条文数: {articles.length} 条</p>

          {/* 凡例 */}
          <div className="flex gap-4 mb-4 border border-gray-200 rounded p-2 bg-gray-50 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-200" /> 削除（取り消し線）
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-200" /> 追加（下線）
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border border-gray-300 bg-white" /> 変更なし
            </span>
          </div>

          {groupExportArticlesByChapter(articles.map(toExportArticle)).map((chapter) => (
            <div key={chapter.chapter} className="mb-5">
              <h2 className="text-base font-bold border-b-2 border-gray-800 pb-1 mb-3">
                第{chapter.chapter}章 {chapter.chapterTitle}
              </h2>

              {chapter.articles.map((article) => (
                <div
                  key={`${chapter.chapter}-${article.articleNum}`}
                  className="print-article-block border border-gray-300 rounded mb-3 p-3"
                >
                  <h3 className="font-bold text-sm mb-2">{article.articleNum}</h3>

                  <table className="w-full text-xs border-collapse mb-3">
                    <tbody>
                      <tr>
                        <th className="text-left border border-gray-300 bg-gray-50 p-2 w-24">重要度</th>
                        <td className="border border-gray-300 p-2">
                          {getImportanceLabel(article.importance)}
                        </td>
                      </tr>
                      <tr>
                        <th className="text-left border border-gray-300 bg-gray-50 p-2">判定</th>
                        <td className="border border-gray-300 p-2">
                          {getDecisionLabel(article.decision)}
                        </td>
                      </tr>
                      <tr>
                        <th className="text-left border border-gray-300 bg-gray-50 p-2">準拠</th>
                        <td className="border border-gray-300 p-2">{article.baseRef}</td>
                      </tr>
                    </tbody>
                  </table>

                  {article.original ? (
                    <div className="mb-3">
                      <p className="text-xs font-medium mb-1">新旧対照表（変更箇所ハイライト）</p>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="text-left border border-gray-300 bg-gray-50 p-2 align-top w-1/2">
                              現行規約
                            </th>
                            <th className="text-left border border-gray-300 bg-gray-50 p-2 align-top w-1/2">
                              改定案
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <PrintOriginalDiff original={article.original} draft={article.draft} />
                            <PrintDraftDiff original={article.original} draft={article.draft} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <p className="text-xs font-medium mb-1">改定案（新規追加）</p>
                      <p className="text-sm whitespace-pre-wrap bg-green-200 text-green-900 underline">{article.draft}</p>
                    </div>
                  )}

                  <p className="text-xs mb-1">
                    <span className="font-medium">要約:</span> {article.summary}
                  </p>
                  <p className="text-xs">
                    <span className="font-medium">解説:</span> {article.explanation}
                  </p>
                </div>
              ))}
            </div>
          ))}

          {/* フッター */}
          <div className="mt-6 pt-2 border-t text-xs text-gray-500">
            <p>※ 本資料は規約リノベにより自動生成されたものです。法的助言ではありません。</p>
            <p>※ 最終的な規約案の決定にあたっては、マンション管理士や弁護士等の専門家にご相談ください。</p>
          </div>
        </div>

        <Separator className="mb-6 print:hidden" />

        {/* エクスポート形式カード */}
        <div className="space-y-4 mb-8 print:hidden">
          {EXPORT_FORMATS.map((fmt) => (
            <Card key={fmt.id}>
              <CardContent className="flex items-start gap-4 py-4">
                {/* アイコン */}
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary font-bold text-lg shrink-0 mt-0.5">
                  {fmt.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-base">{fmt.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {fmt.description}
                  </p>
                  {feedbacks[fmt.id] && (
                    <p
                      className={cn(
                        "text-sm mt-1 font-medium",
                        feedbacks[fmt.id].includes("失敗")
                          ? "text-red-600"
                          : "text-green-600"
                      )}
                    >
                      {feedbacks[fmt.id]}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={exportLoading[fmt.id] ?? false}
                  onClick={() => handleExport(fmt)}
                  data-test={`export-download-${fmt.id}`}
                >
                  {exportLoading[fmt.id] ? (
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
                      準備中...
                    </span>
                  ) : (
                    fmt.actionLabel
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* 印刷ボタン */}
          <Card>
            <CardContent className="flex items-start gap-4 py-4">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary font-bold text-lg shrink-0 mt-0.5">
                印
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base">印刷 / PDF 保存</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  ブラウザの印刷機能を使って PDF として保存できます。理事会への配布用に便利です。
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => window.print()}
              >
                印刷プレビュー
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 免責事項 */}
        <Card className="bg-amber-50 border-amber-200 mb-6 print:hidden">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-amber-800 mb-2">
              免責事項
            </p>
            <p className="text-sm text-amber-700 leading-relaxed">
              本ツールが生成した改正案は、AI による参考情報であり、法的助言ではありません。
              実際の規約改正にあたっては、必ずマンション管理士や弁護士等の専門家に確認のうえ、
              総会での適切な手続きを経て決議してください。
              特に法的必須項目（改正区分所有法対応）については、専門家の確認を強く推奨します。
            </p>
          </CardContent>
        </Card>

        {/* 次のステップ案内 */}
        <Card className="bg-muted/50 print:hidden">
          <CardContent className="py-6">
            <p className="font-medium mb-2">お疲れさまでした！</p>
            <p className="text-base text-muted-foreground mb-4">
              ダウンロードした資料を使って、以下のステップで規約改正を進めてください。
            </p>
            <ol className="text-base text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                <strong>理事会で検討</strong> ―
                レビュー結果を印刷して理事会メンバーに配布し、意見を集約
              </li>
              <li>
                <strong>住民説明会</strong> ―
                変更サマリーを使って住民に改正内容を説明
              </li>
              <li>
                <strong>総会で決議</strong> ―
                新旧対照表を議案書に添付し、特別決議で可決
              </li>
            </ol>
            <p className="text-sm text-muted-foreground mt-4">
              重要な条文については、マンション管理士や弁護士への確認をお勧めします。
            </p>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
