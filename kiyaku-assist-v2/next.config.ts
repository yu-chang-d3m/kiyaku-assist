import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** サーバーサイド専用パッケージ（バンドルから除外） */
  serverExternalPackages: ["@anthropic-ai/sdk", "pino", "pdf-parse", "mammoth", "firebase-admin"],
};

export default nextConfig;
