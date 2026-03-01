import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";

/** FAQ データ */
const FAQ_ITEMS = [
  {
    id: "what-changed",
    question: "何が変わったのですか？",
    answer: `2024年に区分所有法が改正され、2026年4月1日から施行されます。主な変更点は以下の3つです：

1. **総会の決議要件が緩和** — 規約変更の特別決議が「全組合員の3/4以上」から「出席者の3/4以上」に変わります。欠席者や無関心な方を分母から除外できるようになります。

2. **マンション再生の選択肢が拡大** — 建替え以外にも「一括売却」「一棟リノベーション」「取壊し」が法律で認められました。

3. **所在不明者の扱いが明確化** — 連絡が取れない区分所有者を、裁判所の手続きを経て決議の分母から除外できるようになります。`,
  },
  {
    id: "why-revise",
    question: "なぜ規約を変える必要があるのですか？",
    answer: `施行後は、現在の規約に書かれている決議要件（「組合員総数の3/4以上」など）よりも、法律の規定（「出席者の3/4以上」）が優先されます。

規約を変えなくても管理組合の運営自体は可能ですが、**規約と法律の内容が食い違う状態**が続くことになります。住民に「うちの規約ではこう書いてあるのに」と混乱を招くリスクがあるため、早めの改正をお勧めします。

また、令和7年（2025年10月）に国交省が標準管理規約を全面改正しており、置き配ルール、EV充電設備、電子議決権など、現代のマンション生活に必要なルールの見本が示されています。`,
  },
  {
    id: "when-to-do",
    question: "いつまでに何をすればいいですか？",
    answer: `**おすすめは「2026年4月以降の通常総会」で改正すること**（パターン2）です。

施行後（4月1日以降）は、新法の緩和された決議要件が適用されるため、「出席者の3/4以上」の賛成で規約変更できます。多くのマンションは5〜6月に通常総会を開催するので、そこに規約改正議案を上程するのが現実的です。

**大まかなスケジュール：**
- 3〜4月：現行規約の分析と改正案の作成（← このツールで支援）
- 4月：理事会で改正案を承認
- 5月上旬：住民説明会の開催
- 5〜6月：通常総会で特別決議`,
  },
  {
    id: "pattern1-vs-2",
    question: "施行前と施行後、どちらで改正すべきですか？",
    answer: `| | パターン1（施行前） | パターン2（施行後） |
|---|---|---|
| **決議要件** | 全組合員の3/4以上（厳しい） | 出席者の3/4以上（緩やか） |
| **メリット** | 施行日から新規約が有効 | 決議が通りやすい |
| **注意点** | 2026年3月末までに総会を開催する必要あり | 施行日〜改正までの間、規約と法律が食い違う |

**2026年3月時点では、パターン2が現実的です。** 施行前の総会準備期間がほとんど残っていないため、5〜6月の通常総会に合わせた改正をお勧めします。`,
  },
  {
    id: "r7-revision",
    question: "「令和7年改正」の標準管理規約とは何ですか？",
    answer: `国土交通省が「マンション管理規約のお手本」として作成している**マンション標準管理規約**が、2025年10月に全面改正されました。

これは改正区分所有法（2026年4月施行）に完全対応した最新版で、このツールのギャップ分析やドラフト生成はこの令和7年改正版を基準としています。

主な改正ポイントは23項目あり、決議要件の変更、再生手法の拡充、所在不明者対応、電磁的方法による議決権行使など、多岐にわたります。`,
  },
  {
    id: "cost-comparison",
    question: "専門家に頼むといくらかかりますか？",
    answer: `| 依頼先 | 費用目安 |
|---|---|
| マンション管理士（スポット契約） | 46〜58万円 |
| 弁護士 | 50万円〜 |
| 管理会社（雛形提供） | 10万円弱 |
| **このツール** | **無料（MVP期間）** |

マンション管理士はコストが高い一方で、住民説明会のサポートや合意形成の支援など、手厚いフォローが受けられます。紛争が予想される場合は弁護士への相談をお勧めします。

**このツールは「専門家と自力の間」を埋めるもの**で、法律相談の代替ではありません。`,
  },
] as const;

export default function GuidePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={1} />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            ステップ 1 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">法改正かんたんガイド</h2>
          <p className="text-muted-foreground">
            まず、今回の法改正で何が変わるのか、なぜ規約を変える必要があるのかを理解しましょう。目安: 15分
          </p>
        </div>

        {/* 3つのポイントカード */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">決議要件の緩和</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                全組合員の3/4 → 出席者の3/4
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">再生手法の拡充</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                建替え＋売却＋リノベ＋取壊し
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">所在不明者対応</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                決議の分母から除外可能に
              </p>
            </CardContent>
          </Card>
        </div>

        <Separator className="mb-8" />

        {/* FAQ アコーディオン */}
        <h3 className="text-lg font-semibold mb-4">よくある質問</h3>
        <Accordion type="single" collapsible className="mb-8">
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="text-left text-base">
                {item.question}
              </AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">
                  {item.answer}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {/* CTA */}
        <Card className="bg-muted/50">
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
            <div>
              <p className="font-medium">内容は理解できましたか？</p>
              <p className="text-sm text-muted-foreground">
                次のステップで現行規約をアップロードし、AIに分析してもらいましょう。
              </p>
            </div>
            <Button size="lg" asChild>
              <Link href="/upload">次へ: 規約をアップロード</Link>
            </Button>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
