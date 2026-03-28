"use client";

/**
 * 相互参照パネル
 *
 * 選択中の条文の参照関係を表示する。
 * - この条文が参照している条文
 * - この条文を参照している条文
 * - 不整合（参照先不在）の警告
 */

import { Badge } from "@/components/ui/badge";
import type { CrossRefGraph } from "@/domains/crossref/types";
import { getArticleRefSummary } from "@/domains/crossref/validator";

interface CrossRefPanelProps {
  /** 現在の条文番号 */
  articleNum: string;
  /** 参照グラフ */
  graph: CrossRefGraph;
  /** 条文クリック時のコールバック */
  onArticleClick?: (articleNum: string) => void;
}

export function CrossRefPanel({
  articleNum,
  graph,
  onArticleClick,
}: CrossRefPanelProps) {
  const summary = getArticleRefSummary(articleNum, graph);

  if (
    summary.referencesFrom.length === 0 &&
    summary.referencedBy.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">条文間の参照関係</h4>

      {/* 不整合警告 */}
      {summary.hasBrokenRefs && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700">
          <span aria-hidden="true">&#9888;</span>
          <span>参照先が存在しない条文があります</span>
        </div>
      )}

      {/* この条文が参照 */}
      {summary.referencesFrom.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            参照先（{summary.referencesFrom.length}件）
          </p>
          <div className="flex flex-wrap gap-1">
            {summary.referencesFrom.map((num) => {
              const isBroken = graph.broken.some(
                (r) =>
                  r.sourceArticleNum === articleNum &&
                  r.targetArticleNum === num,
              );
              return (
                <Badge
                  key={num}
                  variant={isBroken ? "destructive" : "outline"}
                  className={`cursor-pointer text-xs ${
                    isBroken ? "" : "hover:bg-accent"
                  }`}
                  onClick={() => !isBroken && onArticleClick?.(num)}
                >
                  {num}
                  {isBroken && " (不在)"}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* この条文を参照 */}
      {summary.referencedBy.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            参照元（{summary.referencedBy.length}件）
          </p>
          <div className="flex flex-wrap gap-1">
            {summary.referencedBy.map((num) => (
              <Badge
                key={num}
                variant="secondary"
                className="cursor-pointer text-xs hover:bg-accent"
                onClick={() => onArticleClick?.(num)}
              >
                {num}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
