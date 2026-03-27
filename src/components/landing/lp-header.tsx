"use client";

import Link from "next/link";
import { useAuth } from "@/shared/auth/auth-context";
import { Button } from "@/components/ui/button";

export function LPHeader() {
  const { user, configured } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-0.5">
          <span className="text-lg font-bold tracking-tight text-foreground">
            規約
          </span>
          <span className="text-lg font-bold tracking-tight text-primary">
            リノベ
          </span>
        </Link>

        <nav className="flex items-center gap-3">
          {configured && user ? (
            <Button size="default" asChild>
              <Link href="/onboarding">ダッシュボードへ</Link>
            </Button>
          ) : (
            <Button size="default" asChild>
              <Link href="/login">無料で始める</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
