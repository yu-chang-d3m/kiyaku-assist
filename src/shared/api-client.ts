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
  DraftRequest,
  DraftResult,
  CondoContext,
  BatchDraftResult,
} from "@/domains/drafting/types";
import type { ReviewEvent, ReviewProgress } from "@/domains/review/types";
import type { ChatMessage, ChatResponse } from "@/domains/chat/types";
import type { ReviewArticle, Project } from "@/shared/db/types";

// ---------- 共通ヘルパー ----------

/**
 * SSE イベントストリームをパースし、コールバックを呼び出す汎用ヘルパー
 *
 * fetch + ReadableStream パターンで SSE を受信する。
 * POST メソッドをサポートするために EventSource ではなく fetch を使用。
 */
async function consumeSSE(
  response: Response,
  handlers: Record<string, (data: unknown) => void>,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("ストリームの読み取りに失敗しました");
  }

  const decoder = new TextDecoder();
  let buffer = "";

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
}

// ========== Ingestion ==========

/**
 * POST /api/ingestion/parse
 * テキスト形式の管理規約をパースして構造化データに変換する
 */
export async function callParse(text: string): Promise<ParseResult> {
  const res = await fetch("/api/ingestion/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "パースに失敗しました",
    );
  }
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
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "ファイルのパースに失敗しました",
    );
  }
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
      const res = await fetch("/api/analysis/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, articles }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(
          (err as { error?: string }).error ?? "分析の開始に失敗しました",
        );
        return;
      }

      await consumeSSE(res, {
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

/**
 * GET /api/analysis/[projectId]
 * プロジェクトの分析結果（レビュー記事一覧）を取得する
 */
export async function getAnalysisResult(
  projectId: string,
): Promise<ReviewArticle[]> {
  const res = await fetch(
    `/api/analysis/${encodeURIComponent(projectId)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "分析結果の取得に失敗しました",
    );
  }
  return res.json();
}

// ========== Drafting ==========

/** ドラフト生成対象の条文データ */
export interface DraftItem {
  articleNum: string;
  category: string;
  currentText: string | null;
  standardText: string;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, items, condoContext }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        callbacks.onError?.(
          (err as { error?: string }).error ??
            "ドラフト生成の開始に失敗しました",
        );
        return;
      }

      await consumeSSE(res, {
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
 * POST /api/drafting/single
 * 単一条文のドラフトを再生成する
 */
export async function callDraftSingle(
  request: DraftRequest,
): Promise<DraftResult> {
  const res = await fetch("/api/drafting/single", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "ドラフト生成に失敗しました",
    );
  }
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "チャットに失敗しました",
    );
  }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message, history }),
        signal: controller.signal,
      });

      if (!res.ok) {
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
  format: "markdown" | "csv";
  filter?: {
    decisions?: Array<"adopted" | "modified" | "pending" | null>;
    importances?: Array<"mandatory" | "recommended" | "optional">;
    chapters?: number[];
  };
  includeTimestamp: boolean;
}

/**
 * POST /api/export
 * レビュー結果をエクスポートする（Blob を返す）
 */
export async function callExport(request: ExportRequest): Promise<Blob> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "エクスポートに失敗しました",
    );
  }
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
  currentStep: number;
}

/**
 * GET /api/project?userId=xxx
 * ユーザーのプロジェクト一覧を取得する
 */
export async function listProjects(userId: string): Promise<Project[]> {
  const res = await fetch(
    `/api/project?userId=${encodeURIComponent(userId)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ??
        "プロジェクト一覧の取得に失敗しました",
    );
  }
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "プロジェクトの作成に失敗しました",
    );
  }
  return res.json();
}

/**
 * GET /api/project/[id]
 * プロジェクト詳細を取得する
 */
export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`/api/project/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "プロジェクトの取得に失敗しました",
    );
  }
  return res.json();
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "プロジェクトの更新に失敗しました",
    );
  }
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
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "レビュー記事の取得に失敗しました",
    );
  }
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "レビュー記事の更新に失敗しました",
    );
  }
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleNum, event }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ??
        "レビュー決定の適用に失敗しました",
    );
  }
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
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "レビュー進捗の取得に失敗しました",
    );
  }
  return res.json();
}
