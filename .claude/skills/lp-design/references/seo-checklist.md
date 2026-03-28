# SEO・メタデータ・構造化データ チェックリスト

## メタデータ（必須）

```tsx
export const metadata: Metadata = {
  title: "サービス名 | キャッチコピー",
  description: "120〜160文字の説明。主要キーワードを自然に含める",
  openGraph: {
    title: "サービス名 | キャッチコピー",
    description: "...",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  alternates: {
    canonical: "https://example.com",
  },
}
```

## 構造化データ（JSON-LD）

### SoftwareApplication

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "サービス名",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "JPY"
  },
  "description": "サービス説明"
}
```

### FAQPage

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "質問文",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "回答文"
      }
    }
  ]
}
```

## セマンティック HTML チェックリスト

- [ ] `<header>` — ナビゲーション
- [ ] `<main>` — メインコンテンツ（1ページ1つ）
- [ ] `<section>` — 各セクション（見出し付き）
- [ ] `<footer>` — フッター
- [ ] `<nav>` — ナビゲーションリンク
- [ ] `h1` は1ページ1つ
- [ ] 見出し階層: h1 → h2 → h3（飛ばさない）
- [ ] 画像に適切な `alt` テキスト
- [ ] スキップリンク: ページ先頭に「本文へスキップ」

## Core Web Vitals

| 指標 | 目標 | 対策 |
|------|------|------|
| LCP | < 2.5s | `next/image` + `priority`、フォントプリロード |
| INP | < 200ms | イベントハンドラの最適化、重い処理の分離 |
| CLS | < 0.1 | 画像に width/height、フォント `display: swap` |

## 画像最適化

- `next/image` 必須
- ヒーロー画像: `priority` 付与（LCP改善）
- `sizes` 属性: `(max-width: 768px) 100vw, 60vw` 等
- 装飾画像: `alt=""` + `aria-hidden="true"`

## フォント最適化

```tsx
import { Noto_Sans_JP } from "next/font/google"

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: true,
})
```
