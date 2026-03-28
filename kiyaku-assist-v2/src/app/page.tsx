/**
 * ランディングページ — 規約リノベ
 *
 * セクション構成:
 * 1. Hero — キャッチコピー + CTA
 * 2. Pain Points — 3つの課題
 * 3. Numbers — 数値で訴求
 * 4. How It Works — 6ステップの流れ
 * 5. Features — 4つの選ばれる理由
 * 6. Comparison — 従来手法との比較
 * 7. FAQ — よくあるご質問（Accordion）
 * 8. Final CTA — 最後の一押し
 * 9. Footer — 免責事項・法的表示
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LPHeader } from "@/components/landing/lp-header";
import { FAQSection } from "@/components/landing/faq-section";
import { ProjectList } from "@/components/project-list";
import { JOURNEY_STEPS } from "@/shared/journey";
import {
  CircleDollarSign,
  CircleHelp,
  Clock,
  FileSearch,
  MessageSquareText,
  FileOutput,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Building2,
} from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <LPHeader />

      <main className="flex-1">
        {/* ===== Hero ===== */}
        <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-primary/3 to-background">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-12 sm:pt-24 sm:pb-20 text-center">
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 text-sm px-4 py-1.5">
              改正区分所有法（2026年4月施行）対応済み
            </Badge>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
              マンション管理規約を、
              <br className="hidden sm:block" />
              <span className="text-primary">リノベ</span>しよう。
            </h1>

            <p className="mt-6 text-lg sm:text-xl leading-relaxed text-muted-foreground max-w-2xl mx-auto">
              2026年4月、改正区分所有法が施行されます。
              <br className="hidden sm:block" />
              あなたのマンションの規約は準備できていますか？
              <br className="hidden sm:block" />
              AIと一緒に、専門家なしで改正案をつくれます。
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="text-lg px-8 py-6 h-auto"
                asChild
              >
                <Link href="/login">
                  無料で始める
                  <ArrowRight className="size-5 ml-1" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="text-lg px-8 py-6 h-auto"
                asChild
              >
                <Link href="#how-it-works">使い方を見る</Link>
              </Button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              登録は1分・クレジットカード不要
            </p>
          </div>
        </section>

        {/* ===== ProjectList（ログイン済みユーザー向け） ===== */}
        <ProjectList />

        {/* ===== Pain Points ===== */}
        <section className="bg-muted/50 py-16 sm:py-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-4">
              規約改正、こんなお悩みはありませんか？
            </h2>
            <p className="text-center text-muted-foreground mb-12 text-lg">
              全国12万の管理組合が直面している課題です
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm">
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="mx-auto mb-4 flex items-center justify-center size-14 rounded-2xl bg-red-50">
                    <CircleDollarSign className="size-7 text-red-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    専門家への依頼は高額
                  </h3>
                  <p className="text-base leading-relaxed text-muted-foreground">
                    マンション管理士や弁護士に依頼すると46〜58万円。管理会社経由でも10万円以上かかります。
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="mx-auto mb-4 flex items-center justify-center size-14 rounded-2xl bg-amber-50">
                    <CircleHelp className="size-7 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    何から始めればいいかわからない
                  </h3>
                  <p className="text-base leading-relaxed text-muted-foreground">
                    改正点は30項目以上。法律用語が難解で、理事会だけで対応するのは不安です。
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-8 pb-6 px-6 text-center">
                  <div className="mx-auto mb-4 flex items-center justify-center size-14 rounded-2xl bg-primary/5">
                    <Clock className="size-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    時間が足りない
                  </h3>
                  <p className="text-base leading-relaxed text-muted-foreground">
                    理事会は月に1〜2回。本業もある中で、法改正を追いかける余裕がありません。
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ===== Numbers ===== */}
        <section className="py-16 sm:py-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-12">
              規約リノベなら、こう変わります
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
              <div className="text-center">
                <p className="text-4xl sm:text-5xl font-bold text-primary mb-3">
                  1/100
                </p>
                <p className="text-lg font-medium text-foreground mb-1">
                  専門家費用の約1/100
                </p>
                <p className="text-base text-muted-foreground">
                  46〜58万円 → 数千円程度に
                </p>
              </div>
              <div className="text-center">
                <p className="text-4xl sm:text-5xl font-bold text-primary mb-3">
                  2〜3時間
                </p>
                <p className="text-lg font-medium text-foreground mb-1">
                  ご自分のペースで完了
                </p>
                <p className="text-base text-muted-foreground">
                  6ステップを空いた時間に少しずつ
                </p>
              </div>
              <div className="text-center">
                <p className="text-4xl sm:text-5xl font-bold text-primary mb-3">
                  令和7年
                </p>
                <p className="text-lg font-medium text-foreground mb-1">
                  最新の標準管理規約に完全準拠
                </p>
                <p className="text-base text-muted-foreground">
                  2025年10月改正版を基準データに採用
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== How It Works ===== */}
        <section id="how-it-works" className="bg-muted/50 py-16 sm:py-24 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-4">
              6つのステップで完了します
            </h2>
            <p className="text-center text-muted-foreground mb-12 text-lg">
              全体の所要時間は約2〜3時間。ご自分のペースで進められます。
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {JOURNEY_STEPS.map((step, index) => (
                <Card key={step.id} className="shadow-sm">
                  <CardContent className="pt-6 pb-5 px-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="flex items-center justify-center size-9 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                        {index + 1}
                      </span>
                      <h3 className="text-lg font-semibold text-foreground">
                        {step.label}
                      </h3>
                    </div>
                    <p className="text-base leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                    <p className="text-sm text-muted-foreground/60 mt-3">
                      目安: 約{step.estimatedMinutes}分
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Features ===== */}
        <section className="py-16 sm:py-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-12">
              規約リノベが選ばれる理由
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-background p-8">
                <div className="mb-4 flex items-center justify-center size-12 rounded-xl bg-primary/10">
                  <FileSearch className="size-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  AIが法改正を自動チェック
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  改正区分所有法と標準管理規約の全改正項目を、AIが現行規約と自動比較。30項目以上の改正点を見落としなくチェックします。
                </p>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-background p-8">
                <div className="mb-4 flex items-center justify-center size-12 rounded-xl bg-primary/10">
                  <MessageSquareText className="size-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  条文ごとにわかりやすく解説
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  法律用語をかみ砕いて、「何が変わるか」「なぜ変える必要があるか」を理事会目線で説明。わからないことはAIにいつでも質問できます。
                </p>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-background p-8">
                <div className="mb-4 flex items-center justify-center size-12 rounded-xl bg-primary/10">
                  <FileOutput className="size-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  改正案をワンクリックで生成
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  標準管理規約に準拠した改正案を自動生成。新旧対照表つきで、条文ごとに「採用・修正・保留」を選べます。
                </p>
              </div>

              <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-background p-8">
                <div className="mb-4 flex items-center justify-center size-12 rounded-xl bg-primary/10">
                  <Building2 className="size-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  そのまま総会へ持ち込める出力
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  理事会配布用PDF、総会議案書、住民説明資料をボタンひとつで出力。差分ハイライトつきで住民への説明もスムーズです。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Comparison ===== */}
        <section className="bg-muted/50 py-16 sm:py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-12">
              従来の方法と比べてください
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="py-4 px-4 text-base font-medium text-muted-foreground border-b w-1/3">
                      比較項目
                    </th>
                    <th className="py-4 px-4 text-base font-medium text-muted-foreground border-b w-1/3">
                      専門家に委託
                    </th>
                    <th className="py-4 px-4 text-base font-semibold text-primary border-b-2 border-primary w-1/3 bg-primary/5 rounded-t-lg">
                      規約リノベ
                    </th>
                  </tr>
                </thead>
                <tbody className="text-base">
                  <tr>
                    <td className="py-4 px-4 border-b font-medium text-foreground">
                      費用
                    </td>
                    <td className="py-4 px-4 border-b text-muted-foreground">
                      46〜58万円
                    </td>
                    <td className="py-4 px-4 border-b text-primary font-semibold bg-primary/5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="size-4 text-primary shrink-0" />
                        無料（ベータ版）
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 border-b font-medium text-foreground">
                      所要期間
                    </td>
                    <td className="py-4 px-4 border-b text-muted-foreground">
                      2〜3ヶ月
                    </td>
                    <td className="py-4 px-4 border-b text-primary font-semibold bg-primary/5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="size-4 text-primary shrink-0" />
                        2〜3時間
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 border-b font-medium text-foreground">
                      改正項目カバー
                    </td>
                    <td className="py-4 px-4 border-b text-muted-foreground">
                      担当者による
                    </td>
                    <td className="py-4 px-4 border-b text-primary font-semibold bg-primary/5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="size-4 text-primary shrink-0" />
                        全項目を網羅的にチェック
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 border-b font-medium text-foreground">
                      成果物
                    </td>
                    <td className="py-4 px-4 border-b text-muted-foreground">
                      改正案のみ
                    </td>
                    <td className="py-4 px-4 border-b text-primary font-semibold bg-primary/5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="size-4 text-primary shrink-0" />
                        改正案 + 議案書 + 説明資料
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-medium text-foreground">
                      理事会の理解
                    </td>
                    <td className="py-4 px-4 text-muted-foreground">
                      専門家任せになりがち
                    </td>
                    <td className="py-4 px-4 text-primary font-semibold bg-primary/5 rounded-b-lg">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="size-4 text-primary shrink-0" />
                        理事会が主体的に理解・判断
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ===== Trust Badges ===== */}
        <section className="py-12 sm:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-5 text-primary" />
                <span className="text-base">国交省標準管理規約準拠</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-5 text-primary" />
                <span className="text-base">改正区分所有法対応</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-5 text-primary" />
                <span className="text-base">データ暗号化・安全な通信</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <FAQSection />

        {/* ===== Final CTA ===== */}
        <section className="bg-primary py-16 sm:py-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-primary-foreground mb-4">
              あなたのマンション規約も、
              <br className="sm:hidden" />
              リノベしませんか？
            </h2>
            <p className="text-lg text-primary-foreground/80 mb-10">
              改正法の施行まで、あと少し。今すぐ始めましょう。
            </p>
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-white/90 text-lg px-10 py-6 h-auto font-semibold"
              asChild
            >
              <Link href="/login">
                無料で始める
                <ArrowRight className="size-5 ml-1" />
              </Link>
            </Button>
            <p className="mt-4 text-sm text-primary-foreground/60">
              登録は1分・クレジットカード不要
            </p>
          </div>
        </section>
      </main>

      {/* ===== Footer ===== */}
      <footer className="bg-gray-900 text-gray-400 py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <div className="flex items-baseline gap-0.5">
              <span className="text-base font-bold text-gray-200">規約</span>
              <span className="text-base font-bold text-blue-400">リノベ</span>
            </div>
            <p className="text-sm text-center sm:text-right">
              マンション管理規約のAI改正支援ツール
            </p>
          </div>

          <div className="border-t border-gray-800 pt-6">
            <p className="text-sm text-center text-gray-500 mb-4">
              AIの出力はあくまで参考情報であり法的助言ではありません。最終的な判断は理事会・総会の決議によって行ってください。
            </p>
            <p className="text-xs text-center text-gray-600">
              &copy; 2025 規約リノベ. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "規約リノベ",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "JPY",
            },
            description:
              "マンション管理規約の改正を、AIがステップバイステップで支援するツール。改正区分所有法（2026年4月施行）に完全対応。",
          }),
        }}
      />
    </div>
  );
}
