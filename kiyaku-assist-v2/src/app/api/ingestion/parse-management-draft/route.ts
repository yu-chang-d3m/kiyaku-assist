/**
 * 管理会社案パース API
 *
 * POST: テキスト or ファイルを受け取り、既存 ReviewArticle とマッチングして保存
 * SSE で進捗を返す。
 * 認証必須（プロジェクト所有者のみ）。
 */

import { NextRequest, NextResponse } from "next/server";
import { parseManagementDraft } from "@/domains/ingestion/management-draft-parser";
import {
  getReviewArticles,
  saveManagementDraftToReviewArticles,
} from "@/shared/db/server-actions";
import { createChildLogger } from "@/shared/observability/logger";
import { verifyAuth, verifyProjectOwner } from "@/shared/api/auth";

const logger = createChildLogger({ module: "api:parse-management-draft" });

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const auth = await verifyAuth(request);
    if (auth instanceof NextResponse) return auth;

    const formData = await request.formData();
    const projectId = formData.get("projectId") as string;
    const text = formData.get("text") as string | null;
    const file = formData.get("file") as File | null;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId は必須です" },
        { status: 400 },
      );
    }

    // プロジェクト所有者チェック
    const ownerCheck = await verifyProjectOwner(projectId, auth.uid);
    if (ownerCheck instanceof NextResponse) return ownerCheck;

    if (!text && !file) {
      return NextResponse.json(
        { error: "text または file のいずれかが必要です" },
        { status: 400 },
      );
    }

    // 既存の ReviewArticle を取得（マッチング用）
    const existingArticles = await getReviewArticles(projectId);
    const existingNums = existingArticles.map((a) => a.articleNum);

    if (existingNums.length === 0) {
      return NextResponse.json(
        { error: "レビュー対象の条文がありません。先に分析を実行してください。" },
        { status: 400 },
      );
    }

    // SSE ストリーム
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        }

        // keepalive
        const keepalive = setInterval(() => {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15000);

        try {
          let inputText: string;

          if (file) {
            // ファイルの場合はバッファに変換して処理
            const buffer = Buffer.from(await file.arrayBuffer());
            const { parseManagementDraftFromBuffer } = await import(
              "@/domains/ingestion/management-draft-parser"
            );
            const result = await parseManagementDraftFromBuffer(
              buffer,
              file.name,
              existingNums,
              (event) => send({ type: "progress", ...event }),
            );

            send({
              type: "progress",
              phase: "save",
              current: 0,
              total: result.articles.length,
              message: "Firestore に保存中…",
            });

            // マッチした条文を保存
            const draftsToSave = result.articles
              .filter((a) => a.matchedArticleNum)
              .map((a) => ({
                articleNum: a.matchedArticleNum!,
                managementDraft: `${a.articleNum}${a.title ? `（${a.title}）` : ""}\n${a.body}`,
              }));

            const { updated } = await saveManagementDraftToReviewArticles(
              projectId,
              draftsToSave,
            );

            send({
              type: "complete",
              totalParsed: result.metadata.totalArticles,
              matched: result.metadata.matchedArticles,
              saved: updated,
              warnings: result.metadata.warnings,
            });

            logger.info(
              { projectId, totalParsed: result.metadata.totalArticles, matched: result.metadata.matchedArticles, saved: updated },
              "管理会社案パース完了（ファイル）",
            );
          } else {
            inputText = text!;

            const result = await parseManagementDraft(
              inputText,
              "text-input",
              existingNums,
              (event) => send({ type: "progress", ...event }),
            );

            send({
              type: "progress",
              phase: "save",
              current: 0,
              total: result.articles.length,
              message: "Firestore に保存中…",
            });

            const draftsToSave = result.articles
              .filter((a) => a.matchedArticleNum)
              .map((a) => ({
                articleNum: a.matchedArticleNum!,
                managementDraft: `${a.articleNum}${a.title ? `（${a.title}）` : ""}\n${a.body}`,
              }));

            const { updated } = await saveManagementDraftToReviewArticles(
              projectId,
              draftsToSave,
            );

            send({
              type: "complete",
              totalParsed: result.metadata.totalArticles,
              matched: result.metadata.matchedArticles,
              saved: updated,
              warnings: result.metadata.warnings,
            });

            logger.info(
              { projectId, totalParsed: result.metadata.totalArticles, matched: result.metadata.matchedArticles, saved: updated },
              "管理会社案パース完了（テキスト）",
            );
          }
        } catch (err) {
          logger.error({ err, projectId }, "管理会社案パースエラー");
          send({
            type: "error",
            message: err instanceof Error ? err.message : "パース中にエラーが発生しました",
          });
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
  } catch (err) {
    logger.error({ err }, "管理会社案パース API エラー");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "不明なエラー" },
      { status: 500 },
    );
  }
}
