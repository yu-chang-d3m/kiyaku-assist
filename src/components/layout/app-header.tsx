"use client";

/**
 * アプリケーション共通ヘッダー
 *
 * - アプリ名（ホームへのリンク）
 * - 「AIに質問」リンク
 * - 設定メニュー（データ管理）
 * - 認証状態に応じたログイン/ログアウト表示
 * - オプションでジャーニー進捗バーを表示
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/shared/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type StepId } from "@/shared/journey";
import { JourneyProgress } from "./journey-progress";
import { LogOut, LogIn, Settings, Trash2, Database } from "lucide-react";
import { clearAiCache, clearAllData } from "@/shared/api-client";

interface AppHeaderProps {
  /** 現在のステップ ID（進捗バーのハイライトに使用） */
  currentStep?: StepId;
  /** 進捗バーを表示するかどうか（デフォルト: true） */
  showProgress?: boolean;
}

/**
 * ユーザーアバター（displayName の頭文字を表示）
 */
function UserAvatar({ name }: { name: string | null }) {
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <span className="flex items-center justify-center size-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
      {initial}
    </span>
  );
}

/**
 * 設定メニュー（ドロップダウン）
 */
function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const [confirmTarget, setConfirmTarget] = useState<"cache" | "all" | null>(null);

  const executeClearCache = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await clearAiCache();
      setMessage(`キャッシュ ${res.deleted} 件を削除しました`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }, []);

  const executeClearAll = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await clearAllData();
      setMessage(`プロジェクト ${res.deletedProjects} 件、キャッシュ ${res.deletedCache} 件を削除しました`);
      if (typeof window !== "undefined") sessionStorage.clear();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { setOpen((prev) => !prev); setMessage(""); }}
        className="size-8 text-muted-foreground hover:text-foreground"
        aria-label="設定"
      >
        <Settings className="size-4" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-background border rounded-lg shadow-lg p-2 z-50">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">データ管理</p>

          <button
            onClick={() => setConfirmTarget("cache")}
            disabled={busy}
            className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left disabled:opacity-50"
          >
            <Database className="size-4 text-muted-foreground shrink-0" />
            <div>
              <p className="font-medium">AI キャッシュを削除</p>
              <p className="text-xs text-muted-foreground">分析・ドラフトのキャッシュをクリア</p>
            </div>
          </button>

          <button
            onClick={() => setConfirmTarget("all")}
            disabled={busy}
            className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded-md hover:bg-destructive/10 transition-colors text-left disabled:opacity-50"
          >
            <Trash2 className="size-4 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">全データを削除</p>
              <p className="text-xs text-muted-foreground">プロジェクト + キャッシュを全削除</p>
            </div>
          </button>

          {message && (
            <p className="text-xs px-2 py-1.5 mt-1 text-muted-foreground bg-muted rounded">
              {message}
            </p>
          )}
        </div>
      )}

      {/* 確認ダイアログ */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget === "cache" ? "AI キャッシュを削除" : "全データを削除"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget === "cache"
                ? "分析・ドラフトの AI キャッシュを削除します。次回の分析時に再生成されます。"
                : "全プロジェクトデータと AI キャッシュを削除します。この操作は取り消せません。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className={confirmTarget === "all" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => {
                if (confirmTarget === "cache") executeClearCache();
                else if (confirmTarget === "all") executeClearAll();
                setConfirmTarget(null);
              }}
            >
              {confirmTarget === "all" ? "全て削除する" : "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AppHeader({ currentStep, showProgress = true }: AppHeaderProps) {
  const { user, configured, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // サインアウト失敗時は何もしない
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/">
          <h1 className="text-lg font-bold tracking-tight">
            キヤクアシスト
          </h1>
        </Link>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground hidden sm:block">
            マンション管理規約改正AIアシスタント
          </p>
          <Link
            href="/chat"
            className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            AIに質問
          </Link>

          {/* 設定メニュー */}
          <SettingsMenu />

          {/* 認証状態に応じた表示 */}
          {configured && user && (
            <div className="flex items-center gap-2">
              <UserAvatar name={user.displayName} />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="min-h-[44px] text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">ログアウト</span>
              </Button>
            </div>
          )}
          {configured && !user && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="min-h-[44px] text-xs"
            >
              <Link href="/login">
                <LogIn className="size-4" />
                ログイン
              </Link>
            </Button>
          )}
        </div>
      </div>
      {showProgress && currentStep && <JourneyProgress currentStep={currentStep} />}
    </header>
  );
}
