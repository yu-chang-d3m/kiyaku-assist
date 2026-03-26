import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/shared/auth/auth-context";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "規約リノベ | マンション管理規約をAIでリノベーション",
  description:
    "改正区分所有法（2026年4月施行）に完全対応。AIがマンション管理規約の改正案を自動作成。専門家費用の1/100、2〜3時間で完了。",
  openGraph: {
    title: "規約リノベ | マンション管理規約をAIでリノベーション",
    description:
      "改正区分所有法に完全対応。AIがマンション管理規約の改正案を自動作成。専門家費用の1/100で理事会が主体的に規約改正を進められます。",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
