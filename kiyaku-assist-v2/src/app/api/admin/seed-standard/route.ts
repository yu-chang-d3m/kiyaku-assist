/**
 * 標準管理規約初期投入 API
 *
 * R7 標準管理規約 Markdown をパースし、LLM で意味グループにマッピングして
 * Firestore standardArticles コレクションに格納する。
 * 管理者認証必須（ADMIN_UIDS に含まれる UID のみ実行可能）。
 *
 * POST /api/admin/seed-standard
 * - SSE ストリーミングで進捗を返す
 * - 既存データは全件洗い替え
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { parseStandardRules, getParseStats } from "@/domains/taxonomy/standard-parser";
import { mapStandardArticlesToTaxonomy } from "@/domains/taxonomy/mapper";
import { saveStandardArticles } from "@/shared/db/server-actions";
import { logger } from "@/shared/observability/logger";
import { verifyAdmin } from "@/shared/api/auth";

/** R7 標準管理規約ファイルパス */
const R7_FILE = path.resolve(
  process.cwd(),
  "../data/mlit/mlit_standard_rules_r7_2025.md",
);

export async function POST(request: NextRequest) {
  // 認証チェック（ストリーム開始前）
  const auth = await verifyAdmin(request);
  if (auth instanceof NextResponse) return auth;

  // ファイル存在チェック
  if (!fs.existsSync(R7_FILE)) {
    return NextResponse.json(
      { error: `R7 標準管理規約ファイルが見つかりません: ${R7_FILE}` },
      { status: 404 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller が閉じている場合は無視
        }
      };

      // keepalive: 15秒ごとにコメント送信
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      try {
        // Phase 1: パース
        send("progress", { phase: "parse", message: "R7 標準管理規約をパース中…" });

        const markdown = fs.readFileSync(R7_FILE, "utf-8");
        const articles = parseStandardRules(markdown);
        const stats = getParseStats(articles);

        logger.info(
          { totalArticles: stats.totalArticles, chapters: stats.chapters.length },
          "R7 標準管理規約パース完了",
        );

        send("progress", {
          phase: "parse",
          message: `パース完了: ${stats.totalArticles} 条文、${stats.chapters.length} 章`,
          stats,
        });

        // Phase 2: LLM マッピング
        send("progress", { phase: "mapping", message: "意味グループにマッピング中…" });

        const mapped = await mapStandardArticlesToTaxonomy(articles, (progress) => {
          send("progress", {
            phase: "mapping",
            message: `マッピング中: ${progress.completed}/${progress.total} 条文`,
            ...progress,
          });
        });

        // Phase 3: Firestore 保存
        send("progress", { phase: "save", message: "Firestore に保存中…" });

        const savedCount = await saveStandardArticles(
          mapped.map((a) => ({
            articleNum: a.articleNum,
            title: a.title,
            body: a.body,
            chapter: a.chapter,
            chapterTitle: a.chapterTitle,
            comment: a.comment,
            semanticGroup: a.semanticGroup,
            secondaryGroups: a.secondaryGroups,
          })),
        );

        logger.info({ savedCount }, "標準条文を Firestore に保存完了");

        // グループ分布の集計
        const groupCounts: Record<string, number> = {};
        for (const a of mapped) {
          groupCounts[a.semanticGroup] = (groupCounts[a.semanticGroup] || 0) + 1;
        }

        send("complete", {
          message: `完了: ${savedCount} 条文を Firestore に保存しました`,
          totalArticles: savedCount,
          groupDistribution: groupCounts,
          chapters: stats.chapters,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, "seed-standard API エラー");
        send("error", { message });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
