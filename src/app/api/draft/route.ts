import { NextRequest, NextResponse } from "next/server";
import { getClaudeClient, MODELS } from "@/lib/claude";

// ドラフト生成結果の型定義
interface DraftResult {
  draft: string;
  summary: string;
  explanation: string;
}

const SYSTEM_PROMPT = `あなたはマンション管理規約の改正条文を起草する専門家です。

## あなたの役割
ギャップ分析の結果に基づき、改正条文のドラフトを生成してください。

## 起草ルール
1. 標準管理規約（令和7年改正）の条文構造・用語に準拠してください
2. 管理組合法人形態を前提としてください（「管理者」ではなく「理事長」等）
3. 既存の条文がある場合は、できるだけ既存の文体・番号体系を維持してください
4. 新設条文の場合は、標準管理規約に準じた形式で起草してください
5. 項番号は「2」「3」のように算用数字、号は「一」「二」のように漢数字を使用してください

## 出力形式（JSON以外のテキストは出力しないでください）
{
  "draft": "改正後の条文全文（条番号・タイトル含む）",
  "summary": "変更内容の要約（1〜2文）",
  "explanation": "改正理由の説明（なぜこの変更が必要か、どの法改正に対応するか）"
}

## 注意事項
- 法的助言ではなく、あくまで草案（ドラフト）として提示してください
- 最終的な条文は管理組合の総会決議を経て確定する旨を理解してください`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleNum, currentText, gapSummary, baseRef } = body as {
      articleNum: string;
      currentText: string | null;
      gapSummary: string;
      baseRef: string;
    };

    if (!articleNum || typeof articleNum !== "string") {
      return NextResponse.json(
        { error: "条番号（articleNum）が必要です" },
        { status: 400 }
      );
    }

    if (!gapSummary || typeof gapSummary !== "string") {
      return NextResponse.json(
        { error: "ギャップ分析の要約（gapSummary）が必要です" },
        { status: 400 }
      );
    }

    if (!baseRef || typeof baseRef !== "string") {
      return NextResponse.json(
        { error: "基準条文の参照（baseRef）が必要です" },
        { status: 400 }
      );
    }

    const client = getClaudeClient();

    // ユーザーメッセージを構築
    let userMessage = `## 対象条文: ${articleNum}\n\n`;

    if (currentText) {
      userMessage += `## 現行条文\n${currentText}\n\n`;
    } else {
      userMessage += `## 現行条文\n（該当条文なし — 新設が必要）\n\n`;
    }

    userMessage += `## ギャップ分析結果\n${gapSummary}\n\n`;
    userMessage += `## 標準管理規約の該当条文（参照）\n${baseRef}\n\n`;
    userMessage += `上記に基づき、改正条文のドラフトを作成してください。`;

    const message = await client.messages.create({
      model: MODELS.ANALYSIS,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const contentBlock = message.content[0];
    if (contentBlock.type !== "text") {
      return NextResponse.json(
        { error: "予期しないレスポンス形式です" },
        { status: 500 }
      );
    }

    // JSONパース
    let parsed: DraftResult;
    try {
      parsed = JSON.parse(contentBlock.text);
    } catch {
      const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: "ドラフト生成結果の解析に失敗しました" },
          { status: 500 }
        );
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[/api/draft] Error:", error);

    if (error instanceof Error && error.message === "ANTHROPIC_API_KEY is not set") {
      return NextResponse.json(
        { error: "APIキーが設定されていません" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "ドラフト生成中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
