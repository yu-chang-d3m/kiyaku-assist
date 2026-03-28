"use client";

/**
 * 意味グループ別ナビゲーター
 *
 * 12グループのアコーディオンサイドバー。
 * 各グループに進捗バッジ（決定済み/全件）を表示し、
 * 条文クリックでメインエリアにスクロールする。
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { SEMANTIC_GROUPS } from "@/domains/taxonomy/constants";
import type { ReviewArticle } from "@/shared/db/types";

interface SemanticNavigatorProps {
  /** レビュー対象の全条文 */
  articles: ReviewArticle[];
  /** 現在選択中の条文番号 */
  selectedArticleNum?: string;
  /** 条文クリック時のコールバック */
  onArticleClick: (articleNum: string) => void;
  /** フィルター: 選択中のグループ ID（null = 全件） */
  selectedGroup: string | null;
  /** グループ選択時のコールバック */
  onGroupSelect: (groupId: string | null) => void;
}

export function SemanticNavigator({
  articles,
  selectedArticleNum,
  onArticleClick,
  selectedGroup,
  onGroupSelect,
}: SemanticNavigatorProps) {
  // グループ別に条文を集計
  const groupedArticles = useMemo(() => {
    const groups = new Map<
      string,
      { articles: ReviewArticle[]; decided: number }
    >();

    // 全グループを初期化
    for (const g of SEMANTIC_GROUPS) {
      groups.set(g.id, { articles: [], decided: 0 });
    }

    // 条文を振り分け
    for (const article of articles) {
      const groupId = article.semanticGroup ?? "misc";
      const group = groups.get(groupId) ?? groups.get("misc")!;
      group.articles.push(article);
      if (article.decision && article.decision !== "pending") {
        group.decided++;
      }
    }

    // 未分類を misc にまとめる
    return groups;
  }, [articles]);

  // 全体進捗
  const totalDecided = articles.filter(
    (a) => a.decision && a.decision !== "pending",
  ).length;

  return (
    <nav className="space-y-1" aria-label="意味グループナビゲーション">
      {/* 全件表示ボタン */}
      <button
        onClick={() => onGroupSelect(null)}
        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
          selectedGroup === null
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">全条文</span>
          <Badge variant="secondary" className="text-xs">
            {totalDecided}/{articles.length}
          </Badge>
        </div>
      </button>

      {/* グループ別ナビゲーション */}
      {SEMANTIC_GROUPS.map((group) => {
        const data = groupedArticles.get(group.id);
        if (!data || data.articles.length === 0) return null;

        const isSelected = selectedGroup === group.id;
        const progress =
          data.articles.length > 0
            ? Math.round((data.decided / data.articles.length) * 100)
            : 0;

        return (
          <div key={group.id}>
            <button
              onClick={() => onGroupSelect(isSelected ? null : group.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{group.label}</span>
                <Badge
                  variant={isSelected ? "outline" : "secondary"}
                  className="text-xs"
                >
                  {data.decided}/{data.articles.length}
                </Badge>
              </div>
              {/* プログレスバー */}
              <div className="mt-1 h-1 w-full rounded-full bg-muted">
                <div
                  className={`h-1 rounded-full transition-all ${
                    progress === 100
                      ? "bg-green-500"
                      : progress > 0
                        ? "bg-blue-500"
                        : "bg-transparent"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </button>

            {/* 展開時: 条文リスト */}
            {isSelected && (
              <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-muted pl-2">
                {data.articles.map((article) => (
                  <button
                    key={article.articleNum}
                    onClick={() => onArticleClick(article.articleNum)}
                    className={`w-full rounded px-2 py-1 text-left text-xs transition-colors ${
                      selectedArticleNum === article.articleNum
                        ? "bg-accent font-medium"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <ImportanceDot importance={article.importance} />
                      <span className="truncate">{article.articleNum}</span>
                      {article.decision &&
                        article.decision !== "pending" && (
                          <span className="ml-auto text-green-600">
                            &#x2713;
                          </span>
                        )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** 重要度を示す小さなドット */
function ImportanceDot({
  importance,
}: {
  importance: string;
}) {
  const color =
    importance === "mandatory"
      ? "bg-red-500"
      : importance === "recommended"
        ? "bg-blue-500"
        : "bg-gray-400";

  return (
    <span
      className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${color}`}
      aria-label={importance}
    />
  );
}
