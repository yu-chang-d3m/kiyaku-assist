"use client";

/**
 * 3カラム比較ビュー
 *
 * 左: 現行規約（赤系）
 * 中: 管理会社案（黄系）
 * 右: 改正案（青系）
 *
 * 管理会社案がない条文は TwoColumnView にフォールバック。
 * モバイルではタブ切替で表示。
 */

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { InlineDiff } from "@/components/diff/inline-diff";
import { SEMANTIC_GROUP_LABELS } from "@/domains/taxonomy/constants";
import type { SemanticGroupId } from "@/domains/taxonomy/types";

interface ThreeColumnViewProps {
  /** 現行条文テキスト（null = 新規追加） */
  original: string | null;
  /** 管理会社案テキスト（null = なし） */
  managementDraft: string | null;
  /** 改正案テキスト */
  reformText: string;
  /** 意味グループ ID */
  semanticGroup?: string;
  /** 課題グループ名 */
  issueGroup?: string;
  /** 詳細な改正背景 */
  detailedBackground?: string;
  /** 住民生活への影響 */
  impactOnResidents?: string;
  /** 変更しなかった場合のリスク */
  riskIfUnchanged?: string;
  /** 経過措置 */
  transitionalMeasure?: string;
}

export function ThreeColumnView({
  original,
  managementDraft,
  reformText,
  semanticGroup,
  issueGroup,
  detailedBackground,
  impactOnResidents,
  riskIfUnchanged,
  transitionalMeasure,
}: ThreeColumnViewProps) {
  const [activeTab, setActiveTab] = useState<string>("compare");
  const hasOriginal = original !== null && original.trim() !== "";
  const hasMgmt = managementDraft !== null && managementDraft.trim() !== "";
  const hasReform = reformText.trim() !== "";

  const groupLabel = semanticGroup
    ? SEMANTIC_GROUP_LABELS[semanticGroup as SemanticGroupId] ?? semanticGroup
    : null;

  return (
    <div className="space-y-3">
      {/* メタ情報バッジ */}
      <div className="flex flex-wrap gap-2">
        {groupLabel && (
          <Badge variant="outline" className="text-xs">
            {groupLabel}
          </Badge>
        )}
        {issueGroup && (
          <Badge variant="secondary" className="text-xs">
            {issueGroup}
          </Badge>
        )}
        {hasMgmt && (
          <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">
            管理会社案あり
          </Badge>
        )}
      </div>

      {/* デスクトップ: 3カラム */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-3">
        <Column
          title="現行規約"
          text={hasOriginal ? original! : "（条文なし — 新規追加が必要）"}
          isEmpty={!hasOriginal}
          className="border-red-200 bg-red-50/30"
        />
        <Column
          title="管理会社案"
          text={hasMgmt ? managementDraft! : "（管理会社案なし）"}
          isEmpty={!hasMgmt}
          className="border-yellow-200 bg-yellow-50/30"
        />
        <Column
          title="改正案"
          text={hasReform ? reformText : "（改正案未生成）"}
          isEmpty={!hasReform}
          className="border-blue-200 bg-blue-50/30"
        />
      </div>

      {/* 差分表示（デスクトップのみ） */}
      {hasOriginal && hasReform && (
        <div className="hidden md:block">
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              現行 → 改正案の差分を表示
            </summary>
            <div className="mt-2 rounded-md border p-3 text-sm">
              <InlineDiff oldText={original!} newText={reformText} />
            </div>
          </details>
        </div>
      )}

      {hasOriginal && hasMgmt && (
        <div className="hidden md:block">
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              現行 → 管理会社案の差分を表示
            </summary>
            <div className="mt-2 rounded-md border p-3 text-sm">
              <InlineDiff oldText={original!} newText={managementDraft!} />
            </div>
          </details>
        </div>
      )}

      {/* モバイル: タブ */}
      <div className="md:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="compare" className="flex-1 text-xs">
              差分
            </TabsTrigger>
            <TabsTrigger value="current" className="flex-1 text-xs">
              現行
            </TabsTrigger>
            {hasMgmt && (
              <TabsTrigger value="mgmt" className="flex-1 text-xs">
                管理会社案
              </TabsTrigger>
            )}
            <TabsTrigger value="reform" className="flex-1 text-xs">
              改正案
            </TabsTrigger>
          </TabsList>
          <TabsContent value="compare">
            {hasOriginal && hasReform ? (
              <div className="rounded-md border p-3 text-sm">
                <InlineDiff oldText={original!} newText={reformText} />
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                比較するには現行規約と改正案の両方が必要です
              </p>
            )}
          </TabsContent>
          <TabsContent value="current">
            <TextBlock
              text={hasOriginal ? original! : "条文なし"}
              isEmpty={!hasOriginal}
            />
          </TabsContent>
          {hasMgmt && (
            <TabsContent value="mgmt">
              <TextBlock text={managementDraft!} isEmpty={false} />
            </TabsContent>
          )}
          <TabsContent value="reform">
            <TextBlock
              text={hasReform ? reformText : "改正案未生成"}
              isEmpty={!hasReform}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* 補足情報 */}
      {(detailedBackground || impactOnResidents || riskIfUnchanged || transitionalMeasure) && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            詳細情報
          </summary>
          <div className="mt-2 space-y-3 rounded-md border p-3">
            {detailedBackground && (
              <InfoSection title="改正背景" text={detailedBackground} />
            )}
            {impactOnResidents && (
              <InfoSection title="住民生活への影響" text={impactOnResidents} />
            )}
            {riskIfUnchanged && (
              <InfoSection title="未改正のリスク" text={riskIfUnchanged} />
            )}
            {transitionalMeasure && (
              <InfoSection title="経過措置" text={transitionalMeasure} />
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ---------- サブコンポーネント ----------

function Column({
  title,
  text,
  isEmpty,
  className = "",
}: {
  title: string;
  text: string;
  isEmpty: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-md border p-3 ${className}`}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div
        className={`whitespace-pre-wrap text-sm leading-relaxed ${
          isEmpty ? "italic text-muted-foreground" : ""
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function TextBlock({ text, isEmpty }: { text: string; isEmpty: boolean }) {
  return (
    <div
      className={`rounded-md border p-3 text-sm leading-relaxed whitespace-pre-wrap ${
        isEmpty ? "italic text-muted-foreground" : ""
      }`}
    >
      {text}
    </div>
  );
}

function InfoSection({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h5 className="text-xs font-semibold text-muted-foreground">{title}</h5>
      <p className="mt-1 text-sm leading-relaxed">{text}</p>
    </div>
  );
}
