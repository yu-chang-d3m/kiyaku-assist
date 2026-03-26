"use client";

import Link from "next/link";
import { useAuth } from "@/shared/auth/auth-context";
import { Button } from "@/components/ui/button";

export function LPHeader() {
  const { user, configured } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-0.5">
          <span className="text-lg font-bold tracking-tight text-gray-900">
            規約
          </span>
          <span className="text-lg font-bold tracking-tight text-blue-600">
            リノベ
          </span>
        </Link>

        <nav className="flex items-center gap-3">
          {configured && user ? (
            <Button size="default" className="bg-blue-600 hover:bg-blue-700 text-white" asChild>
              <Link href="/onboarding">ダッシュボードへ</Link>
            </Button>
          ) : (
            <Button size="default" className="bg-blue-600 hover:bg-blue-700 text-white" asChild>
              <Link href="/login">無料で始める</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
