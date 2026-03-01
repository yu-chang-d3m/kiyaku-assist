import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { JOURNEY_STEPS } from "@/lib/journey";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader showProgress={false} />

      <main className="flex-1">
        {/* ヒーローセクション */}
        <section className="max-w-5xl mx-auto px-4 py-12 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            マンション管理規約の改正を
            <br />
            AIがステップバイステップで支援
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            2026年4月施行の改正区分所有法に対応した規約改正を、
            法律の専門知識がなくても進められます。
            全体で約2〜3時間、ご自分のペースで進められます。
          </p>
          <Button size="lg" className="text-base px-8 py-6" asChild>
            <Link href="/onboarding">無料で始める</Link>
          </Button>
        </section>

        {/* ステップ紹介 */}
        <section className="bg-muted/50 py-12">
          <div className="max-w-5xl mx-auto px-4">
            <h3 className="text-xl font-semibold text-center mb-8">
              6つのステップで規約改正を完了
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {JOURNEY_STEPS.map((step) => (
                <Card key={step.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {step.id}
                      </span>
                      {step.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      目安: {step.estimatedMinutes}分
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 特徴 */}
        <section className="max-w-5xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary mb-2">1/100</p>
              <p className="text-sm text-muted-foreground">
                専門家費用（46〜58万円）の約1/100のコスト
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary mb-2">2〜3時間</p>
              <p className="text-sm text-muted-foreground">
                ご自分のペースで進められる所要時間
              </p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary mb-2">令和7年対応</p>
              <p className="text-sm text-muted-foreground">
                最新の標準管理規約（2025年10月改正）に完全準拠
              </p>
            </div>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
