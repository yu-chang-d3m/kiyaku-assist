"use client";

/**
 * 条文判断パネル
 *
 * 各条文に対するユーザーの判断操作を分離したコンポーネント。
 * - 採用: 改正案をそのまま採用
 * - 現行維持: 現行条文のまま変更しない
 * - 修正: 独自に編集
 * - 保留: 後で決定
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type ArticleDecision =
  | "adopted"
  | "modified"
  | "keep-current"
  | "adopt-management"
  | "pending"
  | null;

interface ArticleDecisionPanelProps {
  /** 現在の判断 */
  decision: ArticleDecision;
  /** 判断変更時のコールバック */
  onDecide: (decision: ArticleDecision) => void;
  /** 改正案テキストが存在するか */
  hasReformText: boolean;
  /** 現行条文が存在するか */
  hasOriginal: boolean;
  /** 管理会社案テキストが存在するか */
  hasManagementDraft?: boolean;
  /** メモ */
  memo: string;
  /** メモ変更時のコールバック */
  onMemoChange: (memo: string) => void;
  /** 無効状態 */
  disabled?: boolean;
}

export function ArticleDecisionPanel({
  decision,
  onDecide,
  hasReformText,
  hasOriginal,
  hasManagementDraft = false,
  memo,
  onMemoChange,
  disabled = false,
}: ArticleDecisionPanelProps) {
  return (
    <div className="space-y-3">
      {/* 現在の判断状態 */}
      {decision && decision !== "pending" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">判断:</span>
          <DecisionBadge decision={decision} />
        </div>
      )}

      {/* 判断ボタン群 */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={decision === "adopted" ? "default" : "outline"}
          onClick={() => onDecide("adopted")}
          disabled={disabled || !hasReformText}
          title={!hasReformText ? "改正案が生成されていません" : undefined}
        >
          改正案を採用
        </Button>

        {hasOriginal && (
          <Button
            size="sm"
            variant={decision === "keep-current" ? "default" : "outline"}
            onClick={() => onDecide("keep-current")}
            disabled={disabled}
          >
            現行維持
          </Button>
        )}

        {hasManagementDraft && (
          <Button
            size="sm"
            variant={decision === "adopt-management" ? "default" : "outline"}
            onClick={() => onDecide("adopt-management")}
            disabled={disabled}
          >
            管理会社案を採用
          </Button>
        )}

        <Button
          size="sm"
          variant={decision === "modified" ? "default" : "outline"}
          onClick={() => onDecide("modified")}
          disabled={disabled}
        >
          修正して採用
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDecide("pending")}
          disabled={disabled || decision === "pending" || decision === null}
        >
          保留に戻す
        </Button>
      </div>

      {/* メモ入力 */}
      <div>
        <label
          htmlFor="decision-memo"
          className="mb-1 block text-xs text-muted-foreground"
        >
          メモ（理事会向けコメントなど）
        </label>
        <textarea
          id="decision-memo"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          rows={2}
          placeholder="判断の理由やメモを記入…"
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/** 判断状態のバッジ表示 */
function DecisionBadge({ decision }: { decision: ArticleDecision }) {
  if (!decision || decision === "pending") return null;

  const config: Record<string, { label: string; className: string }> = {
    adopted: {
      label: "採用",
      className: "bg-green-100 text-green-800 border-green-300",
    },
    "keep-current": {
      label: "現行維持",
      className: "bg-gray-100 text-gray-800 border-gray-300",
    },
    "adopt-management": {
      label: "管理会社案",
      className: "bg-amber-100 text-amber-800 border-amber-300",
    },
    modified: {
      label: "修正採用",
      className: "bg-yellow-100 text-yellow-800 border-yellow-300",
    },
  };

  const c = config[decision];
  if (!c) return null;

  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}
