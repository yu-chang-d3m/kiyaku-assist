/**
 * API クライアント — フロントエンドから各 API Route を呼び出すユーティリティ
 */

// ---- /api/parse ----

export interface ParsedArticle {
  articleNum: string;
  title: string;
  content: string;
}

export interface ParsedChapter {
  chapter: number;
  title: string;
  articles: ParsedArticle[];
}

export interface ParseResult {
  chapters: ParsedChapter[];
}

export async function callParse(text: string): Promise<ParseResult> {
  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `パース失敗 (${res.status})`);
  }
  return res.json();
}

// ---- /api/analyze ----

export interface GapItem {
  articleNum: string;
  title: string;
  status: "missing" | "outdated" | "ok" | "extra";
  importance: "high" | "medium" | "low";
  summary: string;
  category: string;
}

export interface AnalyzeResult {
  gaps: GapItem[];
}

export async function callAnalyze(
  userRules: string,
  chapterNum: number
): Promise<AnalyzeResult> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userRules, chapterNum }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `分析失敗 (${res.status})`);
  }
  return res.json();
}

// ---- /api/draft ----

export interface DraftResult {
  draft: string;
  summary: string;
  explanation: string;
}

export async function callDraft(params: {
  articleNum: string;
  currentText: string | null;
  gapSummary: string;
  baseRef: string;
}): Promise<DraftResult> {
  const res = await fetch("/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `ドラフト生成失敗 (${res.status})`);
  }
  return res.json();
}

// ---- /api/chat (SSE) ----

export interface ChatStreamEvent {
  type: "text" | "done" | "error";
  text?: string;
  error?: string;
}

/**
 * /api/chat を SSE で呼び出し、チャンクごとにコールバックを呼ぶ
 */
export async function streamChat(
  message: string,
  context: string | undefined,
  onChunk: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `チャット失敗 (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("ストリームが取得できません");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event: ChatStreamEvent = JSON.parse(line.slice(6));
          onChunk(event);
        } catch {
          // 不正なJSONは無視
        }
      }
    }
  }
}
