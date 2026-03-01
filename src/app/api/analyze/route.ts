import { NextRequest, NextResponse } from "next/server";
import { getClaudeClient, MODELS } from "@/lib/claude";
import { readFile } from "fs/promises";
import path from "path";

// ギャップ分析結果の型定義
interface GapItem {
  articleNum: string;
  title: string;
  status: "missing" | "outdated" | "ok" | "extra";
  importance: "high" | "medium" | "low";
  summary: string;
  category: string;
}

interface AnalyzeResult {
  gaps: GapItem[];
}

// 基準データ（標準管理規約）を読み込む
async function loadStandardRules(): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), "data", "mlit_r7_standard_rules.md");
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch {
    // ファイルが存在しない場合はプレースホルダーを返す
    return "【基準データ未設定】令和7年改正 標準管理規約（単棟型）のデータは現在準備中です。";
  }
}

function buildSystemPrompt(standardRules: string, chapterNum: number): string {
  return `あなたはマンション管理規約のギャップ分析の専門家です。

## あなたの役割
ユーザーのマンション管理規約（章単位）を、国交省の標準管理規約（令和7年改正）と比較し、
差異（ギャップ）を特定して報告してください。

## 基準データ（標準管理規約）
以下は令和7年改正の標準管理規約です。第${chapterNum}章に関連する部分を重点的に参照してください。

---
${standardRules}
---

## 分析の観点
1. **missing**: 標準管理規約にはあるがユーザー規約に欠けている条文
2. **outdated**: 存在するが改正法に対応していない・内容が古い条文
3. **ok**: 標準管理規約と整合している条文
4. **extra**: 標準管理規約にはないユーザー独自の条文（問題ではない場合もある）

## 重要度の判断基準
- **high**: 区分所有法改正で必須対応が求められる項目、または法的リスクがある項目
- **medium**: 標準管理規約で推奨される項目、実務上対応が望ましい項目
- **low**: 文言の微修正、表現の統一など

## カテゴリ分類
条文の内容に応じて以下のカテゴリを付与してください:
- 総則・定義
- 専有部分・共用部分
- 管理組合運営
- 総会・理事会
- 会計・管理費
- 修繕・長期計画
- 禁止事項・生活ルール
- その他

## 出力形式（JSON以外のテキストは出力しないでください）
{
  "gaps": [
    {
      "articleNum": "第○条",
      "title": "条文タイトル",
      "status": "missing|outdated|ok|extra",
      "importance": "high|medium|low",
      "summary": "差異の概要説明（1〜2文）",
      "category": "カテゴリ名"
    }
  ]
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userRules, chapterNum } = body as {
      userRules: string;
      chapterNum: number;
    };

    if (!userRules || typeof userRules !== "string") {
      return NextResponse.json(
        { error: "ユーザー規約テキスト（userRules）が必要です" },
        { status: 400 }
      );
    }

    if (!chapterNum || typeof chapterNum !== "number") {
      return NextResponse.json(
        { error: "章番号（chapterNum）が必要です" },
        { status: 400 }
      );
    }

    const standardRules = await loadStandardRules();
    const client = getClaudeClient();

    const message = await client.messages.create({
      model: MODELS.ANALYSIS,
      max_tokens: 8192,
      system: buildSystemPrompt(standardRules, chapterNum),
      messages: [
        {
          role: "user",
          content: `以下はユーザーのマンション管理規約 第${chapterNum}章の内容です。標準管理規約との差異を分析してください。\n\n${userRules}`,
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
    let parsed: AnalyzeResult;
    try {
      parsed = JSON.parse(contentBlock.text);
    } catch {
      const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: "ギャップ分析結果の解析に失敗しました" },
          { status: 500 }
        );
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("[/api/analyze] Error:", error);

    if (error instanceof Error && error.message === "ANTHROPIC_API_KEY is not set") {
      return NextResponse.json(
        { error: "APIキーが設定されていません" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "ギャップ分析中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
