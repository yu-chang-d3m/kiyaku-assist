import { describe, test, expect } from "vitest";
import {
  getHistory,
  getLatestModification,
  getModificationCount,
  formatHistorySummary,
  historyToStringArray,
} from "@/domains/review/history";
import type { ReviewArticleState, ModificationEntry } from "@/domains/review/types";

function createStateWithHistory(
  articleNum: string,
  entries: ModificationEntry[],
): ReviewArticleState {
  return {
    articleNum,
    decision: entries.length > 0 ? "modified" : null,
    currentDraft: entries.length > 0 ? entries[entries.length - 1].after : "初期ドラフト",
    history: entries,
    memo: "",
  };
}

const ENTRY_1: ModificationEntry = {
  before: "元のテキスト",
  after: "修正1",
  reason: "表現を改善",
  modifiedAt: "2024-06-01T10:00:00.000Z",
};

const ENTRY_2: ModificationEntry = {
  before: "修正1",
  after: "修正2",
  reason: "法的表現を調整",
  modifiedAt: "2024-06-02T15:30:00.000Z",
};

describe("getHistory", () => {
  test("修正履歴を新しい順で返す", () => {
    const state = createStateWithHistory("第3条", [ENTRY_1, ENTRY_2]);
    const history = getHistory(state);

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(ENTRY_2); // 新しい方が先
    expect(history[1]).toEqual(ENTRY_1);
  });

  test("履歴が空の場合は空配列を返す", () => {
    const state = createStateWithHistory("第3条", []);
    expect(getHistory(state)).toEqual([]);
  });

  test("元の配列を変更しない（イミュータブル）", () => {
    const state = createStateWithHistory("第3条", [ENTRY_1, ENTRY_2]);
    const history = getHistory(state);
    history.reverse(); // 元に戻す操作をしても元は変わらない
    expect(state.history[0]).toEqual(ENTRY_1); // 元の順序は保持
  });
});

describe("getLatestModification", () => {
  test("直近の修正を返す", () => {
    const state = createStateWithHistory("第3条", [ENTRY_1, ENTRY_2]);
    const latest = getLatestModification(state);

    expect(latest).toEqual(ENTRY_2);
  });

  test("履歴が空の場合は null を返す", () => {
    const state = createStateWithHistory("第3条", []);
    expect(getLatestModification(state)).toBeNull();
  });
});

describe("getModificationCount", () => {
  test("修正回数を返す", () => {
    const state = createStateWithHistory("第3条", [ENTRY_1, ENTRY_2]);
    expect(getModificationCount(state)).toBe(2);
  });

  test("修正なしの場合は 0", () => {
    const state = createStateWithHistory("第3条", []);
    expect(getModificationCount(state)).toBe(0);
  });
});

describe("formatHistorySummary", () => {
  test("修正履歴のサマリーを生成する", () => {
    const state = createStateWithHistory("第3条", [ENTRY_1, ENTRY_2]);
    const summary = formatHistorySummary(state);

    expect(summary).toContain("第3条 の修正履歴");
    expect(summary).toContain("全 2 件");
    expect(summary).toContain("表現を改善");
    expect(summary).toContain("法的表現を調整");
    expect(summary).toContain("修正前:");
    expect(summary).toContain("修正後:");
  });

  test("履歴が空の場合のメッセージ", () => {
    const state = createStateWithHistory("第3条", []);
    const summary = formatHistorySummary(state);

    expect(summary).toBe("修正履歴はありません。");
  });
});

describe("historyToStringArray", () => {
  test("修正履歴を文字列配列に変換する", () => {
    const state = createStateWithHistory("第3条", [ENTRY_1]);
    const arr = historyToStringArray(state);

    expect(arr).toHaveLength(1);
    expect(arr[0]).toContain("2024-06-01");
    expect(arr[0]).toContain("表現を改善");
    expect(arr[0]).toContain("修正1");
  });

  test("空の履歴では空配列", () => {
    const state = createStateWithHistory("第3条", []);
    expect(historyToStringArray(state)).toEqual([]);
  });
});
