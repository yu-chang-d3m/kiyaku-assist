"use client";
/**
 * 条文レビュー画面（テーブルビュー + 一括操作 + AI推奨判断）
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { useAuth } from "@/shared/auth/auth-context";
import type { StepId } from "@/shared/journey";
import { getReviewArticles, patchReviewArticle, decideReview, callDraftSingle } from "@/shared/api-client";
import type { ReviewArticle } from "@/shared/db/types";
import type { GapAnalysisItem } from "@/domains/analysis/types";
import { useProjectStore, loadProjectId, loadGapResults, saveReviewDecisions, loadReviewDecisions, saveReviewMemos, loadReviewMemos } from "@/shared/store";

// ---------- 定数・ユーティリティ ----------
const IMPORTANCE_LABEL: Record<string, string> = { mandatory: "法的必須", recommended: "推奨", optional: "任意" };
const IMPORTANCE_STYLE: Record<string, string> = { mandatory: "bg-red-500 text-white", recommended: "bg-blue-500 text-white", optional: "bg-gray-400 text-white" };
const IMPORTANCE_ORDER: Record<string, number> = { mandatory: 0, recommended: 1, optional: 2 };

type Decision = "adopted" | "modified" | "pending";
type FilterType = "all" | "undecided" | "adopted" | "modified" | "pending";
type ImportanceFilter = "all" | "mandatory" | "recommended" | "optional";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "全て" }, { value: "undecided", label: "未決定" },
  { value: "adopted", label: "採用" }, { value: "modified", label: "修正" }, { value: "pending", label: "保留" },
];
const IMPORTANCE_FILTER_OPTIONS: { value: ImportanceFilter; label: string }[] = [
  { value: "all", label: "全重要度" }, { value: "mandatory", label: "法的必須" },
  { value: "recommended", label: "推奨" }, { value: "optional", label: "任意" },
];

/** AI推奨を取得（フィールドがなければ importance から推定） */
function getAiRec(a: ReviewArticle): Decision {
  if (a.aiRecommendation) return a.aiRecommendation;
  return a.importance === "optional" ? "pending" : "adopted";
}
function aiRecIcon(rec: Decision): string {
  return rec === "adopted" ? "\u2713" : rec === "modified" ? "\u25B3" : "\u2212";
}
function extractNum(s: string): number {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}
/** ReviewEvent を構築 */
function buildEvent(decision: Decision, draft?: string) {
  return {
    type: decision === "adopted" ? "ADOPT" : decision === "modified" ? "MODIFY" as const : "RESET" as const,
    ...(decision === "modified" ? { newText: draft ?? "", reason: "レビュー画面で修正" } : {}),
  } as import("@/domains/review/types").ReviewEvent;
}

// スピナー SVG（再利用）
const Spinner = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// ---------- メインコンポーネント ----------
export default function ReviewPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showCurrentText, setShowCurrentText] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const initDone = useRef(false);

  // ---------- 初期化 ----------
  const gapToReview = useCallback(
    (items: GapAnalysisItem[], pid: string): ReviewArticle[] =>
      items.map((item) => ({
        id: item.articleNum, projectId: pid, chapter: 0, articleNum: item.articleNum,
        original: item.currentText, draft: "", summary: item.gapSummary, explanation: item.rationale,
        importance: item.importance, baseRef: item.standardRef, decision: null,
        modificationHistory: [], memo: "", category: item.category,
      })),
    [],
  );

  const initialize = useCallback(async () => {
    try {
      const pid = loadProjectId() ?? "default";
      let fetched: ReviewArticle[] = (await getReviewArticles(pid)).articles ?? [];
      if (fetched.length === 0) {
        const gap = loadGapResults();
        if (gap && gap.length > 0) fetched = gapToReview(gap, pid);
        else { router.push("/analysis"); return; }
      }
      setArticles(fetched);
      const sd = loadReviewDecisions();
      if (sd && Object.keys(sd).length > 0) { setDecisions(sd); }
      else {
        const init: Record<string, string> = {};
        for (const a of fetched) if (a.id && a.decision) init[a.id] = a.decision;
        setDecisions(init);
      }
      const sm = loadReviewMemos();
      if (sm && Object.keys(sm).length > 0) { setMemos(sm); }
      else {
        const init: Record<string, string> = {};
        for (const a of fetched) if (a.id && a.memo) init[a.id] = a.memo;
        setMemos(init);
      }
      setPhase("ready");
    } catch (err) {
      console.error("レビューデータの読み込みに失敗:", err);
      setErrorMessage(err instanceof Error ? err.message : "データの読み込みに失敗しました");
      setPhase("error");
    }
  }, [router, gapToReview]);

  useEffect(() => { if (initDone.current) return; initDone.current = true; initialize(); }, [initialize]);

  // ---------- ソート・フィルタリング ----------
  const sortedArticles = useMemo(() =>
    [...articles].sort((a, b) => {
      const d = (IMPORTANCE_ORDER[a.importance] ?? 2) - (IMPORTANCE_ORDER[b.importance] ?? 2);
      return d !== 0 ? d : extractNum(a.articleNum) - extractNum(b.articleNum);
    }), [articles]);

  const filteredArticles = useMemo(() =>
    sortedArticles.filter((a) => {
      const aid = a.id ?? "";
      if (filter === "undecided" && decisions[aid]) return false;
      if (filter !== "all" && filter !== "undecided" && decisions[aid] !== filter) return false;
      if (importanceFilter !== "all" && a.importance !== importanceFilter) return false;
      return true;
    }), [sortedArticles, filter, importanceFilter, decisions]);

  // 統計
  const decided = Object.values(decisions).filter(Boolean).length;
  const pct = articles.length > 0 ? (decided / articles.length) * 100 : 0;
  const counts = { mandatory: 0, recommended: 0, optional: 0 };
  for (const a of articles) counts[a.importance]++;
  const allDone = articles.length > 0 && decided === articles.length;
  const selectedArticle = selectedId ? articles.find((a) => a.id === selectedId) ?? null : null;

  // ---------- ハンドラ ----------
  async function handleDecision(article: ReviewArticle, decision: Decision) {
    if (!article.id) return;
    if (decision === "pending" && article.importance === "mandatory" &&
      !confirm("この項目は法改正への対応として必須です。\n保留にすると、改正後の規約が法的に不完全になるリスクがあります。\nそれでも保留にしますか？")) return;
    const next = { ...decisions, [article.id]: decision };
    setDecisions(next);
    saveReviewDecisions(next);
    const pid = loadProjectId();
    if (pid) {
      try { await decideReview(pid, article.articleNum, buildEvent(decision, article.draft)); }
      catch (err) { console.error("判断の保存に失敗:", err); }
    }
  }

  async function handleApproveAllAi() {
    const targets = articles.filter((a) => a.id && !decisions[a.id!]);
    if (targets.length === 0) return;
    const next = { ...decisions };
    for (const a of targets) next[a.id!] = getAiRec(a);
    setDecisions(next);
    saveReviewDecisions(next);
    const pid = loadProjectId();
    if (pid) {
      for (const a of targets) {
        const rec = getAiRec(a);
        decideReview(pid, a.articleNum, buildEvent(rec, a.draft)).catch((e) => console.error("AI推奨承認失敗:", e));
      }
    }
  }

  async function handleBulkAdopt() {
    if (checkedIds.size === 0) return;
    const next = { ...decisions };
    const targets = articles.filter((a) => a.id && checkedIds.has(a.id));
    for (const a of targets) next[a.id!] = "adopted";
    setDecisions(next);
    saveReviewDecisions(next);
    setCheckedIds(new Set());
    const pid = loadProjectId();
    if (pid) {
      for (const a of targets) {
        decideReview(pid, a.articleNum, buildEvent("adopted")).catch((e) => console.error("一括採用失敗:", e));
      }
    }
  }

  function handleMemoChange(value: string) {
    if (!selectedArticle?.id) return;
    const next = { ...memos, [selectedArticle.id]: value };
    setMemos(next); saveReviewMemos(next);
  }
  function handleDraftEdit(value: string) {
    if (!selectedArticle?.id) return;
    setEditedDrafts((prev) => ({ ...prev, [selectedArticle.id!]: value }));
  }
  async function handleDraftSave() {
    if (!selectedArticle?.id) return;
    const pid = loadProjectId(); if (!pid) return;
    const t = editedDrafts[selectedArticle.id]; if (t === undefined) return;
    try {
      await patchReviewArticle(pid, { articleNum: selectedArticle.articleNum, draft: t });
      setArticles((prev) => prev.map((a) => (a.id === selectedArticle.id ? { ...a, draft: t } : a)));
    } catch (err) { console.error("ドラフト保存に失敗:", err); }
  }

  async function handleGenerateDraft() {
    if (!selectedArticle?.id) return;
    const sid = selectedArticle.id;
    setDraftLoading((p) => ({ ...p, [sid]: true }));
    setDraftErrors((p) => { const n = { ...p }; delete n[sid]; return n; });
    try {
      const r = await callDraftSingle({
        articleNum: selectedArticle.articleNum, category: selectedArticle.category,
        currentText: selectedArticle.original, gapSummary: selectedArticle.summary,
        importance: selectedArticle.importance,
        condoContext: { condoName: "マンション", condoType: "unknown", unitCount: "medium" },
      });
      setArticles((p) => p.map((a) => a.id === sid
        ? { ...a, draft: r.draft, summary: r.summary || a.summary, explanation: r.explanation || a.explanation } : a));
      setEditedDrafts((p) => { const n = { ...p }; delete n[sid]; return n; });
    } catch (err) {
      console.error("ドラフト生成エラー:", err);
      setDraftErrors((p) => ({ ...p, [sid]: err instanceof Error ? err.message : "ドラフト生成中にエラーが発生しました" }));
    } finally { setDraftLoading((p) => ({ ...p, [sid]: false })); }
  }

  function handleToggleAll() {
    setCheckedIds(checkedIds.size === filteredArticles.length ? new Set() : new Set(filteredArticles.map((a) => a.id ?? "")));
  }
  function handleToggleCheck(id: string) {
    setCheckedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ---------- ローディング / エラー ----------
  if (phase === "loading") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={"review" as StepId} />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 animate-pulse">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">レビューデータを準備中...</p>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader currentStep={"review" as StepId} />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-sm text-red-600">{errorMessage}</p>
              <Button asChild><Link href="/analysis">分析画面に戻る</Link></Button>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  // ---------- 詳細パネル用 ----------
  const selId = selectedArticle?.id ?? "";
  const isDraftLoading = draftLoading[selId] ?? false;
  const draftError = draftErrors[selId];
  const currentDraftText = editedDrafts[selId] ?? selectedArticle?.draft ?? "";
  const isDraftEdited = editedDrafts[selId] !== undefined && editedDrafts[selId] !== selectedArticle?.draft;

  function decisionBadge(aid: string) {
    const d = decisions[aid];
    if (d === "adopted") return <Badge className="bg-green-500 text-white text-xs">採用</Badge>;
    if (d === "modified") return <Badge className="bg-yellow-500 text-white text-xs">修正</Badge>;
    if (d === "pending") return <Badge className="bg-gray-400 text-white text-xs">保留</Badge>;
    return null;
  }

  // ---------- メイン表示 ----------
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={"review" as StepId} />
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        {/* ヘッダー */}
        <div className="mb-4">
          <Badge variant="secondary" className="mb-2">ステップ 5 / 6</Badge>
          <h2 className="text-xl font-bold">改正案レビュー</h2>
        </div>

        {/* サマリーバー */}
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4 text-sm mb-2">
              <span>全 <strong>{articles.length}</strong> 件</span>
              <span className="text-red-600">法的必須: <strong>{counts.mandatory}</strong></span>
              <span className="text-blue-600">推奨: <strong>{counts.recommended}</strong></span>
              <span className="text-gray-500">任意: <strong>{counts.optional}</strong></span>
              <span className="ml-auto">完了: <strong>{decided}</strong> / {articles.length}</span>
            </div>
            <Progress value={pct} className="h-2" />
          </CardContent>
        </Card>

        {/* 一括操作バー */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTER_OPTIONS.map((o) => (
            <Button key={o.value} variant={filter === o.value ? "default" : "outline"} size="sm" onClick={() => setFilter(o.value)}>{o.label}</Button>
          ))}
          <span className="w-px h-6 bg-border mx-1" />
          {IMPORTANCE_FILTER_OPTIONS.map((o) => (
            <Button key={o.value} variant={importanceFilter === o.value ? "default" : "outline"} size="sm" onClick={() => setImportanceFilter(o.value)}>{o.label}</Button>
          ))}
          <span className="w-px h-6 bg-border mx-1" />
          <Button size="sm" variant="outline" onClick={handleApproveAllAi}>AI推奨を全て承認</Button>
          <Button size="sm" variant="outline" onClick={handleBulkAdopt} disabled={checkedIds.size === 0}>
            選択した項目を一括採用 ({checkedIds.size})
          </Button>
        </div>

        {/* テーブル */}
        <div className="overflow-x-auto border rounded-lg mb-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox" checked={filteredArticles.length > 0 && checkedIds.size === filteredArticles.length} onChange={handleToggleAll} className="rounded border-gray-300" />
                </th>
                <th className="p-2 text-left whitespace-nowrap">条番号</th>
                <th className="p-2 text-left whitespace-nowrap">カテゴリ</th>
                <th className="p-2 text-left">要約</th>
                <th className="p-2 text-center whitespace-nowrap">重要度</th>
                <th className="p-2 text-center whitespace-nowrap">AI推奨</th>
                <th className="p-2 text-center whitespace-nowrap">判断</th>
                <th className="p-2 text-center whitespace-nowrap">ドラフト</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">該当する項目はありません。</td></tr>
              ) : filteredArticles.map((a) => {
                const aid = a.id ?? "";
                const rec = getAiRec(a);
                const isSel = selectedId === aid;
                return (
                  <tr key={aid} className={`border-b cursor-pointer transition-colors hover:bg-muted/30 ${isSel ? "bg-primary/5" : ""}`}
                    onClick={() => { setSelectedId(isSel ? null : aid); setShowCurrentText(false); }}>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checkedIds.has(aid)} onChange={() => handleToggleCheck(aid)} className="rounded border-gray-300" />
                    </td>
                    <td className="p-2 whitespace-nowrap font-medium">{a.articleNum}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">{a.category}</td>
                    <td className="p-2 max-w-xs truncate">{a.summary}</td>
                    <td className="p-2 text-center">
                      <Badge className={`text-xs ${IMPORTANCE_STYLE[a.importance] ?? IMPORTANCE_STYLE.optional}`}>{IMPORTANCE_LABEL[a.importance] ?? "任意"}</Badge>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`text-base ${rec === "adopted" ? "text-green-600" : rec === "modified" ? "text-yellow-600" : "text-gray-400"}`}
                        title={rec === "adopted" ? "採用推奨" : rec === "modified" ? "要確認" : "保留推奨"}>{aiRecIcon(rec)}</span>
                    </td>
                    <td className="p-2 text-center">{decisionBadge(aid)}</td>
                    <td className="p-2 text-center">
                      {a.draft ? <span className="text-green-600" title="生成済み">{"\u2713"}</span> : <span className="text-gray-400" title="未生成">{"\u2212"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 詳細パネル（テーブル下に展開） */}
        {selectedArticle && (
          <Card className="mb-6">
            <CardContent className="pt-6 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedArticle.articleNum}{selectedArticle.category && `（${selectedArticle.category}）`}</span>
                <Badge className={IMPORTANCE_STYLE[selectedArticle.importance] ?? IMPORTANCE_STYLE.optional}>{IMPORTANCE_LABEL[selectedArticle.importance] ?? "任意"}</Badge>
              </div>
              {/* 要約 */}
              <div>
                <p className="text-sm font-medium mb-1">何が変わる？</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedArticle.summary}</p>
              </div>
              {/* 現行規約（折りたたみ） */}
              <div>
                <button onClick={() => setShowCurrentText(!showCurrentText)} className="text-sm font-medium flex items-center gap-1 mb-2">
                  現行規約テキスト {showCurrentText ? "\u25B2" : "\u25BC"}
                </button>
                {showCurrentText && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-xs font-medium text-red-700 mb-1">現行（変更前）</p>
                    <p className="text-sm text-red-900 whitespace-pre-line">{selectedArticle.original ?? "（規定なし）"}</p>
                  </div>
                )}
              </div>
              {/* AIドラフト */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">AI ドラフト</p>
                  {isDraftEdited && <Button variant="outline" size="sm" onClick={handleDraftSave} className="text-xs">編集を保存</Button>}
                </div>
                {selectedArticle.draft ? (
                  <textarea value={currentDraftText} onChange={(e) => handleDraftEdit(e.target.value)}
                    className="w-full text-sm p-3 border rounded-lg bg-blue-50 border-blue-100 text-blue-900 resize-none min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring" />
                ) : (
                  <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-sm text-muted-foreground">ドラフトが未生成です。下のボタンでAIにドラフトを生成させてください。</p>
                  </div>
                )}
                <Button onClick={handleGenerateDraft} disabled={isDraftLoading} variant="outline" size="sm" className="w-full mt-2">
                  {isDraftLoading ? (
                    <span className="flex items-center gap-2"><Spinner />{selectedArticle.draft ? "再生成中..." : "AIドラフト生成中..."}</span>
                  ) : selectedArticle.draft ? "AIドラフトを再生成" : "AIドラフト生成"}
                </Button>
                {draftError && <p className="text-xs text-red-600 mt-1">{draftError}</p>}
                {selectedArticle.baseRef && <p className="text-xs text-muted-foreground mt-1">出典: {selectedArticle.baseRef}</p>}
              </div>
              {/* 変更理由・解説 */}
              {selectedArticle.explanation && (
                <div>
                  <p className="text-sm font-medium mb-1">変更理由・解説</p>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedArticle.explanation}</p>
                  </div>
                </div>
              )}
              {/* 判断ボタン + メモ */}
              <div className="space-y-3 pt-2">
                <div className="flex gap-3">
                  {([{ value: "adopted" as Decision, label: "採用" }, { value: "modified" as Decision, label: "修正" }, { value: "pending" as Decision, label: "保留" }]).map((btn) => (
                    <Button key={btn.value} variant={decisions[selId] === btn.value ? "default" : "outline"}
                      onClick={() => handleDecision(selectedArticle, btn.value)} className="flex-1 min-h-[44px]">{btn.label}</Button>
                  ))}
                </div>
                <textarea placeholder="メモ（任意）" value={memos[selId] ?? ""} onChange={(e) => handleMemoChange(e.target.value)}
                  className="w-full text-sm p-3 border rounded-lg bg-background resize-none h-16" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 次のステップへ CTA */}
        {allDone && (
          <div className="text-center">
            <Button asChild size="lg" className="min-h-[44px]"><Link href="/export">次のステップへ</Link></Button>
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
