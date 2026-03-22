"use client";

/**
 * AIチャット画面
 *
 * SSE ストリーミングを使用して、管理規約に関する質問にAIが回答する。
 *
 * v1 からの改善点:
 * - streamChat() を @/shared/api-client から import（AbortController を返す形式）
 * - ガードレール警告表示（filtered フラグ対応）
 * - useAuth による認証連携
 * - StepId が文字列ベース
 * - Zustand ストアからプロジェクト ID を取得
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/shared/auth/auth-context";
import { streamChat } from "@/shared/api-client";
import { loadProjectId } from "@/shared/store";
import { AuthGuard } from "@/shared/auth/auth-guard";

// ---------- 型定義 ----------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** ガードレールによりフィルタリングされたか */
  filtered?: boolean;
}

// ---------- 定数 ----------

const WELCOME_MESSAGE =
  "管理規約の改正についてご質問ください。例えば：\n\n・改正区分所有法で何が変わりますか？\n・特別決議の要件はどう変わりますか？\n・所在不明の区分所有者への対応方法は？\n\n※ 個別の法的紛争に関するご質問にはお答えできません。";

const ERROR_MESSAGE =
  "AIに接続できませんでした。しばらく待ってから再度お試しください。";

const GUARDRAIL_WARNING =
  "この質問は個別の法的助言に該当する可能性があるため、回答を控えさせていただきます。具体的な法的問題については、マンション管理士や弁護士にご相談ください。";

// ---------- コンポーネント ----------

export default function ChatPage() {
  return <AuthGuard><ChatPageContent /></AuthGuard>;
}

function ChatPageContent() {
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorOccurred, setErrorOccurred] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // アンマウント時にストリーミングをキャンセル
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // textarea の高さ自動調整
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    // 最大3行分（1行約22px + padding）
    const maxHeight = 22 * 3 + 16;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // ---------- メッセージ送信 ----------

  const handleSend = useCallback(
    (messageText?: string) => {
      const text = (messageText ?? input).trim();
      if (!text || isStreaming) return;

      // 進行中のストリーミングをキャンセル
      abortRef.current?.abort();

      setInput("");
      setErrorOccurred(false);
      setLastUserMessage(text);

      // ユーザーメッセージ追加
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      // AI メッセージのプレースホルダー
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // 会話履歴を構築（welcome メッセージを除外）
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
        }));

      // プロジェクト ID を取得
      const projectId = loadProjectId() ?? "default";

      // SSE ストリーミング開始（AbortController が返る）
      const controller = streamChat(projectId, text, history, {
        onMessage: (response) => {
          const content = response.message.content;
          const isFiltered = response.guardrailResult.status === "blocked";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: isFiltered ? GUARDRAIL_WARNING : content,
                    filtered: isFiltered,
                  }
                : msg
            )
          );
        },
        onDone: () => {
          setIsStreaming(false);
        },
        onError: (error) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: error || ERROR_MESSAGE }
                : msg
            )
          );
          setErrorOccurred(true);
          setIsStreaming(false);
        },
      });

      abortRef.current = controller;
    },
    [input, isStreaming, messages]
  );

  // ---------- リトライ ----------

  const handleRetry = useCallback(() => {
    if (!lastUserMessage) return;
    // 最後のAIメッセージ（エラー）を削除してから再送信
    setMessages((prev) => prev.slice(0, -1));
    handleSend(lastUserMessage);
  }, [lastUserMessage, handleSend]);

  // ---------- キーボード操作 ----------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Shift+Enter で改行、Enter のみで送信
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ---------- UI ----------

  return (
    <div className="flex flex-col h-screen">
      <AppHeader showProgress={false} />

      {/* ナビゲーションリンク */}
      <div className="max-w-3xl mx-auto w-full px-4 py-2">
        {loadProjectId() ? (
          <Link
            href="/review"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; レビューに戻る
          </Link>
        ) : (
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; ホームに戻る
          </Link>
        )}
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : msg.filtered
                      ? "bg-amber-50 border border-amber-200 text-amber-900"
                      : "bg-muted"
                )}
              >
                {/* ガードレール警告アイコン */}
                {msg.filtered && (
                  <div className="flex items-center gap-1.5 mb-2 text-amber-700">
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                    <span className="text-xs font-medium">
                      ガードレール適用
                    </span>
                  </div>
                )}

                {msg.content}

                {/* ストリーミング中の最後のAIメッセージにカーソル表示 */}
                {isStreaming &&
                  msg.role === "assistant" &&
                  msg.id === messages[messages.length - 1]?.id && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse align-text-bottom" />
                  )}
              </div>
            </div>
          ))}

          {/* ストリーミング開始前（AIメッセージが空のとき）のタイピングインジケーター */}
          {isStreaming &&
            messages[messages.length - 1]?.role === "assistant" &&
            messages[messages.length - 1]?.content === "" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    >
                      .
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    >
                      .
                    </span>
                    <span
                      className="animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    >
                      .
                    </span>
                  </span>{" "}
                  考え中...
                </div>
              </div>
            )}

          {/* エラー時のリトライボタン */}
          {errorOccurred && !isStreaming && (
            <div className="flex justify-start">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="min-h-[44px]"
              >
                再試行
              </Button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 入力エリア */}
      <div className="border-t bg-background">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="管理規約について質問してください..."
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              style={{ minHeight: "44px" }}
            />
            <Button
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              className="min-h-[44px] px-4 rounded-xl"
            >
              {isStreaming ? (
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                "送信"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 text-center">
            Shift+Enter で改行 / AIの回答は参考情報です
          </p>
        </div>
      </div>
    </div>
  );
}
