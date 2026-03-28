import { describe, it, expect } from "vitest";
import { updateReferences, batchUpdateReferences } from "../updater";
import { buildInsertRenumberMap, buildDeleteRenumberMap } from "../renumber";

describe("updateReferences", () => {
  it("条文参照を置換する", () => {
    const map = new Map([["第3条", "第4条"]]);
    const { updatedText, changeCount } = updateReferences(
      "第3条に定める規約を遵守しなければならない。",
      map,
    );
    expect(updatedText).toBe("第4条に定める規約を遵守しなければならない。");
    expect(changeCount).toBe(1);
  });

  it("複数の参照を置換する", () => {
    const map = new Map([
      ["第3条", "第4条"],
      ["第5条", "第6条"],
    ]);
    const { updatedText, changeCount } = updateReferences(
      "第3条及び第5条に定める事項。",
      map,
    );
    expect(updatedText).toBe("第4条及び第6条に定める事項。");
    expect(changeCount).toBe(2);
  });

  it("全角数字の参照も置換する", () => {
    const map = new Map([["第47条", "第48条"]]);
    const { updatedText, changeCount } = updateReferences(
      "第４７条の規定に基づき。",
      map,
    );
    expect(updatedText).toBe("第４８条の規定に基づき。");
    expect(changeCount).toBe(1);
  });

  it("マップにない参照はそのまま", () => {
    const map = new Map([["第3条", "第4条"]]);
    const { updatedText, changeCount } = updateReferences(
      "第5条に定める事項。",
      map,
    );
    expect(updatedText).toBe("第5条に定める事項。");
    expect(changeCount).toBe(0);
  });

  it("「条の2」形式の参照を置換する", () => {
    const map = new Map([["第21条の2", "第22条の2"]]);
    const { updatedText } = updateReferences(
      "第21条の2に定める。",
      map,
    );
    expect(updatedText).toBe("第22条の2に定める。");
  });
});

describe("buildInsertRenumberMap", () => {
  const existing = ["第1条", "第2条", "第3条", "第4条", "第5条"];

  it("挿入点より後の条文を繰り下げる", () => {
    const map = buildInsertRenumberMap(existing, "第2条", 1);
    expect(map.get("第3条")).toBe("第4条");
    expect(map.get("第4条")).toBe("第5条");
    expect(map.get("第5条")).toBe("第6条");
    expect(map.has("第1条")).toBe(false);
    expect(map.has("第2条")).toBe(false);
  });

  it("複数条文挿入で正しく繰り下げる", () => {
    const map = buildInsertRenumberMap(existing, "第3条", 2);
    expect(map.get("第4条")).toBe("第6条");
    expect(map.get("第5条")).toBe("第7条");
  });
});

describe("buildDeleteRenumberMap", () => {
  const existing = ["第1条", "第2条", "第3条", "第4条", "第5条"];

  it("削除された条文より後を繰り上げる", () => {
    const map = buildDeleteRenumberMap(existing, ["第3条"]);
    expect(map.get("第4条")).toBe("第3条");
    expect(map.get("第5条")).toBe("第4条");
    expect(map.has("第1条")).toBe(false);
    expect(map.has("第2条")).toBe(false);
  });

  it("複数条文削除で正しく繰り上げる", () => {
    const map = buildDeleteRenumberMap(existing, ["第2条", "第4条"]);
    expect(map.get("第3条")).toBe("第2条");
    expect(map.get("第5条")).toBe("第3条");
  });
});

describe("batchUpdateReferences", () => {
  it("複数条文のテキストをバッチ更新する", () => {
    const articles = [
      { articleNum: "第1条", text: "第3条に従う。" },
      { articleNum: "第3条", text: "第1条の規定。" },
    ];
    const map = new Map([["第3条", "第4条"]]);
    const result = batchUpdateReferences(articles, map);
    expect(result[0].text).toBe("第4条に従う。");
    expect(result[0].changeCount).toBe(1);
    expect(result[1].articleNum).toBe("第4条"); // 条文番号自体も更新
  });
});
