# LP セクション実装パターン

## ファーストビュー（ヒーロー）

### 構成要素
- ヘッドライン（h1）: 25〜40文字
- サブヘッドライン: 1〜2行でヘッドラインを補足
- CTA ボタン: 動詞 + ベネフィット
- ビジュアル: プロダクトスクリーンショット or デモ
- 信頼バッジ（任意）: 「〇〇組合が利用中」等

### レイアウト
- デスクトップ: テキスト左60% + ビジュアル右40%（または逆）
- モバイル: テキスト上 → ビジュアル下の縦積み
- 高さ: デスクトップ 600〜700px、モバイル auto

### 実装パターン（Next.js + Tailwind）

```tsx
function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* テキスト */}
          <div className="text-center lg:text-left">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
              ヘッドライン
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-600 lg:text-xl">
              サブヘッドライン
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Button size="lg">無料で始める</Button>
              <Button variant="outline" size="lg">詳しく見る</Button>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              クレジットカード不要・1分で登録完了
            </p>
          </div>
          {/* ビジュアル */}
          <div className="relative">
            <Image src="/hero.png" alt="..." width={1200} height={800} priority />
          </div>
        </div>
      </div>
    </section>
  )
}
```

## 課題提起（Pain Points）

### 構成要素
- セクション見出し: 「こんなお悩みはありませんか？」
- 3〜4個の課題カード: アイコン + 見出し + 1〜2行の説明
- 共感のトーン: ユーザーの言葉で語る

### 実装パターン

```tsx
const painPoints = [
  { icon: <CurrencyIcon />, title: "専門家費用が高すぎる", description: "管理士に依頼すると50万円以上..." },
  { icon: <ClockIcon />, title: "時間がない", description: "理事会の限られた時間で法改正を..." },
  { icon: <QuestionIcon />, title: "何から始めればいいかわからない", description: "改正点が多すぎて..." },
]

function PainPoints() {
  return (
    <section className="bg-gray-50 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          こんなお悩みはありませんか？
        </h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {painPoints.map((item) => (
            <div key={item.title} className="rounded-2xl bg-white p-8 shadow-sm">
              <div className="text-red-500">{item.icon}</div>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

## 機能紹介（Features）

### 構成
- 3〜5個の主要機能
- 各機能: ベネフィット見出し + 説明 + スクリーンショット
- 交互レイアウト（テキスト左→右→左）が効果的

### Bento Grid パターン（2025トレンド）

```tsx
function Features() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          規約リノベが選ばれる理由
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 大きなカード（2列分） */}
          <div className="rounded-3xl bg-blue-50 p-8 sm:col-span-2">
            <h3>...</h3>
            <Image ... />
          </div>
          {/* 通常カード */}
          <div className="rounded-3xl bg-gray-50 p-8">
            <h3>...</h3>
          </div>
          {/* ... */}
        </div>
      </div>
    </section>
  )
}
```

## 使い方（How It Works）

### 構成
- 3ステップ構成（多くても4）
- 各ステップ: 番号 + 見出し + 説明 + アイコン/イラスト
- 横並び（デスクトップ）→ 縦並び（モバイル）
- ステップ間を線/矢印で接続

## 社会的証明（Social Proof）

### 構成要素
- 導入数値: 「〇〇組合が利用中」
- お客様の声: 顔写真 + 実名 + 役職 + 具体的成果（最低3件）
- 権威性バッジ: 「マンション管理士監修」「国交省標準規約準拠」
- メディア掲載ロゴ（該当する場合）

## 料金プラン（Pricing）

### 構成
- 2〜3プラン構成
- 中央プランを「おすすめ」としてハイライト
- 各プラン: プラン名 + 価格（税込） + 機能リスト + CTAボタン
- 年払い/月払いのトグル（該当する場合）
- 「こんな方におすすめ」のペルソナ説明

## FAQ

### 構成
- アコーディオン形式
- 5〜8個の質問
- 購入障壁を取り除く質問を優先
- 構造化データ（FAQPage schema）を付与

## 最終CTA

### 構成
- 背景色でセクションを強調（ブランドカラーのグラデーション等）
- ヘッドライン: 行動を促す一言
- サブテキスト: 最後の不安を解消
- CTAボタン: ファーストビューと同じもの

## スクロールアニメーション

### Intersection Observer パターン

```tsx
"use client"
import { useEffect, useRef, useState } from "react"

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true) },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, isInView }
}

function AnimatedSection({ children }: { children: React.ReactNode }) {
  const { ref, isInView } = useInView()
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${
        isInView ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
    >
      {children}
    </div>
  )
}
```

**注意**: `prefers-reduced-motion: reduce` の場合はアニメーションを無効化すること。

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```
