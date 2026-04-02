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
import { getReviewArticles, patchReviewArticle, decideReview, callDraftSingle, startAutoGenerate, deleteReviewArticlesApi, syncCurrentStep } from "@/shared/api-client";
import type { ReviewArticle } from "@/shared/db/types";
import type { GapAnalysisItem } from "@/domains/analysis/types";
import { useProjectStore, loadProjectId, loadGapResults, saveReviewDecisions, loadReviewDecisions, saveReviewMemos, loadReviewMemos, loadOnboarding } from "@/shared/store";
import { parseManagementDraft } from "@/shared/api-client";
import { AuthGuard } from "@/shared/auth/auth-guard";
import { ArticleDiffView } from "@/components/diff/article-diff-view";
import { SemanticNavigator } from "@/components/review/semantic-navigator";
import { PriorityDashboard } from "@/components/review/priority-dashboard";
import { TwoColumnView } from "@/components/review/two-column-view";
import { ThreeColumnView } from "@/components/review/three-column-view";
import { ArticleDecisionPanel } from "@/components/review/article-decision-panel";
import { CrossRefPanel } from "@/components/review/crossref-panel";
import { buildCrossRefGraph } from "@/domains/crossref/detector";

// ---------- 定数・ユーティリティ ----------
const IMPORTANCE_LABEL: Record<string, string> = { mandatory: "法的必須", recommended: "推奨", optional: "任意" };
const IMPORTANCE_STYLE: Record<string, string> = { mandatory: "bg-red-500 text-white", recommended: "bg-blue-500 text-white", optional: "bg-gray-400 text-white" };
const IMPORTANCE_ORDER: Record<string, number> = { mandatory: 0, recommended: 1, optional: 2 };

type Decision = "adopted" | "modified" | "keep-current" | "adopt-management" | "pending";
type FilterType = "all" | "undecided" | "adopted" | "modified" | "keep-current" | "pending";
type ImportanceFilter = "all" | "mandatory" | "recommended" | "optional";
type ViewMode = "table" | "dashboard";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "全て" }, { value: "undecided", label: "未決定" },
  { value: "adopted", label: "採用" }, { value: "keep-current", label: "現行維持" },
  { value: "modified", label: "修正" }, { value: "pending", label: "保留" },
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
const AI_REC_LABEL: Record<string, string> = { adopted: "採用推奨", modified: "要確認", pending: "保留推奨" };
const AI_REC_STYLE: Record<string, string> = { adopted: "bg-green-100 text-green-800", modified: "bg-yellow-100 text-yellow-800", pending: "bg-gray-100 text-gray-600" };
function extractNum(s: string): number {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}
/** ReviewEvent を構築 */
function buildEvent(decision: Decision, draft?: string) {
  if (decision === "adopted") return { type: "ADOPT" as const };
  if (decision === "keep-current") return { type: "KEEP_CURRENT" as const };
  if (decision === "adopt-management") return { type: "ADOPT_MANAGEMENT" as const };
  if (decision === "modified") return { type: "MODIFY" as const, newText: draft ?? "", reason: "レビュー画面で修正" };
  return { type: "RESET" as const };
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
  return <AuthGuard><ReviewPageContent /></AuthGuard>;
}

function ReviewPageContent() {
  const router = useRouter();
  const { user } = useAuth();

  const [articles, setArticles] = useState<ReviewArticle[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision | null>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [editedDrafts, setEditedDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [batchDraftPhase, setBatchDraftPhase] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [batchDraftProgress, setBatchDraftProgress] = useState(0);
  const [batchDraftTotal, setBatchDraftTotal] = useState(0);
  const batchDraftControllerRef = useRef<AbortController | null>(null);
  const initDone = useRef(false);
  const memoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [memoSaveStatus, setMemoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // 管理会社案アップロード
  const [mgmtDraftState, setMgmtDraftState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [mgmtDraftMessage, setMgmtDraftMessage] = useState("");

  // ---------- 初期化 ----------
  const gapToReview = useCallback(
    (items: GapAnalysisItem[], pid: string): ReviewArticle[] =>
      items.map((item) => ({
        id: item.articleNum, projectId: pid, chapter: 0, articleNum: item.articleNum,
        original: item.currentText, draft: "", summary: item.gapSummary, explanation: item.rationale,
        importance: item.importance, baseRef: item.standardRef, decision: null,
        modificationHistory: [], memo: "", category: item.category,
        // 分類情報をパススルー
        gapType: item.gapType,
        relatedLawRefs: item.relatedLawRefs,
        semanticGroup: item.semanticGroup,
        secondaryGroups: item.secondaryGroups,
        standardArticleNum: item.standardArticleNum,
        detailedBackground: item.detailedBackground,
        issueGroup: item.issueGroup,
      })),
    [],
  );

  const initialize = useCallback(async () => {
    try {
      const pid = loadProjectId() ?? "default";
      let fetched: ReviewArticle[] = (await getReviewArticles(pid)).articles ?? [];
      const fromFirestore = fetched.length > 0;

      if (!fromFirestore) {
        // Firestore にデータがない場合のみ sessionStorage をフォールバック
        const gap = loadGapResults();
        if (gap && gap.length > 0) fetched = gapToReview(gap, pid);
        else { router.push("/analysis"); return; }
      }
      setArticles(fetched);

      // Firestore から取得した場合は Firestore の decision/memo を正とする
      // sessionStorage はフォールバック（Firestore が空の場合）でのみ使用
      if (fromFirestore) {
        const initD: Record<string, Decision> = {};
        const initM: Record<string, string> = {};
        for (const a of fetched) {
          if (a.id && a.decision) initD[a.id] = a.decision;
          if (a.id && a.memo) initM[a.id] = a.memo;
        }
        setDecisions(initD);
        saveReviewDecisions(initD);
        setMemos(initM);
        saveReviewMemos(initM);
      } else {
        const sd = loadReviewDecisions();
        if (sd && Object.keys(sd).length > 0) { setDecisions(sd); }
        const sm = loadReviewMemos();
        if (sm && Object.keys(sm).length > 0) { setMemos(sm); }
      }
      setPhase("ready");
      // レビュー画面到達 → step=4 を記録
      if (pid && pid !== "default") syncCurrentStep(pid, 4);
    } catch (err) {
      console.error("レビューデータの読み込みに失敗:", err);
      setErrorMessage(err instanceof Error ? err.message : "データの読み込みに失敗しました");
      setPhase("error");
    }
  }, [router, gapToReview]);

  useEffect(() => { if (initDone.current) return; initDone.current = true; initialize(); }, [initialize]);

  // クリーンアップ: 一括ドラフト生成の SSE を中断
  useEffect(() => {
    return () => { batchDraftControllerRef.current?.abort(); };
  }, []);

  // ---------- ソート・フィルタリング ----------
  const sortedArticles = useMemo(() =>
    [...articles].sort((a, b) => {
      const d = (IMPORTANCE_ORDER[a.importance] ?? 2) - (IMPORTANCE_ORDER[b.importance] ?? 2);
      return d !== 0 ? d : extractNum(a.articleNum) - extractNum(b.articleNum);
    }), [articles]);

  // 一意なカテゴリ一覧（フィルタ用）
  const categories = useMemo(() => {
    const cats = new Set(articles.map((a) => a.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [articles]);

  const filteredArticles = useMemo(() =>
    sortedArticles.filter((a) => {
      const aid = a.id ?? "";
      if (filter === "undecided" && decisions[aid]) return false;
      if (filter !== "all" && filter !== "undecided" && decisions[aid] !== filter) return false;
      if (importanceFilter !== "all" && a.importance !== importanceFilter) return false;
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      // 意味グループフィルタ
      if (selectedGroup !== null && a.semanticGroup !== selectedGroup) return false;
      return true;
    }), [sortedArticles, filter, importanceFilter, categoryFilter, selectedGroup, decisions]);

  // 統計
  const decided = Object.values(decisions).filter(Boolean).length;
  const pct = articles.length > 0 ? (decided / articles.length) * 100 : 0;
  const counts = { mandatory: 0, recommended: 0, optional: 0 };
  for (const a of articles) counts[a.importance]++;
  const allDone = articles.length > 0 && decided === articles.length;
  const selectedArticle = selectedId ? articles.find((a) => a.id === selectedId) ?? null : null;

  // 相互参照グラフ
  const crossRefGraph = useMemo(() => {
    if (articles.length === 0) return null;
    const graphArticles = articles.map((a) => ({
      articleNum: a.articleNum,
      text: a.draft || a.original || "",
    }));
    return buildCrossRefGraph(graphArticles);
  }, [articles]);

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
    const articleNum = selectedArticle.articleNum;
    const next = { ...memos, [selectedArticle.id]: value };
    setMemos(next); saveReviewMemos(next);

    // デバウンス付き Firestore 保存（1秒後に実行）
    if (memoDebounceRef.current) clearTimeout(memoDebounceRef.current);
    setMemoSaveStatus("saving");
    memoDebounceRef.current = setTimeout(async () => {
      const pid = loadProjectId();
      if (!pid) return;
      try {
        await patchReviewArticle(pid, { articleNum, memo: value });
        setMemoSaveStatus("saved");
        setTimeout(() => setMemoSaveStatus("idle"), 2000);
      } catch {
        setMemoSaveStatus("error");
      }
    }, 1000);
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

  // undrafted count
  const undraftedCount = useMemo(() => articles.filter((a) => !a.draft || a.draft.trim() === "").length, [articles]);

  async function handleBatchDraftGenerate() {
    const pid = loadProjectId();
    if (!pid || undraftedCount === 0) return;
    setBatchDraftPhase("generating");
    setBatchDraftProgress(0);
    setBatchDraftTotal(0);

    const onboarding = loadOnboarding();
    const condoContext = {
      condoName: onboarding?.condoName ?? "マンション",
      condoType: (onboarding?.isCorporate ?? "unknown") as "corporate" | "non-corporate" | "unknown",
      unitCount: (onboarding?.unitCount ?? "medium") as "small" | "medium" | "large" | "xlarge",
    };

    const controller = startAutoGenerate(pid, "smart", condoContext, {
      onProgress: (data) => {
        setBatchDraftProgress(data.current);
        setBatchDraftTotal(data.total);
      },
      onComplete: async () => {
        try {
          const { articles: refreshed } = await getReviewArticles(pid);
          setArticles(refreshed);
        } catch (err) {
          console.error("一括生成後のデータ再取得に失敗:", err);
        }
        setBatchDraftPhase("done");
      },
      onError: (msg) => {
        console.error("一括ドラフト生成エラー:", msg);
        setBatchDraftPhase("error");
      },
    });
    batchDraftControllerRef.current = controller;
  }

  async function handleDeleteSelected() {
    if (checkedIds.size === 0) return;
    const targets = articles.filter((a) => a.id && checkedIds.has(a.id));
    const names = targets.map((a) => a.articleNum).join("、");
    if (!confirm(`以下の ${targets.length} 件をレビューから完全に削除します。\n\n${names}\n\nこの操作は取り消せません。よろしいですか？`)) return;

    const pid = loadProjectId();
    if (!pid) return;
    try {
      await deleteReviewArticlesApi(pid, targets.map((a) => a.articleNum));
      setArticles((prev) => prev.filter((a) => !checkedIds.has(a.id ?? "")));
      // decisions/memos からも除去
      const nextD = { ...decisions };
      const nextM = { ...memos };
      for (const id of checkedIds) { delete nextD[id]; delete nextM[id]; }
      setDecisions(nextD);
      setMemos(nextM);
      saveReviewDecisions(nextD);
      saveReviewMemos(nextM);
      setCheckedIds(new Set());
      setSelectedId(null);
    } catch (err) {
      console.error("条文の削除に失敗:", err);
      alert("削除に失敗しました: " + (err instanceof Error ? err.message : "不明なエラー"));
    }
  }

  /** 管理会社案アップロード */
  const handleManagementDraftFile = useCallback(async (f: File) => {
    const pid = loadProjectId();
    if (!pid) return;
    setMgmtDraftState("uploading");
    setMgmtDraftMessage("");
    parseManagementDraft(pid, { file: f }, {
      onProgress: (data) => {
        setMgmtDraftMessage(data.message ?? "解析中…");
      },
      onComplete: async (data) => {
        setMgmtDraftState("done");
        setMgmtDraftMessage(`${data.matched ?? 0}/${data.totalParsed ?? 0} 条文をマッチング完了`);
        // データを再取得して managementDraft を反映
        try {
          const fetched = (await getReviewArticles(pid)).articles ?? [];
          if (fetched.length > 0) setArticles(fetched);
        } catch (err) {
          console.error("管理会社案反映後のデータ再取得に失敗:", err);
        }
      },
      onError: (msg) => {
        setMgmtDraftState("error");
        setMgmtDraftMessage(msg || "管理会社案のパースに失敗しました");
      },
    });
  }, []);

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
              <p className="text-base text-muted-foreground">レビューデータを準備中...</p>
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
              <p className="text-base text-red-600">{errorMessage}</p>
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
    if (d === "adopted") return <Badge className="bg-green-500 text-white text-sm">採用</Badge>;
    if (d === "keep-current") return <Badge className="bg-gray-100 text-gray-800 border-gray-300 text-sm">現行維持</Badge>;
    if (d === "adopt-management") return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-sm">管理会社案</Badge>;
    if (d === "modified") return <Badge className="bg-yellow-500 text-white text-sm">修正</Badge>;
    if (d === "pending") return <Badge className="bg-gray-400 text-white text-sm">保留</Badge>;
    return null;
  }

  // ---------- メイン表示 ----------
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={"review" as StepId} />
      <div className="flex-1 flex">
        {/* 左サイドバー: 意味グループナビゲーション（デスクトップのみ） */}
        <aside className="hidden lg:block w-64 shrink-0 border-r bg-muted/20 p-3 overflow-y-auto">
          <SemanticNavigator
            articles={articles}
            selectedArticleNum={selectedArticle?.articleNum}
            onArticleClick={(articleNum) => {
              const a = articles.find((art) => art.articleNum === articleNum);
              if (a?.id) setSelectedId(a.id);
            }}
            selectedGroup={selectedGroup}
            onGroupSelect={setSelectedGroup}
          />
        </aside>

        <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full overflow-y-auto">
        {/* ヘッダー + ビューモード切替 */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Badge variant="secondary" className="mb-2">ステップ 5 / 6</Badge>
            <h2 className="text-xl font-bold">改正案レビュー</h2>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={viewMode === "table" ? "default" : "outline"}
              onClick={() => setViewMode("table")}
            >
              一覧
            </Button>
            <Button
              size="sm"
              variant={viewMode === "dashboard" ? "default" : "outline"}
              onClick={() => setViewMode("dashboard")}
            >
              ダッシュボード
            </Button>
          </div>
        </div>

        {/* サマリーバー */}
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4 text-sm mb-2">
              <span>全 <strong>{articles.length}</strong> 件</span>
              <span className="text-red-600">法的必須: <strong>{counts.mandatory}</strong></span>
              <span className="text-blue-600">推奨: <strong>{counts.recommended}</strong></span>
              <span className="text-gray-500">任意: <strong>{counts.optional}</strong></span>
              {undraftedCount > 0 && (
                <span className="text-amber-600">ドラフト未生成: <strong>{undraftedCount}</strong></span>
              )}
              <span className="ml-auto">完了: <strong>{decided}</strong> / {articles.length}</span>
            </div>
            <Progress value={pct} className="h-2" aria-label="レビュー進捗" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} />
          </CardContent>
        </Card>

        {/* ダッシュボードモード */}
        {viewMode === "dashboard" && (
          <PriorityDashboard
            articles={articles}
            onGroupClick={(groupId) => {
              setSelectedGroup(groupId);
              setViewMode("table");
            }}
          />
        )}

        {/* 一覧モード */}
        {viewMode === "table" && (<>
        {/* フィルタバー */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {FILTER_OPTIONS.map((o) => (
            <Button key={o.value} variant={filter === o.value ? "default" : "outline"} size="sm" aria-pressed={filter === o.value} onClick={() => setFilter(o.value)}>{o.label}</Button>
          ))}
          <span className="w-px h-6 bg-border mx-1 hidden sm:block" />
          {IMPORTANCE_FILTER_OPTIONS.map((o) => (
            <Button key={o.value} variant={importanceFilter === o.value ? "default" : "outline"} size="sm" aria-pressed={importanceFilter === o.value} onClick={() => setImportanceFilter(o.value)}>{o.label}</Button>
          ))}
          {categories.length > 1 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border rounded-md px-2 py-1.5 bg-background"
            >
              <option value="all">全カテゴリ</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>
        {/* 一括操作バー（フィルタと分離） */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={handleApproveAllAi}>AI推奨を全て承認</Button>
          <Button size="sm" variant="outline" onClick={handleBulkAdopt} disabled={checkedIds.size === 0}>
            一括採用 ({checkedIds.size})
          </Button>
          <Button
            size="sm"
            variant={undraftedCount > 0 ? "default" : "outline"}
            onClick={handleBatchDraftGenerate}
            disabled={batchDraftPhase === "generating" || undraftedCount === 0}
          >
            {batchDraftPhase === "generating"
              ? `生成中 (${batchDraftProgress}/${batchDraftTotal})`
              : undraftedCount > 0
                ? `一括生成 (${undraftedCount}件)`
                : "全生成済み"}
          </Button>
          {/* 管理会社案アップロード */}
          {mgmtDraftState === "idle" && (
            <>
              <Button size="sm" variant="outline" onClick={() => document.getElementById("mgmt-draft-input")?.click()}>
                管理会社案をアップロード
              </Button>
              <input
                id="mgmt-draft-input"
                type="file"
                accept=".txt,.pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleManagementDraftFile(f);
                }}
              />
            </>
          )}
          {mgmtDraftState === "uploading" && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> {mgmtDraftMessage}
            </span>
          )}
          {mgmtDraftState === "done" && (
            <span className="text-sm text-green-700">{mgmtDraftMessage}</span>
          )}
          {mgmtDraftState === "error" && (
            <span className="inline-flex items-center gap-2">
              <span className="text-sm text-red-600">{mgmtDraftMessage}</span>
              <Button size="sm" variant="ghost" onClick={() => setMgmtDraftState("idle")}>再試行</Button>
            </span>
          )}
          <span className="flex-1" />
          <Button size="sm" variant="destructive" onClick={handleDeleteSelected} disabled={checkedIds.size === 0}>
            削除 ({checkedIds.size})
          </Button>
        </div>

        {/* モバイルカードリスト */}
        <div className="lg:hidden space-y-2 mb-4">
          {filteredArticles.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">該当する項目はありません。</p>
          ) : filteredArticles.map((a) => {
            const aid = a.id ?? "";
            const rec = getAiRec(a);
            const isSel = selectedId === aid;
            return (
              <Card key={aid} className={`cursor-pointer transition-colors ${isSel ? "ring-2 ring-primary/30" : ""}`}
                onClick={() => { setSelectedId(isSel ? null : aid); }}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={checkedIds.has(aid)} onChange={() => handleToggleCheck(aid)}
                        onClick={(e) => e.stopPropagation()} className="rounded border-gray-300 shrink-0" />
                      <span className="font-medium text-sm">{a.articleNum}</span>
                      <Badge className={`text-sm shrink-0 ${IMPORTANCE_STYLE[a.importance] ?? IMPORTANCE_STYLE.optional}`}>
                        {IMPORTANCE_LABEL[a.importance] ?? "任意"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-sm px-1.5 py-0.5 rounded-full ${AI_REC_STYLE[rec] ?? AI_REC_STYLE.pending}`}>
                        {AI_REC_LABEL[rec] ?? "保留推奨"}
                      </span>
                      {decisionBadge(aid)}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p>
                  {a.category && <p className="text-sm text-muted-foreground mt-1">{a.category}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* デスクトップテーブル */}
        <div className="hidden lg:block overflow-x-auto border rounded-lg mb-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th scope="col" className="p-2 w-8">
                  <input type="checkbox" checked={filteredArticles.length > 0 && checkedIds.size === filteredArticles.length} onChange={handleToggleAll} className="rounded border-gray-300" aria-label="全て選択" />
                </th>
                <th scope="col" className="p-2 text-left whitespace-nowrap">条番号</th>
                <th scope="col" className="p-2 text-left whitespace-nowrap">カテゴリ</th>
                <th scope="col" className="p-2 text-left">要約</th>
                <th scope="col" className="p-2 text-center whitespace-nowrap">重要度</th>
                <th scope="col" className="p-2 text-center whitespace-nowrap">AI推奨</th>
                <th scope="col" className="p-2 text-center whitespace-nowrap">判断</th>
                <th scope="col" className="p-2 text-center whitespace-nowrap">ドラフト</th>
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
                    onClick={() => { setSelectedId(isSel ? null : aid); }}>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checkedIds.has(aid)} onChange={() => handleToggleCheck(aid)} className="rounded border-gray-300" />
                    </td>
                    <td className="p-2 whitespace-nowrap font-medium">{a.articleNum}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">{a.category}</td>
                    <td className="p-2 max-w-xs truncate">{a.summary}</td>
                    <td className="p-2 text-center">
                      <Badge className={`text-sm ${IMPORTANCE_STYLE[a.importance] ?? IMPORTANCE_STYLE.optional}`}>{IMPORTANCE_LABEL[a.importance] ?? "任意"}</Badge>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`inline-block text-sm px-1.5 py-0.5 rounded-full ${AI_REC_STYLE[rec] ?? AI_REC_STYLE.pending}`}>
                        {aiRecIcon(rec)} {AI_REC_LABEL[rec] ?? "保留推奨"}
                      </span>
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
              {/* 比較ビュー: 管理会社案あり→3カラム、改正案のみ→2カラム、なし→従来 */}
              {selectedArticle.reformText && selectedArticle.managementDraft ? (
                <ThreeColumnView
                  original={selectedArticle.original}
                  managementDraft={selectedArticle.managementDraft}
                  reformText={selectedArticle.reformText}
                  semanticGroup={selectedArticle.semanticGroup}
                  issueGroup={selectedArticle.issueGroup}
                  detailedBackground={selectedArticle.detailedBackground}
                  impactOnResidents={selectedArticle.impactOnResidents}
                  riskIfUnchanged={selectedArticle.riskIfUnchanged}
                  transitionalMeasure={selectedArticle.transitionalMeasure}
                />
              ) : selectedArticle.reformText ? (
                <TwoColumnView
                  original={selectedArticle.original}
                  reformText={selectedArticle.reformText}
                  semanticGroup={selectedArticle.semanticGroup}
                  issueGroup={selectedArticle.issueGroup}
                  detailedBackground={selectedArticle.detailedBackground}
                  impactOnResidents={selectedArticle.impactOnResidents}
                  riskIfUnchanged={selectedArticle.riskIfUnchanged}
                  transitionalMeasure={selectedArticle.transitionalMeasure}
                />
              ) : (
                /* フォールバック: 従来の差分ビュー */
                <ArticleDiffView
                  original={selectedArticle.original}
                  draft={currentDraftText}
                  onDraftEdit={handleDraftEdit}
                  onDraftSave={handleDraftSave}
                  isDraftEdited={isDraftEdited}
                  onGenerateDraft={handleGenerateDraft}
                  isDraftLoading={isDraftLoading}
                  draftError={draftError}
                  baseRef={selectedArticle.baseRef}
                  hasDraft={!!selectedArticle.draft}
                />
              )}
              {/* 変更理由・解説 */}
              {selectedArticle.explanation && (
                <div>
                  <p className="text-sm font-medium mb-1">変更理由・解説</p>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedArticle.explanation}</p>
                  </div>
                </div>
              )}
              {/* 判断支援情報（TwoColumnView に含まれない場合のフォールバック） */}
              {!selectedArticle.reformText && (selectedArticle.impactOnResidents || selectedArticle.riskIfUnchanged || selectedArticle.transitionalMeasure || selectedArticle.standardRuleComparison || (selectedArticle.relatedLawRefs && selectedArticle.relatedLawRefs.length > 0)) && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-semibold">判断支援情報</p>
                  {selectedArticle.impactOnResidents && (
                    <div>
                      <p className="text-sm font-medium text-blue-700 mb-0.5">住民生活への影響</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{selectedArticle.impactOnResidents}</p>
                    </div>
                  )}
                  {selectedArticle.riskIfUnchanged && (
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-0.5">変更しなかった場合のリスク</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{selectedArticle.riskIfUnchanged}</p>
                    </div>
                  )}
                  {selectedArticle.transitionalMeasure && (
                    <div>
                      <p className="text-sm font-medium text-amber-700 mb-0.5">経過措置</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{selectedArticle.transitionalMeasure}</p>
                    </div>
                  )}
                  {selectedArticle.standardRuleComparison && (
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-0.5">標準管理規約との対比</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{selectedArticle.standardRuleComparison}</p>
                    </div>
                  )}
                  {selectedArticle.relatedLawRefs && selectedArticle.relatedLawRefs.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-purple-700 mb-0.5">根拠法令</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedArticle.relatedLawRefs.map((ref, i) => (
                          <Badge key={i} variant="outline" className="text-sm">{ref}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* 相互参照パネル */}
              {crossRefGraph && (
                <CrossRefPanel
                  articleNum={selectedArticle.articleNum}
                  graph={crossRefGraph}
                  onArticleClick={(articleNum) => {
                    const a = articles.find((art) => art.articleNum === articleNum);
                    if (a?.id) setSelectedId(a.id);
                  }}
                />
              )}
              {/* 判断パネル（採用/現行維持/修正/保留） */}
              <ArticleDecisionPanel
                decision={(decisions[selId] ?? null) as import("@/components/review/article-decision-panel").ArticleDecision}
                onDecide={(d) => {
                  if (d === null) return;
                  handleDecision(selectedArticle, d as Decision);
                }}
                hasReformText={!!(selectedArticle.reformText || selectedArticle.draft)}
                hasOriginal={!!selectedArticle.original}
                hasManagementDraft={!!selectedArticle.managementDraft}
                memo={memos[selId] ?? ""}
                onMemoChange={handleMemoChange}
              />
              {memoSaveStatus !== "idle" && (
                <span className={`text-sm ${memoSaveStatus === "saving" ? "text-muted-foreground" : memoSaveStatus === "saved" ? "text-green-600" : "text-red-500"}`}>
                  {memoSaveStatus === "saving" ? "保存中..." : memoSaveStatus === "saved" ? "保存済み" : "保存失敗"}
                </span>
              )}
            </CardContent>
          </Card>
        )}

        </>)}
        {/* viewMode === "table" の閉じ */}

        {/* 次のステップへ CTA */}
        {articles.length > 0 && (
          <Card className="bg-muted/50">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
              <div>
                {allDone ? (
                  <p className="font-medium text-green-700">全 {articles.length} 件の判断が完了しました</p>
                ) : (
                  <>
                    <p className="font-medium">
                      {decided} / {articles.length} 件の判断が完了（残り {articles.length - decided} 件）
                    </p>
                    <p className="text-base text-muted-foreground mt-1">
                      未決定の項目がある場合でもエクスポートできます。
                      「AI推奨を全て承認」で残りを一括設定することもできます。
                    </p>
                  </>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {!allDone && (
                  <Button variant="outline" size="lg" onClick={handleApproveAllAi} data-test="review-approve-all">
                    AI推奨を全て承認
                  </Button>
                )}
                <Button asChild size="lg" data-test="review-next">
                  <Link href="/export">エクスポートへ</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      </div>
      <AppFooter />
    </div>
  );
}
