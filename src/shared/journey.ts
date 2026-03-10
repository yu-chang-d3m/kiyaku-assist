/**
 * ユーザージャーニー定義
 *
 * アプリケーションのステップ構造と遷移ルールを定義する。
 * v1 からの改善点:
 * - JOURNEY_GRAPH による遷移ルールの明示的定義
 * - 文字列ベースの step ID（数値 ID からの移行）
 * - canNavigateTo / getNextSteps ヘルパーの追加
 */

// ---------- ジャーニーグラフ ----------

/** ステップ ID の型 */
export type StepId = keyof typeof JOURNEY_GRAPH;

/**
 * ジャーニーグラフ — ステップ間の遷移ルールを定義
 *
 * - requires: このステップに遷移するために完了が必要な前提ステップ
 * - unlocks: このステップの完了後に遷移可能になるステップ
 */
export const JOURNEY_GRAPH = {
  onboarding: { requires: [], unlocks: ["guide"] },
  guide: { requires: ["onboarding"], unlocks: ["upload"] },
  upload: { requires: ["guide"], unlocks: ["analysis"] },
  analysis: { requires: ["upload"], unlocks: ["review"] },
  review: { requires: ["analysis"], unlocks: ["export", "upload", "guide"] },
  export: { requires: ["review"], unlocks: [] },
} as const;

// ---------- ステップ定義 ----------

/** ジャーニーステップの型 */
export interface JourneyStep {
  /** ステップ ID */
  id: StepId;
  /** 表示ラベル */
  label: string;
  /** ステップの説明文 */
  description: string;
  /** ページパス */
  path: string;
  /** 想定所要時間（分） */
  estimatedMinutes: number;
}

/**
 * ジャーニーステップ定義（順序付き）
 *
 * ユーザーはこの順序でステップを進めていく。
 * 各ステップには想定所要時間とルーティングパスが含まれる。
 */
export const JOURNEY_STEPS: readonly JourneyStep[] = [
  {
    id: "onboarding",
    label: "始める",
    description: "初回登録・属性ヒアリング",
    path: "/onboarding",
    estimatedMinutes: 5,
  },
  {
    id: "guide",
    label: "理解する",
    description: "法改正の概要を学ぶ",
    path: "/guide",
    estimatedMinutes: 15,
  },
  {
    id: "upload",
    label: "現状を把握する",
    description: "現行規約をアップロード",
    path: "/upload",
    estimatedMinutes: 10,
  },
  {
    id: "analysis",
    label: "差分を分析する",
    description: "AIが標準規約と比較",
    path: "/analysis",
    estimatedMinutes: 15,
  },
  {
    id: "review",
    label: "改正案を作る",
    description: "AIがドラフトを生成・レビュー",
    path: "/review",
    estimatedMinutes: 75,
  },
  {
    id: "export",
    label: "合意を形成する",
    description: "説明資料・議案を生成",
    path: "/export",
    estimatedMinutes: 10,
  },
] as const;

// ---------- ナビゲーションヘルパー ----------

/**
 * 完了済みステップから、指定したステップに遷移可能かどうかを判定する
 *
 * @param completedSteps - 完了済みのステップ ID の配列
 * @param targetStep - 遷移先のステップ ID
 * @returns 遷移可能な場合は true
 */
export function canNavigateTo(
  completedSteps: StepId[],
  targetStep: StepId,
): boolean {
  // onboarding は常にアクセス可能
  if (targetStep === "onboarding") return true;

  const requirements = JOURNEY_GRAPH[targetStep].requires;
  return requirements.every((req) => completedSteps.includes(req as StepId));
}

/**
 * 指定したステップを完了した後に遷移可能になるステップを取得する
 *
 * @param currentStep - 現在完了したステップ ID
 * @returns 遷移可能になるステップ ID の配列
 */
export function getNextSteps(currentStep: StepId): StepId[] {
  return JOURNEY_GRAPH[currentStep].unlocks as unknown as StepId[];
}

/**
 * ステップ ID からステップ定義を取得する
 *
 * @param stepId - ステップ ID
 * @returns ステップ定義、見つからない場合は undefined
 */
export function getStepById(stepId: StepId): JourneyStep | undefined {
  return JOURNEY_STEPS.find((step) => step.id === stepId);
}

/**
 * ステップインデックス（0始まり）からステップ ID を取得する
 *
 * v1 互換: currentStep（数値）→ StepId の変換に使用
 *
 * @param index - ステップインデックス（0-5）
 * @returns ステップ ID、範囲外の場合は undefined
 */
export function getStepIdByIndex(index: number): StepId | undefined {
  return JOURNEY_STEPS[index]?.id;
}

/**
 * 全ステップの想定所要時間の合計を分単位で返す
 */
export function getTotalEstimatedMinutes(): number {
  return JOURNEY_STEPS.reduce((sum, step) => sum + step.estimatedMinutes, 0);
}
