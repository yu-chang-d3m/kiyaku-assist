/**
 * 改正案生成エンジン
 *
 * 標準条文 + マンション属性コンテキストから
 * 「このマンション用」にカスタマイズされた改正案テキストを生成する。
 *
 * 既存の drafter.ts（汎用ドラフト生成）とは別に、
 * Firestore の標準条文データを直接活用する特化版。
 */

import type {
  ReformDraftRequest,
  ReformDraftOutput,
  ReformProgressCallback,
} from "./reform-types";
import {
  callWithStructuredOutput,
  callWithRetry,
  MODELS,
} from "@/shared/ai/claude";
import { logger } from "@/shared/observability/logger";

// ---------- ツール定義 ----------

const REFORM_DRAFT_TOOL = {
  name: "reform_draft",
  description:
    "マンション管理規約の改正案を生成する。標準管理規約をベースに、当該マンションの属性に合わせてカスタマイズした条文テキストと解説を返す。",
  input_schema: {
    type: "object" as const,
    properties: {
      reformText: {
        type: "string",
        description:
          "改正案条文の全文。「第X条 ...」の形式。当該マンションの法人格・規模に合わせて調整する。",
      },
      summary: {
        type: "string",
        description: "改正内容の要約（100文字以内）",
      },
      explanation: {
        type: "string",
        description:
          "改正理由・解説（理事会での説明用。法改正の趣旨、標準管理規約との対比を含む）",
      },
      detailedBackground: {
        type: "string",
        description:
          "詳細な改正背景（改正区分所有法の経緯、国交省の検討会での議論、実務上の課題）",
      },
      impactOnResidents: {
        type: "string",
        description: "住民生活への具体的な影響（何が変わるか、メリット・注意点）",
      },
      riskIfUnchanged: {
        type: "string",
        description: "改正しなかった場合のリスク（法的リスク、実務上の不便）",
      },
      transitionalMeasure: {
        type: "string",
        description: "経過措置の要否と内容（既存の権利関係への配慮）",
      },
      issueGroup: {
        type: "string",
        description:
          "課題グループ名（例: 「電子化対応」「所有者不明対策」「総会運営の合理化」）",
      },
    },
    required: [
      "reformText",
      "summary",
      "explanation",
      "detailedBackground",
      "impactOnResidents",
      "riskIfUnchanged",
      "transitionalMeasure",
      "issueGroup",
    ],
  },
};

// ---------- プロンプト ----------

function buildSystemPrompt(req: ReformDraftRequest): string {
  const condoDesc = [
    `マンション名: ${req.condoContext.condoName}`,
    `法人格: ${req.condoContext.condoType === "corporate" ? "管理組合法人" : req.condoContext.condoType === "non-corporate" ? "権利能力なき社団" : "不明"}`,
    `規模: ${req.condoContext.unitCount === "small" ? "小規模（〜30戸）" : req.condoContext.unitCount === "medium" ? "中規模（31〜100戸）" : req.condoContext.unitCount === "large" ? "大規模（101〜300戸）" : "超大規模（301戸〜）"}`,
    req.condoContext.buildingAge
      ? `築年数: ${req.condoContext.buildingAge}年`
      : null,
    req.condoContext.location ? `立地: ${req.condoContext.location}` : null,
    req.condoContext.managementCompany
      ? `管理会社: ${req.condoContext.managementCompany}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `あなたはマンション管理規約の改正に精通した専門家（マンション管理士 + 弁護士）です。
改正区分所有法（2026年4月施行）および令和7年改正標準管理規約に基づき、
以下のマンション用にカスタマイズされた改正案条文を生成してください。

## 対象マンション
${condoDesc}

## 改正案生成のルール
1. 標準管理規約の条文をベースにしつつ、マンションの法人格・規模に合わせて調整する
2. 管理組合法人の場合は「管理者」→「理事長」など法人格に合わせた用語を使う
3. 条文番号は標準管理規約のものを使用（ユーザー規約の条文番号は参考情報）
4. 経過措置が必要な場合は具体的な措置内容を記載する
5. 改正理由は理事会メンバーが理解できる平易な言葉で記載する

## 出力
reform_draft ツールを呼び出して結果を返してください。`;
}

function buildUserMessage(req: ReformDraftRequest): string {
  const parts = [
    `## 改正対象`,
    `- 意味グループ: ${req.semanticGroup}`,
    `- ギャップ種類: ${req.gapType}`,
    `- 重要度: ${req.importance}`,
    `- ギャップ概要: ${req.gapSummary}`,
    ``,
    `## 標準管理規約 ${req.standardArticleNum}`,
    `### 条文本文`,
    req.standardBody.slice(0, 1000),
    req.standardBody.length > 1000 ? "…（以下略）" : "",
  ];

  if (req.standardComment) {
    parts.push(
      ``,
      `### コメント（解説）`,
      req.standardComment.slice(0, 500),
      req.standardComment.length > 500 ? "…（以下略）" : "",
    );
  }

  if (req.currentText) {
    parts.push(
      ``,
      `## 現行規約 ${req.articleNum}`,
      req.currentText.slice(0, 500),
      req.currentText.length > 500 ? "…（以下略）" : "",
    );
  } else {
    parts.push(``, `## 現行規約`, `条文なし（新規追加が必要）`);
  }

  return parts.join("\n");
}

// ---------- パブリック API ----------

/**
 * 1条文の改正案を生成する
 */
export async function generateReformDraft(
  req: ReformDraftRequest,
): Promise<ReformDraftOutput> {
  const result = await callWithStructuredOutput<ReformDraftOutput>({
    model: MODELS.ANALYSIS,
    system: buildSystemPrompt(req),
    userMessage: buildUserMessage(req),
    tool: REFORM_DRAFT_TOOL,
    maxTokens: 4096,
  });
  return result;
}

/**
 * 複数条文の改正案を並列生成する
 *
 * 重要度順にソートし、2並列で処理する。
 * 失敗した条文は1件ずつリトライする。
 */
export async function batchGenerateReformDrafts(
  requests: ReformDraftRequest[],
  onProgress?: ReformProgressCallback,
): Promise<Map<string, ReformDraftOutput>> {
  const results = new Map<string, ReformDraftOutput>();

  // 重要度順にソート（mandatory > recommended > optional）
  const priorityOrder = { mandatory: 0, recommended: 1, optional: 2 };
  const sorted = [...requests].sort(
    (a, b) => priorityOrder[a.importance] - priorityOrder[b.importance],
  );

  const CONCURRENCY = 2;
  const DELAY_MS = 800;

  logger.info(
    { totalRequests: sorted.length },
    "改正案バッチ生成開始",
  );

  for (let i = 0; i < sorted.length; i += CONCURRENCY) {
    const batch = sorted.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map((req) =>
        callWithRetry(() => generateReformDraft(req)),
      ),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const req = batch[j];

      if (result.status === "fulfilled") {
        results.set(req.articleNum, result.value);
      } else {
        // 失敗時: 単独リトライ
        logger.warn(
          { articleNum: req.articleNum, error: result.reason },
          "改正案生成失敗、リトライ",
        );
        try {
          await new Promise((r) => setTimeout(r, 3000));
          const retryResult = await callWithRetry(() =>
            generateReformDraft(req),
          );
          results.set(req.articleNum, retryResult);
        } catch (err) {
          logger.error(
            { articleNum: req.articleNum, err },
            "改正案リトライも失敗",
          );
        }
      }

      onProgress?.({
        completed: results.size,
        total: sorted.length,
        articleNum: req.articleNum,
      });
    }

    // レート制限対策
    if (i + CONCURRENCY < sorted.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  logger.info(
    { generated: results.size, total: sorted.length },
    "改正案バッチ生成完了",
  );

  return results;
}
