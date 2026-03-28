/**
 * タクソノミー定数のテスト
 *
 * 12グループの一意性、必須フィールドの存在、マップの整合性を検証する。
 */

import { describe, it, expect } from "vitest";
import {
  SEMANTIC_GROUPS,
  SEMANTIC_GROUP_MAP,
  SEMANTIC_GROUP_LABELS,
} from "../constants";
import { SEMANTIC_GROUP_IDS } from "../types";

describe("SEMANTIC_GROUPS", () => {
  it("12グループが定義されている", () => {
    expect(SEMANTIC_GROUPS.length).toBe(12);
  });

  it("グループ ID が一意である", () => {
    const ids = SEMANTIC_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("SEMANTIC_GROUP_IDS と一致する", () => {
    const constantIds = SEMANTIC_GROUPS.map((g) => g.id).sort();
    const typeIds = [...SEMANTIC_GROUP_IDS].sort();
    expect(constantIds).toEqual(typeIds);
  });

  it("priority が一意である", () => {
    const priorities = SEMANTIC_GROUPS.map((g) => g.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it("priority が 1 から 12 の範囲である", () => {
    for (const group of SEMANTIC_GROUPS) {
      expect(group.priority).toBeGreaterThanOrEqual(1);
      expect(group.priority).toBeLessThanOrEqual(12);
    }
  });

  it("全グループに label, description がある", () => {
    for (const group of SEMANTIC_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.description.length).toBeGreaterThan(0);
    }
  });

  it("全グループに少なくとも1つのサブテーマがある", () => {
    for (const group of SEMANTIC_GROUPS) {
      expect(group.subThemes.length).toBeGreaterThan(0);
    }
  });

  it("サブテーマ ID がグループ内で一意である", () => {
    for (const group of SEMANTIC_GROUPS) {
      const subIds = group.subThemes.map((s) => s.id);
      expect(new Set(subIds).size).toBe(subIds.length);
    }
  });

  it("サブテーマ ID がグループ間でも一意である", () => {
    const allSubIds = SEMANTIC_GROUPS.flatMap((g) =>
      g.subThemes.map((s) => s.id),
    );
    expect(new Set(allSubIds).size).toBe(allSubIds.length);
  });
});

describe("SEMANTIC_GROUP_MAP", () => {
  it("12件のエントリがある", () => {
    expect(SEMANTIC_GROUP_MAP.size).toBe(12);
  });

  it("各 ID で正しいグループが取得できる", () => {
    for (const group of SEMANTIC_GROUPS) {
      const found = SEMANTIC_GROUP_MAP.get(group.id);
      expect(found).toBeDefined();
      expect(found!.label).toBe(group.label);
    }
  });
});

describe("SEMANTIC_GROUP_LABELS", () => {
  it("12件のラベルがある", () => {
    expect(Object.keys(SEMANTIC_GROUP_LABELS).length).toBe(12);
  });

  it("ラベルが空文字でない", () => {
    for (const [, label] of Object.entries(SEMANTIC_GROUP_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
