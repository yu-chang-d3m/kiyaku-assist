"use client";

import { useState } from "react";
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
} from "@/lib/sample-review";

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

export default function ReviewPage() {
  const articles = SAMPLE_REVIEW_ARTICLES;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  const article = articles[currentIndex];
  const decided = Object.values(decisions).filter((d) => d !== null).length;
  const progressPercent = (decided / articles.length) * 100;

  function handleDecision(decision: Decision) {
    if (
      decision === "pending" &&
      article.importance === "mandatory" &&
      !confirm(
        "この項目は法改正への対応として必須です。\n保留にすると、改正後の規約が法的に不完全になるリスクがあります。\nそれでも保留にしますか？"
      )
    ) {
      return;
    }
    setDecisions((prev) => ({ ...prev, [article.id]: decision }));
  }

  function goTo(index: number) {
    if (index >= 0 && index < articles.length) {
      setCurrentIndex(index);
      setShowExplanation(false);
    }
  }

  const allDone = decided === articles.length;

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

        {/* レビューカード */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-5">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                [{currentIndex + 1}/{articles.length}] {article.articleNum}（{article.title}）
              </span>
              <Badge className={IMPORTANCE_STYLE[article.importance]}>
                {IMPORTANCE_LABEL[article.importance]}
              </Badge>
            </div>

            {/* ① 平易な要約 */}
            <div>
              <p className="text-sm font-medium mb-1">何が変わる？</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {article.summary}
              </p>
            </div>

            {/* ② 新旧対照 */}
            <div>
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="text-sm font-medium flex items-center gap-1 mb-2"
              >
                条文の変更内容 {showDiff ? "▲" : "▼"}
              </button>
              {showDiff && (
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
                      ＋ 改正案（変更後）
                    </p>
                    <p className="text-sm text-blue-900 whitespace-pre-line">
                      {article.draftText}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                出典: {article.baseRef}
              </p>
            </div>

            {/* ③ 理事会向け説明文 */}
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

            {/* ④ 判断ボタン */}
            <div className="space-y-3 pt-2">
              <div className="flex gap-3">
                {[
                  { value: "adopted" as Decision, label: "採用", style: "default" as const },
                  { value: "modified" as Decision, label: "修正", style: "outline" as const },
                  { value: "pending" as Decision, label: "保留", style: "outline" as const },
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
                onChange={(e) =>
                  setMemos((prev) => ({ ...prev, [article.id]: e.target.value }))
                }
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
