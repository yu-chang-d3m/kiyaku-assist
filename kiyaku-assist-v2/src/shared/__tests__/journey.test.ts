import { describe, test, expect } from "vitest";
import {
  canNavigateTo,
  getNextSteps,
  getStepById,
  getStepIdByIndex,
  getTotalEstimatedMinutes,
  JOURNEY_STEPS,
  JOURNEY_GRAPH,
} from "@/shared/journey";

describe("JOURNEY_STEPS", () => {
  test("6つのステップが定義されている", () => {
    expect(JOURNEY_STEPS).toHaveLength(6);
  });

  test("全ステップに必須フィールドがある", () => {
    for (const step of JOURNEY_STEPS) {
      expect(step.id).toBeTruthy();
      expect(step.label).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.path).toMatch(/^\//);
      expect(step.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  test("ステップ ID が JOURNEY_GRAPH のキーと一致する", () => {
    const graphKeys = Object.keys(JOURNEY_GRAPH);
    for (const step of JOURNEY_STEPS) {
      expect(graphKeys).toContain(step.id);
    }
  });
});

describe("canNavigateTo", () => {
  test("onboarding は常にアクセス可能", () => {
    expect(canNavigateTo([], "onboarding")).toBe(true);
    expect(canNavigateTo(["onboarding"], "onboarding")).toBe(true);
  });

  test("前提ステップが完了していれば遷移可能", () => {
    expect(canNavigateTo(["onboarding"], "guide")).toBe(true);
    expect(canNavigateTo(["onboarding", "guide"], "upload")).toBe(true);
    expect(canNavigateTo(["onboarding", "guide", "upload"], "analysis")).toBe(true);
  });

  test("前提ステップが未完了なら遷移不可", () => {
    expect(canNavigateTo([], "guide")).toBe(false);
    expect(canNavigateTo(["onboarding"], "upload")).toBe(false);
    expect(canNavigateTo(["onboarding", "guide"], "analysis")).toBe(false);
  });

  test("review にはすべての前提が必要", () => {
    expect(
      canNavigateTo(["onboarding", "guide", "upload", "analysis"], "review")
    ).toBe(true);
    expect(
      canNavigateTo(["onboarding", "guide", "upload"], "review")
    ).toBe(false);
  });

  test("export には review が必要", () => {
    expect(
      canNavigateTo(
        ["onboarding", "guide", "upload", "analysis", "review"],
        "export"
      )
    ).toBe(true);
    expect(
      canNavigateTo(["onboarding", "guide", "upload", "analysis"], "export")
    ).toBe(false);
  });
});

describe("getNextSteps", () => {
  test("onboarding の次は guide", () => {
    expect(getNextSteps("onboarding")).toEqual(["guide"]);
  });

  test("review の次は export, upload, guide", () => {
    const nextSteps = getNextSteps("review");
    expect(nextSteps).toContain("export");
    expect(nextSteps).toContain("upload");
    expect(nextSteps).toContain("guide");
  });

  test("export の次はない", () => {
    expect(getNextSteps("export")).toEqual([]);
  });
});

describe("getStepById", () => {
  test("存在するステップを返す", () => {
    const step = getStepById("onboarding");
    expect(step).toBeDefined();
    expect(step?.label).toBe("始める");
    expect(step?.path).toBe("/onboarding");
  });

  test("全ステップを取得できる", () => {
    for (const s of JOURNEY_STEPS) {
      expect(getStepById(s.id)).toBeDefined();
    }
  });
});

describe("getStepIdByIndex", () => {
  test("インデックスからステップ ID を取得する", () => {
    expect(getStepIdByIndex(0)).toBe("onboarding");
    expect(getStepIdByIndex(1)).toBe("guide");
    expect(getStepIdByIndex(5)).toBe("export");
  });

  test("範囲外のインデックスは undefined", () => {
    expect(getStepIdByIndex(-1)).toBeUndefined();
    expect(getStepIdByIndex(6)).toBeUndefined();
  });
});

describe("getTotalEstimatedMinutes", () => {
  test("全ステップの合計時間を返す", () => {
    const total = getTotalEstimatedMinutes();
    const expected = JOURNEY_STEPS.reduce(
      (sum, step) => sum + step.estimatedMinutes,
      0
    );
    expect(total).toBe(expected);
    expect(total).toBeGreaterThan(0);
  });
});
