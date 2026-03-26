"use client";

/**
 * オンボーディングページ — 初回ヒアリング
 *
 * 5問の質問を1問ずつ表示し、マンションの基本情報を収集する。
 * 回答をもとに Firestore にプロジェクトを作成し、projectId を保存してから /guide へ遷移する。
 *
 * v2.2 改善:
 * - condoName（マンション名）質問を追加
 * - createProject() でプロジェクトを Firestore に永続化
 * - saveProjectId() でセッションに projectId を保持
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { saveOnboarding, saveProjectId } from "@/shared/store";
import { createProject, syncCurrentStep } from "@/shared/api-client";
import { useAuth } from "@/shared/auth/auth-context";
import { AuthGuard } from "@/shared/auth/auth-guard";
import { cn } from "@/lib/utils";

// ---------- 質問定義 ----------

interface OnboardingQuestion {
  id: string;
  question: string;
  description: string;
  type: "select" | "text";
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
}

const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    id: "condoName",
    question: "マンション名を教えてください",
    description:
      "プロジェクトの識別用に使います。正式名称でなくても構いません。",
    type: "text",
    placeholder: "例: ○○マンション",
  },
  {
    id: "unitCount",
    question: "マンションの戸数はどのくらいですか？",
    description:
      "おおよその目安で構いません。規約の規模感を把握するためにお聞きします。",
    type: "select",
    options: [
      { value: "small", label: "〜30戸" },
      { value: "medium", label: "31〜100戸" },
      { value: "large", label: "101〜300戸" },
      { value: "xlarge", label: "301戸以上" },
    ],
  },
  {
    id: "isCorporate",
    question: "管理組合は法人化していますか？",
    description:
      "法人格の有無によって規約の内容が一部異なります。わからない場合は「わからない」を選んでください。",
    type: "select",
    options: [
      { value: "corporate", label: "はい（管理組合法人）" },
      { value: "non-corporate", label: "いいえ（権利能力なき社団）" },
      { value: "unknown", label: "わからない" },
    ],
  },
  {
    id: "hasCurrentRules",
    question: "現行の管理規約はお手元にありますか？",
    description: "PDF、Word、紙のいずれかの形式であれば大丈夫です。",
    type: "select",
    options: [
      { value: "yes", label: "はい（データまたは紙がある）" },
      { value: "no", label: "いいえ（手元にない）" },
    ],
  },
  {
    id: "documentType",
    question: "レビュー対象の文書は何ですか？",
    description:
      "管理規約本体と使用細則・会則では、分析の基準が異なります。",
    type: "select",
    options: [
      { value: "management-rules", label: "管理規約" },
      { value: "usage-rules", label: "使用細則" },
      { value: "other-bylaws", label: "会則・その他" },
    ],
  },
  {
    id: "schedule",
    question: "総会の予定時期は？",
    description:
      "2026年4月1日以降の総会で改正する場合は、緩和された決議要件が使えるためおすすめです。",
    type: "select",
    options: [
      { value: "within3months", label: "3ヶ月以内" },
      { value: "3to6months", label: "3〜6ヶ月" },
      { value: "over6months", label: "6ヶ月以上先" },
      { value: "undecided", label: "まだ決めていない" },
    ],
  },
] as const;

type Answers = Record<string, string>;

// ---------- コンポーネント ----------

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <OnboardingPageContent />
    </AuthGuard>
  );
}

function OnboardingPageContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const question = ONBOARDING_QUESTIONS[currentQ];
  const totalQ = ONBOARDING_QUESTIONS.length;
  const isLast = currentQ === totalQ - 1;
  const selectedValue = answers[question.id] ?? "";
  const progressPercent = ((currentQ + 1) / totalQ) * 100;
  const canProceed = question.type === "text" ? selectedValue.trim().length > 0 : Boolean(selectedValue);

  /** 選択肢をクリックしたとき */
  function handleSelect(value: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  /** テキスト入力の変更 */
  function handleTextChange(value: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  /** 「次へ」または「始める」ボタン */
  async function handleNext() {
    if (isLast) {
      setSubmitting(true);
      setError("");
      try {
        // ストアにオンボーディング回答を保存
        saveOnboarding(answers);

        // Firestore にプロジェクトを作成
        const userId = user?.uid ?? `demo-${Date.now()}`;
        const { id } = await createProject({
          userId,
          condoName: answers.condoName ?? "マンション",
          condoType: (answers.isCorporate ?? "unknown") as "corporate" | "non-corporate" | "unknown",
          unitCount: (answers.unitCount ?? "medium") as "small" | "medium" | "large" | "xlarge",
          targetTiming: answers.schedule ?? "undecided",
          hasCurrentRules: answers.hasCurrentRules === "yes",
          documentType: (answers.documentType ?? "management-rules") as "management-rules" | "usage-rules" | "other-bylaws",
          currentStep: 0,
        });

        // projectId をセッションに保存
        saveProjectId(id);

        router.push("/guide");
      } catch (err) {
        console.error("プロジェクト作成に失敗:", err);
        setError(
          err instanceof Error ? err.message : "プロジェクトの作成に失敗しました。もう一度お試しください。",
        );
      } finally {
        setSubmitting(false);
      }
    } else {
      setCurrentQ((prev) => prev + 1);
    }
  }

  /** 「前へ」ボタン */
  function handleBack() {
    if (currentQ > 0) {
      setCurrentQ((prev) => prev - 1);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep="onboarding" />

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-lg">
          <CardHeader>
            {/* プログレスバー */}
            <div className="mb-4">
              <Progress value={progressPercent} className="h-2" />
            </div>

            <div className="flex items-center justify-between mb-2">
              <Badge variant="secondary">
                {currentQ + 1} / {totalQ}
              </Badge>
              <span className="text-xs text-muted-foreground">約5分で完了</span>
            </div>
            <CardTitle className="text-xl">{question.question}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {question.description}
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            {/* テキスト入力 */}
            {question.type === "text" && (
              <input
                type="text"
                value={selectedValue}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={question.placeholder}
                data-test={`onboarding-input-${question.id}`}
                className="w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canProceed) handleNext();
                }}
              />
            )}

            {/* 選択肢 */}
            {question.type === "select" && question.options?.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                data-test={`onboarding-option-${option.value}`}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors",
                  selectedValue === option.value
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                )}
              >
                {option.label}
              </button>
            ))}

            {/* 規約が手元にない場合のヘルプ */}
            {question.id === "hasCurrentRules" && selectedValue === "no" && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">
                  管理会社に依頼して取得できます
                </p>
                <p className="text-xs text-muted-foreground">
                  「現行の管理規約一式をPDFで送ってください」と管理会社にメールで依頼してください。通常1〜2営業日で届きます。取得後にこのツールに戻ってアップロードできます。
                </p>
              </div>
            )}

            {/* エラー表示 */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* ナビゲーションボタン */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentQ === 0 || submitting}
                className="flex-1"
                data-test="onboarding-back"
              >
                前へ
              </Button>
              <Button
                onClick={handleNext}
                disabled={!canProceed || submitting}
                className="flex-1"
                data-test="onboarding-next"
              >
                {submitting ? "作成中..." : isLast ? "始める" : "次へ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
