"use client";

/**
 * アプリケーション共通ヘッダー
 *
 * - アプリ名（ホームへのリンク）
 * - 「AIに質問」リンク
 * - 認証状態に応じたログイン/ログアウト表示
 * - オプションでジャーニー進捗バーを表示
 *
 * v1 からの改善:
 * - StepId が文字列ベースに変更（数値から移行）
 * - import パスを @/shared/auth/auth-context, @/shared/journey に統一
 */

import Link from "next/link";
import { useAuth } from "@/shared/auth/auth-context";
import { Button } from "@/components/ui/button";
import { type StepId } from "@/shared/journey";
import { JourneyProgress } from "./journey-progress";
import { LogOut, LogIn } from "lucide-react";

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
          {/* Firebase 未設定時は認証関連 UI を表示しない（デモモード） */}
        </div>
      </div>
      {showProgress && currentStep && <JourneyProgress currentStep={currentStep} />}
    </header>
  );
}
