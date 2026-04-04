/**
 * API クライアント
 *
 * バックエンド API Routes との通信を一元管理する。
 * SSE 系の関数は fetch + ReadableStream パターンで POST をサポートし、
 * AbortController を返して呼び出し側でキャンセル可能にする。
 */

import type { ParseResult } from "@/domains/ingestion/types";
import type { AnalysisResult } from "@/domains/analysis/types";
import type {
  DraftResult,
  CondoContext,
  BatchDraftResult,
} from "@/domains/drafting/types";
import type { ReviewEvent, ReviewProgress } from "@/domains/review/types";
import type { ChatMessage, ChatResponse } from "@/domains/chat/types";
import type { ReviewArticle, Project } from "@/shared/db/types";
// clearSession は API エラー時に自動呼び出ししない（セッション全消去は過剰）
import { getFirebaseAuth, isFirebaseConfigured } from "@/shared/db/firestore";

// ---------- 共通ヘルパー ----------

/**
 * Firebase Auth の ID トークンを取得する
 *
 * ログイン済みの場合は Bearer トークンを返す。
 * 未ログイン or Firebase 未設定時は undefined を返す。
 */
async function getAuthToken(): Promise<string | undefined> {
  if (!isFirebaseConfigured) return undefined;
  try {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return undefined;
    const token = await user.getIdToken();
    return token;
  } catch {
    return undefined;
  }
}

/**
 * 認証ヘッダーを含むヘッダーオブジェクトを構築する
 */
async function authHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * レスポンスの共通エラーハンドリング
 *
 * エラーメッセージを throw する。セッションのクリアは行わない
 * （ユーザーの明示的操作でのみリセットする）。
 */
async function handleResponseError(
  res: Response,
  fallbackMessage: string,
): Promise<never> {
  const err = await res.json().catch(() => ({}));
  throw new Error(
    (err as { error?: string }).error ?? fallbackMessage,
  );
}

/**
 * SSE イベントストリームをパースし、コールバックを呼び出す汎用ヘルパー
 *
 * fetch + ReadableStream パターンで SSE を受信する。
 * POST メソッドをサポートするために EventSource ではなく fetch を使用。
 *
 * @returns 終端イベント（complete / error）を受信した場合 true
 */
async function consumeSSE(
  response: Response,
  handlers: Record<string, (data: unknown) => void>,
): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("ストリームの読み取りに失敗しました");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let receivedTerminal = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE フォーマット: "event: <name>\ndata: <json>\n\n"
    const parts = buffer.split("\n\n");
    // 最後の要素は不完全な可能性があるのでバッファに残す
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      let eventName = "message";
      let dataStr = "";

      for (const line of trimmed.split("\n")) {
        if (line.startsWith("event: ")) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          dataStr = line.slice(6).trim();
        }
      }

      if (!dataStr) continue;

      if (eventName === "complete" || eventName === "error" || eventName === "done") {
        receivedTerminal = true;
      }

      try {
        const data = JSON.parse(dataStr);
        const handler = handlers[eventName];
        if (handler) {
          handler(data);
        }
      } catch {
        // JSON パース失敗 — スキップ
      }
    }
  }

  return receivedTerminal;
}

// ========== Ingestion ==========

/**
 * POST /api/ingestion/parse
 * テキスト形式の管理規約をパースして構造化データに変換する
 */
export async function callParse(text: string): Promise<ParseResult> {
  const res = await fetch("/api/ingestion/parse", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) await handleResponseError(res, "パースに失敗しました");
  return res.json();
}

/**
 * POST /api/ingestion/parse-file
 * PDF / Word / テキストファイルをアップロードしてパースする
 */
export async function callParseFile(file: File): Promise<ParseResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/ingestion/parse-file", {
    method: "POST",
    headers: await authHeaders(),
    body: formData,
  });
  if (!res.ok) await handleResponseError(res, "ファイルのパースに失敗しました");
  return res.json();
}

// ========== Analysis ==========

/** Analysis SSE のコールバック */
interface AnalysisCallbacks {
  onProgress?: (data: {
    current: number;
    total: number;
    articleNum: string;
  }) => void;
  onComplete?: (data: AnalysisResult) => void;
  onError?: (message: string) => void;
}

/**
 * POST /api/analysis/start (SSE)
 * ギャップ分析を開始し、SSE で進捗を通知する
 */
export function startAnalysis(
  projectId: string,
  articles: Array<{
    articleNum: string;
    category: string;
    currentText: string | null;
  }>,
  callbacks: AnalysisCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const reqBody = { projectId, articles };
      console.log("[startAnalysis] POST /api/analysis/start", {
        projectId,
        articleCount: articles.length,
        firstArticle: articles[0],
      });

      const res = await fetch("/api/analysis/start", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[startAnalysis] API エラー", {
          status: res.status,
          statusText: res.statusText,
          error: err,
          projectId,
        });
        callbacks.onError?.(
          (err as { error?: string }).error ?? `分析の開始に失敗しました (${res.status})`,
        );
        return;
      }

      const terminated = await consumeSSE(res, {
        progress: (data) => {
          callbacks.onProgress?.(
            data as { current: number; total: number; articleNum: string },
          );
        },
        complete: (data) => {
          callbacks.onComplete?.(data as AnalysisResult);
        },
        error: (data) => {
          callbacks.onError?.((data as { message: string }).message);
        },
      });

      // SSE 接続が complete/error なしに切れた場合のフォールバック
      if (!terminated) {
        callbacks.onError?.(
          "サーバーとの接続が切れました。処理は完了している可能性があります。ページを再読み込みしてください。",
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError?.(
        err instanceof Error
          ? err.message
          : "分析中に通信エラーが発生しました",
      );
    }
  })();

  return controller;
}

/** Unified Analysis SSE のコールバック */
interface UnifiedAnalysisCallbacks {
  onProgress?: (data: {
    phase: string;
    current: number;
    total: number;
    message: string;
  }) => void;
  onComplete?: (data: AnalysisResult & { reformGenerated: number }) => void;
  onError?: (message: string) => void;
}

/**
 * POST /api/analysis/unified-start (SSE)
 * 統合分析（意味分類 → ギャップ分析 → 改正案生成）を開始する
 */
export function startUnifiedAnalysis(
  projectId: string,
  articles: Array<{
    articleNum: string;
    category: string;
    currentText: string | null;
  }>,
  callbacks: UnifiedAnalysisCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/analysis/unified-start", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ projectId, articles }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // 404 でもセッションはクリアしない（エラー表示のみ）
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(
          (err as { error?: string }).error ?? "統合分析の開始に失敗しました",
        );
        return;
      }

      const terminated = await consumeSSE(res, {
        progress: (data) => {
          callbacks.onProgress?.(
            data as { phase: string; current: number; total: number; message: string },
          );
        },
        complete: (data) => {
          callbacks.onComplete?.(data as AnalysisResult & { reformGenerated: number });
        },
        error: (data) => {
          callbacks.onError?.((data as { message: string }).message);
        },
      });

      if (!terminated) {
        callbacks.onError?.(
          "サーバーとの接続が切れました。ページを再読み込みしてください。",
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError?.(
        err instanceof Error
          ? err.message
          : "統合分析中に通信エラーが発生しました",
      );
    }
  })();

  return controller;
}

/**
 * GET /api/analysis/[projectId]
 * プロジェクトの分析結果（レビュー記事一覧）を取得する
 */
export async function getAnalysisResult(
  projectId: string,
): Promise<ReviewArticle[]> {
  const res = await fetch(
    `/api/analysis/${encodeURIComponent(projectId)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) await handleResponseError(res, "分析結果の取得に失敗しました");
  return res.json();
}

// ========== Drafting ==========

/** ドラフト生成対象の条文データ（standardText はサーバー側でリトリーバーから取得） */
export interface DraftItem {
  articleNum: string;
  category: string;
  currentText: string | null;
  gapSummary: string;
  importance: "mandatory" | "recommended" | "optional";
}

/** Drafting SSE のコールバック */
interface DraftingCallbacks {
  onProgress?: (data: {
    current: number;
    total: number;
    articleNum: string;
  }) => void;
  onComplete?: (data: BatchDraftResult) => void;
  onError?: (message: string) => void;
}

/** 自動ドラフト生成 SSE のコールバック */
interface AutoDraftCallbacks {
  onProgress?: (data: {
    current: number;
    total: number;
    articleNum: string;
    phase: "retrieval" | "generation" | "retry";
  }) => void;
  onComplete?: (data: BatchDraftResult) => void;
  onError?: (message: string) => void;
}

/**
 * POST /api/drafting/auto-generate (SSE)
 * 分析完了後に自動でドラフトを一括生成する
 */
export function startAutoGenerate(
  projectId: string,
  mode: "smart" | "precise",
  condoContext: CondoContext,
  callbacks: AutoDraftCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      console.log("[autoGenerate] POST /api/drafting/auto-generate", {
        projectId,
        mode,
        condoContext,
      });

      const res = await fetch("/api/drafting/auto-generate", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ projectId, mode, condoContext }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[autoGenerate] API エラー", {
          status: res.status,
          statusText: res.statusText,
          error: err,
          projectId,
          mode,
          condoContext,
        });
        callbacks.onError?.(
          (err as { error?: string }).error ??
            `ドラフト自動生成の開始に失敗しました (${res.status})`,
        );
        return;
      }

      const terminated = await consumeSSE(res, {
        progress: (data) => {
          callbacks.onProgress?.(
            data as { current: number; total: number; articleNum: string; phase: "retrieval" | "generation" | "retry" },
          );
        },
        complete: (data) => {
          callbacks.onComplete?.(data as BatchDraftResult);
        },
        error: (data) => {
          callbacks.onError?.((data as { message: string }).message);
        },
      });

      if (!terminated) {
        callbacks.onError?.(
          "サーバーとの接続が切れました。処理は完了している可能性があります。ページを再読み込みしてください。",
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError?.(
        err instanceof Error
          ? err.message
          : "ドラフト生成中に通信エラーが発生しました",
      );
    }
  })();

  return controller;
}

/**
 * POST /api/drafting/generate (SSE)
 * 複数条文のドラフトを一括生成し、SSE で進捗を通知する
 */
export function startDrafting(
  projectId: string,
  items: DraftItem[],
  condoContext: CondoContext,
  callbacks: DraftingCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/drafting/generate", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ projectId, items, condoContext }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // 404 でもセッションはクリアしない（エラー表示のみ）
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(
          (err as { error?: string }).error ??
            "ドラフト生成の開始に失敗しました",
        );
        return;
      }

      const terminated = await consumeSSE(res, {
        progress: (data) => {
          callbacks.onProgress?.(
            data as { current: number; total: number; articleNum: string },
          );
        },
        complete: (data) => {
          callbacks.onComplete?.(data as BatchDraftResult);
        },
        error: (data) => {
          callbacks.onError?.((data as { message: string }).message);
        },
      });

      if (!terminated) {
        callbacks.onError?.(
          "サーバーとの接続が切れました。処理は完了している可能性があります。ページを再読み込みしてください。",
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError?.(
        err instanceof Error
          ? err.message
          : "ドラフト生成中に通信エラーが発生しました",
      );
    }
  })();

  return controller;
}

/** 単一ドラフト生成リクエスト（standardText はサーバー側で取得） */
export interface SingleDraftRequest {
  articleNum: string;
  category: string;
  currentText: string | null;
  gapSummary: string;
  importance: "mandatory" | "recommended" | "optional";
  condoContext: CondoContext;
}

/**
 * POST /api/drafting/single
 * 単一条文のドラフトを再生成する
 */
export async function callDraftSingle(
  request: SingleDraftRequest,
): Promise<DraftResult> {
  const res = await fetch("/api/drafting/single", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(request),
  });
  if (!res.ok) await handleResponseError(res, "ドラフト生成に失敗しました");
  return res.json();
}

// ========== Chat ==========

/** チャットリクエストボディ */
export interface ChatRequestBody {
  projectId: string;
  message: string;
  history: ChatMessage[];
}

/**
 * POST /api/chat
 * チャット応答を生成する（非ストリーミング）
 */
export async function callChat(
  request: ChatRequestBody,
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(request),
  });
  if (!res.ok) await handleResponseError(res, "チャットに失敗しました");
  return res.json();
}

/** Chat Stream のコールバック */
interface ChatStreamCallbacks {
  onThinking?: (data: { status: string }) => void;
  onMessage?: (data: ChatResponse) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/**
 * POST /api/chat/stream (SSE)
 * チャット応答をストリーミングで受信する
 */
export function streamChat(
  projectId: string,
  message: string,
  history: ChatMessage[],
  callbacks: ChatStreamCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ projectId, message, history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // 404 でもセッションはクリアしない（エラー表示のみ）
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(
          (err as { error?: string }).error ?? "AIに接続できませんでした",
        );
        return;
      }

      await consumeSSE(res, {
        thinking: (data) => {
          callbacks.onThinking?.(data as { status: string });
        },
        message: (data) => {
          callbacks.onMessage?.(data as ChatResponse);
        },
        done: () => {
          callbacks.onDone?.();
        },
        error: (data) => {
          callbacks.onError?.((data as { message: string }).message);
        },
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError?.(
        err instanceof Error
          ? err.message
          : "チャット中に通信エラーが発生しました",
      );
    }
  })();

  return controller;
}

// ========== Export ==========

/** エクスポートリクエスト */
export interface ExportRequest {
  projectId: string;
  condoName: string;
  format: "markdown" | "csv" | "excel" | "pdf" | "word";
  filter?: {
    decisions?: Array<"adopted" | "modified" | "pending" | null>;
    importances?: Array<"mandatory" | "recommended" | "optional">;
    chapters?: number[];
  };
  includeTimestamp: boolean;
  /** 所在地（Word 表紙用） */
  location?: string;
  /** 管理会社名（Word 表紙用） */
  managementCompany?: string;
  /** ソート順 */
  sortOrder?: "priority" | "chapter";
}

/**
 * POST /api/export
 * レビュー結果をエクスポートする（Blob を返す）
 */
export async function callExport(request: ExportRequest): Promise<Blob> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(request),
  });
  if (!res.ok) await handleResponseError(res, "エクスポートに失敗しました");
  return res.blob();
}

// ========== Project ==========

/** プロジェクト作成用データ */
export interface ProjectCreate {
  userId: string;
  condoName: string;
  condoType: "corporate" | "non-corporate" | "unknown";
  unitCount: "small" | "medium" | "large" | "xlarge";
  targetTiming: string;
  hasCurrentRules: boolean;
  documentType?: "management-rules" | "usage-rules" | "other-bylaws";
  currentStep: number;
  buildingAge?: number;
  location?: string;
  managementCompany?: string;
}

/**
 * GET /api/project?userId=xxx
 * ユーザーのプロジェクト一覧を取得する
 */
export async function listProjects(userId: string): Promise<Project[]> {
  const res = await fetch(
    `/api/project?userId=${encodeURIComponent(userId)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) await handleResponseError(res, "プロジェクト一覧の取得に失敗しました");
  return res.json();
}

/**
 * POST /api/project
 * 新規プロジェクトを作成する
 */
export async function createProject(
  data: ProjectCreate,
): Promise<{ id: string }> {
  const res = await fetch("/api/project", {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleResponseError(res, "プロジェクトの作成に失敗しました");
  return res.json();
}

/**
 * GET /api/project/[id]
 * プロジェクト詳細を取得する
 */
export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`/api/project/${encodeURIComponent(id)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) await handleResponseError(res, "プロジェクトの取得に失敗しました");
  return res.json();
}

/**
 * DELETE /api/project/[id]
 * プロジェクトとその関連データを削除する
 */
export async function deleteProjectApi(id: string): Promise<void> {
  const res = await fetch(`/api/project/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) await handleResponseError(res, "プロジェクトの削除に失敗しました");
}

/**
 * PATCH /api/project/[id]
 * プロジェクトを部分更新する
 */
export async function updateProject(
  id: string,
  data: Partial<Project>,
): Promise<void> {
  const res = await fetch(`/api/project/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) await handleResponseError(res, "プロジェクトの更新に失敗しました");
}

/**
 * currentStep を更新する便利関数
 *
 * 各画面到達時にバックグラウンドで呼び出す。失敗しても画面遷移をブロックしない。
 */
export function syncCurrentStep(projectId: string, step: number): void {
  updateProject(projectId, { currentStep: step }).catch((err) =>
    console.error("currentStep の更新に失敗:", err),
  );
}

// ========== Parsed Bylaws ==========

/**
 * POST /api/project/[id]/parsed-bylaws
 * パース結果を Firestore に保存する
 */
export async function saveParsedBylawsRemote(
  projectId: string,
  data: ParseResult,
): Promise<void> {
  const res = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/parsed-bylaws`,
    {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ data }),
    },
  );
  if (!res.ok) await handleResponseError(res, "パース結果の保存に失敗しました");
}

/**
 * GET /api/project/[id]/parsed-bylaws
 * Firestore からパース結果を取得する
 */
export async function loadParsedBylawsRemote(
  projectId: string,
): Promise<ParseResult | null> {
  const res = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/parsed-bylaws`,
    { headers: await authHeaders() },
  );
  if (!res.ok) await handleResponseError(res, "パース結果の取得に失敗しました");
  const json = await res.json();
  return json.data ?? null;
}

// ========== Review ==========

/**
 * GET /api/review/[projectId]
 * プロジェクトのレビュー記事を全件取得する
 */
export async function getReviewArticles(
  projectId: string,
): Promise<{ articles: ReviewArticle[] }> {
  const res = await fetch(
    `/api/review/${encodeURIComponent(projectId)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) await handleResponseError(res, "レビュー記事の取得に失敗しました");
  return res.json();
}

/**
 * PATCH /api/review/[projectId]
 * 単一条文のレビュー記事を部分更新する
 */
export async function patchReviewArticle(
  projectId: string,
  data: {
    articleNum: string;
    decision?: string | null;
    memo?: string;
    draft?: string;
  },
): Promise<void> {
  const res = await fetch(
    `/api/review/${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) await handleResponseError(res, "レビュー記事の更新に失敗しました");
}

/**
 * DELETE /api/review/[projectId]
 * 指定した条番号のレビュー記事を一括削除する
 */
export async function deleteReviewArticlesApi(
  projectId: string,
  articleNums: string[],
): Promise<{ deleted: number }> {
  const res = await fetch(`/api/review/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ articleNums }),
  });
  if (!res.ok) await handleResponseError(res, "レビュー記事の削除に失敗しました");
  return res.json();
}

/** 決定イベント適用結果 */
export interface ReviewDecisionResult {
  articleNum: string;
  decision: string | null;
  currentDraft: string;
  memo: string;
  modificationHistory: string[];
}

/**
 * POST /api/review/[projectId]/decide
 * 条文に対して決定イベントを適用する
 */
export async function decideReview(
  projectId: string,
  articleNum: string,
  event: ReviewEvent,
): Promise<ReviewDecisionResult> {
  const res = await fetch(
    `/api/review/${encodeURIComponent(projectId)}/decide`,
    {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ articleNum, event }),
    },
  );
  if (!res.ok) await handleResponseError(res, "レビュー決定の適用に失敗しました");
  return res.json();
}

/**
 * GET /api/review/[projectId]/progress
 * プロジェクト全体のレビュー進捗を取得する
 */
export async function getReviewProgress(
  projectId: string,
): Promise<{ progress: ReviewProgress }> {
  const res = await fetch(
    `/api/review/${encodeURIComponent(projectId)}/progress`,
    { headers: await authHeaders() },
  );
  if (!res.ok) await handleResponseError(res, "レビュー進捗の取得に失敗しました");
  return res.json();
}

// ========== Finalize ==========

/** 最終確定レスポンス */
export interface FinalizeResult {
  success: boolean;
  finalizedCount: number;
}

/** 最終確定エラーレスポンス（法的必須で保留の条文がある場合） */
export interface FinalizeError {
  error: string;
  pendingMandatory?: string[];
}

/**
 * POST /api/project/[id]/finalize
 * プロジェクトの全条文を最終確定にする
 *
 * 法的必須で保留・未決定の条文がある場合は 400 エラーを返す。
 */
export async function finalizeProject(
  projectId: string,
): Promise<FinalizeResult> {
  const res = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/finalize`,
    {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as FinalizeError;
    throw new Error(
      err.error ?? "最終確定に失敗しました",
    );
  }
  return res.json();
}

// ========== Admin ==========

/**
 * DELETE /api/admin/clear-cache
 * AI キャッシュを全件削除する
 */
export async function clearAiCache(): Promise<{ deleted: number }> {
  const res = await fetch("/api/admin/clear-cache", {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) await handleResponseError(res, "AI キャッシュの削除に失敗しました");
  return res.json();
}

/**
 * DELETE /api/admin/clear-data
 * 全プロジェクトデータ + AI キャッシュを削除する
 */
export async function clearAllData(): Promise<{
  deletedProjects: number;
  deletedCache: number;
}> {
  const res = await fetch("/api/admin/clear-data", {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) await handleResponseError(res, "全データの削除に失敗しました");
  return res.json();
}

// ---------- 管理会社案 ----------

export interface ManagementDraftParseCallbacks {
  onProgress?: (data: { phase: string; current: number; total: number; message: string }) => void;
  onComplete?: (data: { totalParsed: number; matched: number; saved: number; warnings: string[] }) => void;
  onError?: (message: string) => void;
}

/**
 * 管理会社案をパースして ReviewArticle に紐付け
 */
export function parseManagementDraft(
  projectId: string,
  input: { text: string } | { file: File },
  callbacks: ManagementDraftParseCallbacks,
): AbortController {
  const controller = new AbortController();
  const formData = new FormData();
  formData.append("projectId", projectId);

  if ("text" in input) {
    formData.append("text", input.text);
  } else {
    formData.append("file", input.file);
  }

  getAuthToken().then((token) => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    return fetch("/api/ingestion/parse-management-draft", {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        try {
          const errorJson = await res.json() as { error?: string };
          callbacks.onError?.(errorJson.error || "管理会社案パースに失敗しました");
        } catch {
          const errorText = await res.text();
          callbacks.onError?.(errorText || "管理会社案パースに失敗しました");
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "progress") callbacks.onProgress?.(data);
            else if (data.type === "complete") callbacks.onComplete?.(data);
            else if (data.type === "error") callbacks.onError?.(data.message);
          } catch {
            // SSE パース失敗は無視
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError?.(err instanceof Error ? err.message : "不明なエラー");
      }
    });

  return controller;
}
