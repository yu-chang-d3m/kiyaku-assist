"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    q: "法律の知識がなくても使えますか？",
    a: "はい、法律の知識は一切不要です。AIが法改正の内容をかみ砕いて解説し、「何が変わるか」「なぜ変える必要があるか」をひとつずつ説明します。理事会の皆さまが理解した上で判断できるよう設計しています。",
  },
  {
    q: "AIの出力は法的に有効ですか？",
    a: "規約リノベはあくまで「情報提供・テンプレート補助ツール」であり、法律事務を行うものではありません。AIが生成する改正案は国交省の標準管理規約に準拠したテンプレートをベースとしていますが、最終的な採用判断は理事会・総会の決議によって行っていただきます。必要に応じて専門家のレビューを併用することも可能です。",
  },
  {
    q: "途中で中断しても大丈夫ですか？",
    a: "もちろんです。作業の進捗はすべてクラウドに自動保存されます。次回ログイン時に、前回の続きからすぐに再開できます。理事会の空いた時間に少しずつ進めていただけます。",
  },
  {
    q: "データのセキュリティは大丈夫ですか？",
    a: "アップロードいただく規約データは Google Cloud の暗号化ストレージに保管され、通信はすべてTLS暗号化されています。お客さまのデータがAIの学習に使用されることはありません。",
  },
  {
    q: "対応している規約の種類を教えてください。",
    a: "現在は単棟型マンションの管理規約に対応しています。国交省の標準管理規約（単棟型）令和7年改正版を基準データとして使用しています。団地型・複合用途型への対応は今後予定しています。",
  },
  {
    q: "料金はかかりますか？",
    a: "現在はベータ版として無料でご利用いただけます。登録にクレジットカードは不要です。将来的な料金体系については、正式リリース時にご案内予定です。",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="py-16 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
          よくあるご質問
        </h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-base sm:text-lg font-medium text-gray-900 py-5">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-gray-600">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* FAQ 構造化データ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
    </section>
  );
}
