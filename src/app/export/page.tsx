import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";

const EXPORT_FORMATS = [
  {
    id: "review-pdf",
    title: "レビュー配布用PDF",
    description: "理事会メンバーへの印刷配布用。A4縦、大きめフォント、1条文1ページ、チェックボックス欄つき。",
    icon: "📋",
    format: "PDF",
  },
  {
    id: "resolution-word",
    title: "総会議案用Word",
    description: "総会議案書の添付資料。新旧対照表の正式フォーマット（2列表）。議案の要領テンプレート含む。",
    icon: "📝",
    format: "Word",
  },
  {
    id: "summary-pdf",
    title: "変更サマリーPDF",
    description: "住民説明会の概要資料。全変更点を「変わること」「変わらないこと」で要約。5分で読める分量。",
    icon: "📊",
    format: "PDF",
  },
  {
    id: "review-record",
    title: "レビュー結果記録",
    description: "理事会議事録の添付用。各条文の判断結果（採用/修正/保留）とメモを一覧化。",
    icon: "📁",
    format: "PDF",
  },
];

export default function ExportPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep={5} />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            ステップ 5 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">改正案エクスポート</h2>
          <p className="text-muted-foreground">
            レビュー結果をもとに、用途に応じた形式でダウンロードできます。
          </p>
        </div>

        {/* レビューサマリー */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">レビュー結果サマリー</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">4</p>
                <p className="text-xs text-muted-foreground">採用</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">1</p>
                <p className="text-xs text-muted-foreground">修正</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-400">0</p>
                <p className="text-xs text-muted-foreground">保留</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="mb-6" />

        {/* エクスポート形式カード */}
        <div className="space-y-4 mb-8">
          {EXPORT_FORMATS.map((fmt) => (
            <Card key={fmt.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <span className="text-3xl" aria-hidden="true">{fmt.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{fmt.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmt.description}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0">
                  {fmt.format}をダウンロード
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 次のステップ案内 */}
        <Card className="bg-muted/50">
          <CardContent className="py-6">
            <p className="font-medium mb-2">お疲れさまでした！</p>
            <p className="text-sm text-muted-foreground mb-4">
              ダウンロードした資料を使って、以下のステップで規約改正を進めてください。
            </p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                <strong>理事会で検討</strong> — レビュー配布用PDFを印刷して理事会メンバーに配布し、意見を集約
              </li>
              <li>
                <strong>住民説明会</strong> — 変更サマリーPDFを使って住民に改正内容を説明
              </li>
              <li>
                <strong>総会で決議</strong> — 総会議案用Wordを議案書に添付し、特別決議で可決
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mt-4">
              重要な条文については、マンション管理士や弁護士への確認をお勧めします。
            </p>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
