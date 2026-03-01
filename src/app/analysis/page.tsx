"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/lib/sample-analysis";

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

export default function AnalysisPage() {
  const [filter, setFilter] = useState<FilterStatus>("all");

  const results = SAMPLE_GAP_RESULTS;
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

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card
            className="cursor-pointer hover:ring-2 ring-red-300"
            onClick={() => setFilter("missing")}
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-red-600">{counts.missing}</p>
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
              フィルター: {filter === "missing" ? "未対応" : filter === "needs-update" ? "要修正" : "対応済み"}
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
                {counts.mandatory}件の法的必須項目を含む{counts.missing + counts.needsUpdate}
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
