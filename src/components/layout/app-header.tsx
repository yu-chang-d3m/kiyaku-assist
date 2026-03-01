"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { type StepId } from "@/lib/journey";
import { JourneyProgress } from "./journey-progress";
import { LogOut, LogIn } from "lucide-react";

interface AppHeaderProps {
  currentStep?: StepId;
  showProgress?: boolean;
}

/**
 * ユーザーアイコン（displayName の頭文字を表示）
 */
function UserAvatar({ name }: { name: string | null }) {
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  return (
    <span className="flex items-center justify-center size-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
      {initial}
    </span>
  );
}

export function AppHeader({ currentStep = 0, showProgress = true }: AppHeaderProps) {
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
        <h1 className="text-lg font-bold tracking-tight">
          キヤクアシスト
        </h1>
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
          {/* Firebase 未設定時は認証関連UIを表示しない（デモモード） */}
        </div>
      </div>
      {showProgress && <JourneyProgress currentStep={currentStep} />}
    </header>
  );
}
