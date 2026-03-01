/** ユーザージャーニーのステップ定義 */
export const JOURNEY_STEPS = [
  {
    id: 0,
    label: "始める",
    description: "初回登録・属性ヒアリング",
    estimatedMinutes: 5,
    path: "/onboarding",
  },
  {
    id: 1,
    label: "理解する",
    description: "法改正の概要を学ぶ",
    estimatedMinutes: 15,
    path: "/guide",
  },
  {
    id: 2,
    label: "現状を把握する",
    description: "現行規約をアップロード",
    estimatedMinutes: 10,
    path: "/upload",
  },
  {
    id: 3,
    label: "差分を分析する",
    description: "AIが標準規約と比較",
    estimatedMinutes: 15,
    path: "/analysis",
  },
  {
    id: 4,
    label: "改正案を作る",
    description: "AIがドラフトを生成・レビュー",
    estimatedMinutes: 75,
    path: "/review",
  },
  {
    id: 5,
    label: "合意を形成する",
    description: "説明資料・議案を生成",
    estimatedMinutes: 10,
    path: "/export",
  },
] as const;

export type JourneyStep = (typeof JOURNEY_STEPS)[number];
export type StepId = JourneyStep["id"];
