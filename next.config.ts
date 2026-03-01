import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Anthropic SDK などサーバーサイドで使用する Node.js パッケージ
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
