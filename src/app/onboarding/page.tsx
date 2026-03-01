"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";

/** オンボーディングのステップ定義 */
const ONBOARDING_QUESTIONS = [
  {
    id: "unitCount",
    question: "マンションの戸数はどのくらいですか？",
    description: "おおよその目安で構いません。規約の規模感を把握するためにお聞きします。",
    options: [
      { value: "small", label: "〜30戸" },
      { value: "medium", label: "31〜100戸" },
      { value: "large", label: "101〜300戸" },
      { value: "xlarge", label: "301戸以上" },
    ],
  },
  {
    id: "isCorporate",
    question: "管理組合は法人格を取得していますか？",
    description: "法人格の有無によって規約の内容が一部異なります。わからない場合は「不明」を選んでください。",
    options: [
      { value: "yes", label: "はい（管理組合法人）" },
      { value: "no", label: "いいえ（権利能力なき社団）" },
      { value: "unknown", label: "わからない" },
    ],
  },
  {
    id: "hasCurrentRules",
    question: "現行の管理規約はお手元にありますか？",
    description: "PDF、Word、紙のいずれかの形式であれば大丈夫です。",
    options: [
      { value: "pdf", label: "PDFがある" },
      { value: "word", label: "Wordファイルがある" },
      { value: "paper", label: "紙のみ" },
      { value: "none", label: "手元にない" },
    ],
  },
  {
    id: "targetTiming",
    question: "規約改正のスケジュール感は？",
    description:
      "2026年4月1日以降の総会で改正する場合（パターン2）は、緩和された決議要件が使えるためおすすめです。",
    options: [
      { value: "before", label: "2026年3月末までに総会決議したい" },
      { value: "after", label: "2026年4月以降の通常総会で対応（推奨）" },
      { value: "undecided", label: "まだ決めていない" },
    ],
  },
] as const;

type AnswerKey = (typeof ONBOARDING_QUESTIONS)[number]["id"];
type Answers = Partial<Record<AnswerKey, string>>;

export default function OnboardingPage() {
  const router = useRouter();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});

  const question = ONBOARDING_QUESTIONS[currentQ];
  const totalQ = ONBOARDING_QUESTIONS.length;
  const isLast = currentQ === totalQ - 1;
  const selectedValue = answers[question.id];

  function handleSelect(value: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  function handleNext() {
    if (isLast) {
      // TODO: answers を Firestore に保存
      router.push("/guide");
    } else {
      setCurrentQ((prev) => prev + 1);
    }
  }

  function handleBack() {
    if (currentQ > 0) {
      setCurrentQ((prev) => prev - 1);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={0} />

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-lg">
          <CardHeader>
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
            {question.options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                  selectedValue === option.value
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                {option.label}
              </button>
            ))}

            {/* 規約が手元にない場合のヘルプ */}
            {question.id === "hasCurrentRules" && selectedValue === "none" && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">
                  管理会社に依頼して取得できます
                </p>
                <p className="text-xs text-muted-foreground">
                  「現行の管理規約一式をPDFで送ってください」と管理会社にメールで依頼してください。通常1〜2営業日で届きます。取得後にこのツールに戻ってアップロードできます。
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentQ === 0}
                className="flex-1"
              >
                前へ
              </Button>
              <Button
                onClick={handleNext}
                disabled={!selectedValue}
                className="flex-1"
              >
                {isLast ? "ガイドへ進む" : "次へ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
