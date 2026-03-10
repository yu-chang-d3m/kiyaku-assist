import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** サーバーサイド専用パッケージ（バンドルから除外） */
  serverExternalPackages: ["@anthropic-ai/sdk", "pino"],
};

export default nextConfig;
