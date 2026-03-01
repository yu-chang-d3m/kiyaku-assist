"use client";

import Link from "next/link";
import { type StepId } from "@/lib/journey";
import { JourneyProgress } from "./journey-progress";

interface AppHeaderProps {
  currentStep?: StepId;
  showProgress?: boolean;
}

export function AppHeader({ currentStep = 0, showProgress = true }: AppHeaderProps) {
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
            💬 AIに質問
          </Link>
        </div>
      </div>
      {showProgress && <JourneyProgress currentStep={currentStep} />}
    </header>
  );
}
