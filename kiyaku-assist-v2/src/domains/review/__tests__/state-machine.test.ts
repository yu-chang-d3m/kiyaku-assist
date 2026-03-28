import { describe, test, expect } from "vitest";
import {
  applyEvent,
  createInitialState,
  isValidTransition,
  calculateProgress,
} from "@/domains/review/state-machine";
import type { ReviewArticleState } from "@/domains/review/types";

describe("createInitialState", () => {
  test("初期状態を正しく作成する", () => {
    const state = createInitialState("第3条", "ドラフト本文");

    expect(state.articleNum).toBe("第3条");
    expect(state.decision).toBeNull();
    expect(state.currentDraft).toBe("ドラフト本文");
    expect(state.history).toEqual([]);
    expect(state.memo).toBe("");
  });
});

describe("applyEvent", () => {
  const initialState = createInitialState("第3条", "元のドラフト");

  test("ADOPT イベントで adopted に遷移する", () => {
    const newState = applyEvent(initialState, { type: "ADOPT" });

    expect(newState.decision).toBe("adopted");
    expect(newState.currentDraft).toBe("元のドラフト");
    expect(newState.history).toEqual([]);
  });

  test("MODIFY イベントで modified に遷移し、履歴が追加される", () => {
    const newState = applyEvent(initialState, {
      type: "MODIFY",
      newText: "修正後のテキスト",
      reason: "表現を調整",
    });

    expect(newState.decision).toBe("modified");
    expect(newState.currentDraft).toBe("修正後のテキスト");
    expect(newState.history).toHaveLength(1);
    expect(newState.history[0].before).toBe("元のドラフト");
    expect(newState.history[0].after).toBe("修正後のテキスト");
    expect(newState.history[0].reason).toBe("表現を調整");
    expect(newState.history[0].modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("RESET イベントで pending に遷移する", () => {
    const adopted = applyEvent(initialState, { type: "ADOPT" });
    const reset = applyEvent(adopted, { type: "RESET" });

    expect(reset.decision).toBe("pending");
  });

  test("ADD_MEMO イベントでメモを設定する", () => {
    const newState = applyEvent(initialState, {
      type: "ADD_MEMO",
      memo: "要確認",
    });

    expect(newState.memo).toBe("要確認");
    expect(newState.decision).toBeNull(); // 決定状態は変わらない
  });

  test("複数回の MODIFY で履歴が蓄積される", () => {
    let state = initialState;
    state = applyEvent(state, {
      type: "MODIFY",
      newText: "修正1",
      reason: "理由1",
    });
    state = applyEvent(state, {
      type: "MODIFY",
      newText: "修正2",
      reason: "理由2",
    });

    expect(state.history).toHaveLength(2);
    expect(state.history[0].after).toBe("修正1");
    expect(state.history[1].before).toBe("修正1");
    expect(state.history[1].after).toBe("修正2");
    expect(state.currentDraft).toBe("修正2");
  });

  test("イミュータブルに動作する", () => {
    const newState = applyEvent(initialState, { type: "ADOPT" });

    expect(newState).not.toBe(initialState);
    expect(initialState.decision).toBeNull(); // 元は変更されない
  });
});

describe("isValidTransition", () => {
  test("null（未決定）からはどの状態にも遷移可能", () => {
    expect(isValidTransition(null, "adopted")).toBe(true);
    expect(isValidTransition(null, "modified")).toBe(true);
    expect(isValidTransition(null, "pending")).toBe(true);
  });

  test("pending からはどの状態にも遷移可能", () => {
    expect(isValidTransition("pending", "adopted")).toBe(true);
    expect(isValidTransition("pending", "modified")).toBe(true);
    expect(isValidTransition("pending", null)).toBe(true);
  });

  test("adopted からは pending または null にのみ遷移可能", () => {
    expect(isValidTransition("adopted", "pending")).toBe(true);
    expect(isValidTransition("adopted", null)).toBe(true);
    expect(isValidTransition("adopted", "adopted")).toBe(false);
    expect(isValidTransition("adopted", "modified")).toBe(false);
  });

  test("modified からは pending または null にのみ遷移可能", () => {
    expect(isValidTransition("modified", "pending")).toBe(true);
    expect(isValidTransition("modified", null)).toBe(true);
    expect(isValidTransition("modified", "adopted")).toBe(false);
    expect(isValidTransition("modified", "modified")).toBe(false);
  });
});

describe("calculateProgress", () => {
  test("空の配列では全て 0", () => {
    const progress = calculateProgress([]);

    expect(progress.total).toBe(0);
    expect(progress.adopted).toBe(0);
    expect(progress.modified).toBe(0);
    expect(progress.pending).toBe(0);
    expect(progress.undecided).toBe(0);
    expect(progress.progressPercent).toBe(0);
  });

  test("各状態を正しくカウントする", () => {
    const states: ReviewArticleState[] = [
      createInitialState("第1条", "draft1"),
      { ...createInitialState("第2条", "draft2"), decision: "adopted" },
      { ...createInitialState("第3条", "draft3"), decision: "modified" },
      { ...createInitialState("第4条", "draft4"), decision: "pending" },
      createInitialState("第5条", "draft5"),
    ];

    const progress = calculateProgress(states);

    expect(progress.total).toBe(5);
    expect(progress.adopted).toBe(1);
    expect(progress.modified).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.undecided).toBe(2);
    expect(progress.progressPercent).toBe(40); // 2/5 = 40%
  });

  test("全件 adopted の場合 100%", () => {
    const states: ReviewArticleState[] = [
      { ...createInitialState("第1条", "d1"), decision: "adopted" },
      { ...createInitialState("第2条", "d2"), decision: "adopted" },
    ];

    const progress = calculateProgress(states);
    expect(progress.progressPercent).toBe(100);
  });

  test("modified も進捗に含まれる", () => {
    const states: ReviewArticleState[] = [
      { ...createInitialState("第1条", "d1"), decision: "modified" },
      { ...createInitialState("第2条", "d2"), decision: "modified" },
    ];

    const progress = calculateProgress(states);
    expect(progress.progressPercent).toBe(100);
  });
});
