"use client";

/**
 * グループ別サマリーカード
 *
 * 意味グループ単位のサマリー情報を表示。
 * 改正ポイントの概要、関連条文数、進捗を一覧で見られる。
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEMANTIC_GROUP_MAP } from "@/domains/taxonomy/constants";
import type { SemanticGroupId } from "@/domains/taxonomy/types";
import type { ReviewArticle } from "@/shared/db/types";

interface GroupSummaryCardProps {
  /** グループ ID */
  groupId: string;
  /** このグループに属する条文 */
  articles: ReviewArticle[];
  /** カードクリック時のコールバック */
  onClick?: () => void;
}

export function GroupSummaryCard({
  groupId,
  articles,
  onClick,
}: GroupSummaryCardProps) {
  const group = SEMANTIC_GROUP_MAP.get(groupId as SemanticGroupId);
  if (!group) return null;

  const decided = articles.filter(
    (a) => a.decision && a.decision !== "pending",
  ).length;

  const mandatoryCount = articles.filter(
    (a) => a.importance === "mandatory",
  ).length;

  const issueGroups = new Set(
    articles
      .map((a) => a.issueGroup)
      .filter((g): g is string => !!g),
  );

  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${
        decided === articles.length ? "border-green-200" : ""
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-semibold">
            {group.label}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            P{group.priority}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {group.description}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* 進捗 */}
          <div className="flex items-center justify-between text-xs">
            <span>
              進捗: {decided}/{articles.length}
            </span>
            {mandatoryCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                必須 {mandatoryCount}件
              </Badge>
            )}
          </div>

          {/* プログレスバー */}
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className={`h-1.5 rounded-full transition-all ${
                decided === articles.length
                  ? "bg-green-500"
                  : decided > 0
                    ? "bg-blue-500"
                    : "bg-transparent"
              }`}
              style={{
                width: `${articles.length > 0 ? Math.round((decided / articles.length) * 100) : 0}%`,
              }}
            />
          </div>

          {/* 課題グループ一覧 */}
          {issueGroups.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {[...issueGroups].slice(0, 3).map((ig) => (
                <Badge key={ig} variant="secondary" className="text-xs">
                  {ig}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
