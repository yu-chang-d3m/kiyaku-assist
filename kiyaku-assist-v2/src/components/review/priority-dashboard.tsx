"use client";

/**
 * 優先度ダッシュボード
 *
 * 重要度別集計、意味グループ別マトリクス、次対応レコメンドを表示。
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SEMANTIC_GROUPS } from "@/domains/taxonomy/constants";
import type { ReviewArticle } from "@/shared/db/types";

interface PriorityDashboardProps {
  articles: ReviewArticle[];
  onGroupClick?: (groupId: string) => void;
}

export function PriorityDashboard({
  articles,
  onGroupClick,
}: PriorityDashboardProps) {
  const stats = useMemo(() => {
    const byImportance = { mandatory: 0, recommended: 0, optional: 0 };
    const decidedByImportance = { mandatory: 0, recommended: 0, optional: 0 };
    const byGroup = new Map<string, { total: number; decided: number }>();

    for (const a of articles) {
      // 重要度別
      const imp = a.importance as keyof typeof byImportance;
      if (imp in byImportance) {
        byImportance[imp]++;
        if (a.decision && a.decision !== "pending") {
          decidedByImportance[imp]++;
        }
      }

      // グループ別
      const gid = a.semanticGroup ?? "misc";
      const existing = byGroup.get(gid) ?? { total: 0, decided: 0 };
      existing.total++;
      if (a.decision && a.decision !== "pending") {
        existing.decided++;
      }
      byGroup.set(gid, existing);
    }

    const totalDecided = articles.filter(
      (a) => a.decision && a.decision !== "pending",
    ).length;

    // 次に対応すべき条文を推薦
    const nextActions = articles
      .filter((a) => !a.decision || a.decision === "pending")
      .sort((a, b) => {
        const order = { mandatory: 0, recommended: 1, optional: 2 };
        return (
          (order[a.importance as keyof typeof order] ?? 2) -
          (order[b.importance as keyof typeof order] ?? 2)
        );
      })
      .slice(0, 3);

    return { byImportance, decidedByImportance, byGroup, totalDecided, nextActions };
  }, [articles]);

  const overallProgress =
    articles.length > 0
      ? Math.round((stats.totalDecided / articles.length) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* 全体進捗 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">レビュー進捗</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Progress value={overallProgress} className="flex-1" />
            <span className="text-sm font-medium tabular-nums">
              {stats.totalDecided}/{articles.length} ({overallProgress}%)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 重要度別 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">重要度別</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ImportanceRow
            label="法的必須"
            decided={stats.decidedByImportance.mandatory}
            total={stats.byImportance.mandatory}
            color="bg-red-500"
          />
          <ImportanceRow
            label="推奨"
            decided={stats.decidedByImportance.recommended}
            total={stats.byImportance.recommended}
            color="bg-blue-500"
          />
          <ImportanceRow
            label="任意"
            decided={stats.decidedByImportance.optional}
            total={stats.byImportance.optional}
            color="bg-gray-400"
          />
        </CardContent>
      </Card>

      {/* 意味グループ別 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">テーマ別</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {SEMANTIC_GROUPS.map((group) => {
            const data = stats.byGroup.get(group.id);
            if (!data || data.total === 0) return null;
            const pct = Math.round((data.decided / data.total) * 100);
            return (
              <button
                key={group.id}
                onClick={() => onGroupClick?.(group.id)}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted"
              >
                <span className="truncate">{group.label}</span>
                <span className="ml-2 tabular-nums text-muted-foreground">
                  {data.decided}/{data.total}
                  {pct === 100 && " ✓"}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* 次の対応レコメンド */}
      {stats.nextActions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">次に対応</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.nextActions.map((a) => (
              <div
                key={a.articleNum}
                className="flex items-center gap-2 text-sm"
              >
                <Badge
                  variant={
                    a.importance === "mandatory" ? "destructive" : "secondary"
                  }
                  className="text-xs"
                >
                  {a.importance === "mandatory"
                    ? "必須"
                    : a.importance === "recommended"
                      ? "推奨"
                      : "任意"}
                </Badge>
                <span>{a.articleNum}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ImportanceRow({
  label,
  decided,
  total,
  color,
}: {
  label: string;
  decided: number;
  total: number;
  color: string;
}) {
  if (total === 0) return null;
  const pct = Math.round((decided / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <span className="min-w-[4rem] text-sm">{label}</span>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-muted">
          <div
            className={`h-2 rounded-full ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="min-w-[3rem] text-right text-xs tabular-nums text-muted-foreground">
        {decided}/{total}
      </span>
    </div>
  );
}
