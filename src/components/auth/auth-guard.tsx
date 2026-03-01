"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * 認証ガードコンポーネント
 *
 * - Firebase 未設定時: ガードなし（デモモード、子コンポーネントをそのまま表示）
 * - Firebase 設定済み + 未認証: /login にリダイレクト
 * - ローディング中: スピナー表示
 * - 認証済み: 子コンポーネントを表示
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Firebase 設定済みで、ローディング完了後、未認証ならリダイレクト
    if (configured && !loading && !user) {
      router.replace("/login");
    }
  }, [configured, loading, user, router]);

  // Firebase 未設定 → デモモード（ガードなし）
  if (!configured) {
    return <>{children}</>;
  }

  // ローディング中
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 未認証 → リダイレクト中なので何も表示しない
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 認証済み → 子コンポーネントを表示
  return <>{children}</>;
}
