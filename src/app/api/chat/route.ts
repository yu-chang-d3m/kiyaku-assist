import { NextRequest } from "next/server";
import { getClaudeClient, MODELS } from "@/lib/claude";
import { readFile } from "fs/promises";
import path from "path";

// 基準データ（標準管理規約）を読み込む
async function loadStandardRules(): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), "data", "mlit_r7_standard_rules.md");
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch {
    return "【基準データ未設定】令和7年改正 標準管理規約（単棟型）のデータは現在準備中です。";
  }
}

function buildSystemPrompt(standardRules: string): string {
  return `あなたはマンション管理規約の改正を支援するAIアシスタントです。

## あなたの役割
マンション管理組合の理事や区分所有者からの質問に対し、管理規約の改正に関する一般的な情報を提供してください。

## 制約事項（厳守）
以下の制約を厳守してください：
- 個別の法的紛争（滞納問題、近隣トラブル、損害賠償等）に関する法的助言は行わないでください
- 個別の訴訟や調停に関する質問には回答しないでください
- そのような質問には「この件については弁護士やマンション管理士にご相談ください」と回答してください
- あなたの回答は法的助言ではなく、一般的な情報提供であることを認識してください
- 回答の末尾に免責事項を付ける必要はありませんが、法的判断を求められた場合は専門家への相談を推奨してください

## 参照データ（標準管理規約）
以下は令和7年改正の標準管理規約です。回答の根拠として活用してください。

---
${standardRules}
---

## 回答スタイル
- 丁寧で分かりやすい日本語で回答してください
- 根拠となる条文がある場合は条番号を明示してください
- 改正のポイントを簡潔に説明してください
- 必要に応じて箇条書きを使って整理してください`;
}

// 非弁行為ガードレール: 個別紛争に関する質問を検知
function detectLegalAdviceRequest(message: string): boolean {
  const legalPatterns = [
    /滞納.*(訴|請求|回収|差押|強制執行)/,
    /裁判|訴訟|調停|仲裁/,
    /損害賠償|慰謝料/,
    /弁護士.*(依頼|相談|費用)/,
    /差止|仮処分|仮差押/,
    /(隣人|住人|居住者).*(トラブル|紛争|対立).*(解決|対処|対応)/,
    /契約.*(解除|解約|違約金)/,
    /不法行為|債務不履行/,
  ];

  return legalPatterns.some((pattern) => pattern.test(message));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context } = body as {
      message: string;
      context?: string;
    };

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "メッセージ（message）が必要です" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 非弁行為ガードレール: 明らかな法的助言要求を事前にブロック
    if (detectLegalAdviceRequest(message)) {
      const guardResponse =
        "ご質問の内容は個別の法的紛争に関するものと思われます。\n\n" +
        "このような案件については、以下の専門家にご相談いただくことをお勧めします：\n" +
        "- **弁護士**（法的紛争の解決）\n" +
        "- **マンション管理士**（管理運営全般のアドバイス）\n" +
        "- **司法書士**（登記関連の手続き）\n\n" +
        "管理規約の一般的な内容に関するご質問でしたら、お気軽にお尋ねください。";

      // ガードレール応答もSSE形式で返す（クライアント側の処理を統一するため）
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", text: guardResponse })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
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

    const standardRules = await loadStandardRules();
    const client = getClaudeClient();

    // コンテキストがある場合はメッセージに付加
    let userMessage = message;
    if (context) {
      userMessage = `【参考コンテキスト】\n${context}\n\n【質問】\n${message}`;
    }

    // ストリーミングレスポンス
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamResponse = client.messages.stream({
            model: MODELS.CHAT,
            max_tokens: 4096,
            system: buildSystemPrompt(standardRules),
            messages: [
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          for await (const event of streamResponse) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const data = JSON.stringify({
                type: "text",
                text: event.delta.text,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          // 完了シグナル
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        } catch (error) {
          console.error("[/api/chat] Streaming error:", error);
          const errorData = JSON.stringify({
            type: "error",
            error: "回答の生成中にエラーが発生しました",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
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
  } catch (error) {
    console.error("[/api/chat] Error:", error);

    if (error instanceof Error && error.message === "ANTHROPIC_API_KEY is not set") {
      return new Response(
        JSON.stringify({ error: "APIキーが設定されていません" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "チャット処理中にエラーが発生しました" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
