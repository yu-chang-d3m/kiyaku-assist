"use client";

import { JOURNEY_STEPS, type StepId } from "@/lib/journey";
import { cn } from "@/lib/utils";

interface JourneyProgressProps {
  currentStep: StepId;
}

export function JourneyProgress({ currentStep }: JourneyProgressProps) {
  return (
    <nav aria-label="規約改正の進捗" className="w-full bg-card border-b">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <ol className="flex items-center gap-1 sm:gap-2">
          {JOURNEY_STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;

            return (
              <li key={step.id} className="flex items-center gap-1 sm:gap-2 flex-1">
                {/* ステップ番号 */}
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium shrink-0",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                    !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? "✓" : step.id}
                </div>

                {/* ラベル（PC のみ） */}
                <span
                  className={cn(
                    "hidden md:inline text-xs",
                    isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>

                {/* 接続線 */}
                {step.id < JOURNEY_STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 min-w-2",
                      isCompleted ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
