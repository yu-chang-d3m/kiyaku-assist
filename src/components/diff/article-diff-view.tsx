"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { InlineDiff } from "./inline-diff";
import { DiffLegend } from "./diff-legend";

// スピナー SVG
const Spinner = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

interface ArticleDiffViewProps {
  original: string | null;
  draft: string;
  onDraftEdit: (value: string) => void;
  onDraftSave: () => void;
  isDraftEdited: boolean;
  onGenerateDraft: () => void;
  isDraftLoading: boolean;
  draftError?: string;
  baseRef?: string;
  hasDraft: boolean;
}

/**
 * 条文の差分表示コンポーネント
 *
 * 3タブ構成:
 *   - 変更箇所: インライン差分（読み取り専用）
 *   - 現行規約: original テキスト（読み取り専用）
 *   - 改定案: textarea（編集可能）+ 生成ボタン
 */
export function ArticleDiffView({
  original,
  draft,
  onDraftEdit,
  onDraftSave,
  isDraftEdited,
  onGenerateDraft,
  isDraftLoading,
  draftError,
  baseRef,
  hasDraft,
}: ArticleDiffViewProps) {
  const hasOriginal = original !== null && original.trim() !== "";
  const hasDraftText = draft.trim() !== "";
  const canShowDiff = hasOriginal && hasDraftText;

  return (
    <Tabs defaultValue={canShowDiff ? "diff" : "draft"} className="w-full">
      <TabsList className="w-full justify-start" variant="line">
        <TabsTrigger
          value="diff"
          disabled={!canShowDiff}
          className="min-h-[44px] text-base"
        >
          変更箇所
        </TabsTrigger>
        <TabsTrigger
          value="current"
          disabled={!hasOriginal}
          className="min-h-[44px] text-base"
        >
          現行規約
        </TabsTrigger>
        <TabsTrigger value="draft" className="min-h-[44px] text-base">
          改定案
        </TabsTrigger>
      </TabsList>

      {/* 変更箇所タブ */}
      <TabsContent value="diff" className="mt-3">
        {canShowDiff ? (
          <div className="space-y-2">
            <DiffLegend />
            <div className="p-4 rounded-lg border bg-background">
              <InlineDiff oldText={original!} newText={draft} />
            </div>
          </div>
        ) : !hasOriginal ? (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
            <p className="text-base text-emerald-800">
              新規追加条文です。現行規約に該当する条文がないため、差分表示はありません。
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-base text-muted-foreground">
              改定案が未生成のため、差分を表示できません。「改定案」タブからドラフトを生成してください。
            </p>
          </div>
        )}
      </TabsContent>

      {/* 現行規約タブ */}
      <TabsContent value="current" className="mt-3">
        {hasOriginal ? (
          <div className="p-4 rounded-lg bg-red-50 border border-red-100">
            <p className="text-sm font-medium text-red-700 mb-2">現行（変更前）</p>
            <p className="text-base text-red-900 leading-relaxed whitespace-pre-line">
              {original}
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-base text-muted-foreground">
              現行規約に該当する条文はありません（新規追加）。
            </p>
          </div>
        )}
      </TabsContent>

      {/* 改定案タブ */}
      <TabsContent value="draft" className="mt-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium">AI ドラフト</p>
            {isDraftEdited && (
              <Button variant="outline" size="sm" onClick={onDraftSave}>
                編集を保存
              </Button>
            )}
          </div>
          {hasDraft ? (
            <textarea
              value={draft}
              onChange={(e) => onDraftEdit(e.target.value)}
              aria-label="改定案テキストの編集"
              className="w-full text-base leading-relaxed p-4 border rounded-lg bg-blue-50 border-blue-100 text-blue-900 resize-none min-h-[160px] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
            />
          ) : (
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-base text-muted-foreground">
                ドラフトが未生成です。下のボタンでAIにドラフトを生成させてください。
              </p>
            </div>
          )}
          <Button
            onClick={onGenerateDraft}
            disabled={isDraftLoading}
            variant="outline"
            size="sm"
            className="w-full mt-2 min-h-[44px]"
          >
            {isDraftLoading ? (
              <span className="flex items-center gap-2">
                <Spinner />
                {hasDraft ? "再生成中..." : "AIドラフト生成中..."}
              </span>
            ) : hasDraft ? (
              "AIドラフトを再生成"
            ) : (
              "AIドラフト生成"
            )}
          </Button>
          {draftError && (
            <p className="text-sm text-red-600 mt-1">{draftError}</p>
          )}
          {baseRef && (
            <p className="text-sm text-muted-foreground mt-1">出典: {baseRef}</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
