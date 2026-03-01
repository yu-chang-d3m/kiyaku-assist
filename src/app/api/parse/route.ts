import { NextRequest, NextResponse } from "next/server";
import { getClaudeClient, MODELS } from "@/lib/claude";

// 条文の構造化JSONの型定義
interface Article {
  articleNum: string;
  title: string;
  content: string;
}

interface Chapter {
  chapter: number;
  title: string;
  articles: Article[];
}

interface ParseResult {
  chapters: Chapter[];
}

const SYSTEM_PROMPT = `あなたは日本のマンション管理規約の専門パーサーです。

与えられたマンション管理規約のテキストを分析し、条文構造を認識して構造化JSONに変換してください。

## 出力ルール
1. 章（chapter）・条（article）の構造を正確に認識してください
2. 各条文の条番号（articleNum）、タイトル（title）、本文（content）を抽出してください
3. 項・号がある場合は content に含めてください
4. 以下のJSON形式で出力してください（JSON以外のテキストは出力しないでください）

## 出力形式
{
  "chapters": [
    {
      "chapter": 1,
      "title": "総則",
      "articles": [
        {
          "articleNum": "第1条",
          "title": "目的",
          "content": "この規約は、..."
        }
      ]
    }
  ]
}

## 注意事項
- 章立てがない規約の場合は、chapter: 0, title: "本則" として全条文を格納してください
- 附則がある場合は独立した章として扱ってください
- JSON以外の説明文は一切出力しないでください`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body as { text: string };

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "規約テキスト（text）が必要です" },
        { status: 400 }
      );
    }

    if (text.length > 200000) {
      return NextResponse.json(
        { error: "テキストが長すぎます（上限: 200,000文字）" },
        { status: 400 }
      );
    }

    const client = getClaudeClient();

    const message = await client.messages.create({
      model: MODELS.PARSE,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `以下のマンション管理規約テキストを構造化JSONに変換してください。\n\n${text}`,
        },
      ],
    });

    // レスポンスからテキストコンテンツを取得
    const contentBlock = message.content[0];
    if (contentBlock.type !== "text") {
      return NextResponse.json(
        { error: "予期しないレスポンス形式です" },
        { status: 500 }
      );
    }

    // JSONパース
    let parsed: ParseResult;
    try {
      parsed = JSON.parse(contentBlock.text);
    } catch {
      // JSON部分を抽出して再試行
      const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: "規約の構造化に失敗しました。テキスト形式を確認してください" },
          { status: 500 }
        );
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[/api/parse] Error:", error);

    if (error instanceof Error && error.message === "ANTHROPIC_API_KEY is not set") {
      return NextResponse.json(
        { error: "APIキーが設定されていません" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "規約のパース中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
