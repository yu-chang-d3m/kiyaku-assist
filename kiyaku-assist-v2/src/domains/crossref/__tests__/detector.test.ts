import { describe, it, expect } from "vitest";
import { detectReferences, buildCrossRefGraph } from "../detector";

describe("detectReferences", () => {
  it("基本的な条文参照を検出する", () => {
    const text = "第3条に定める規約を遵守しなければならない。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetArticleNum).toBe("第3条");
  });

  it("項付き参照を検出する", () => {
    const text = "第47条第5項に規定する場合において。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetArticleNum).toBe("第47条");
    expect(refs[0].targetParagraph).toBe("第5項");
  });

  it("号付き参照を検出する", () => {
    const text = "第12条第3項第2号に該当する場合。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetArticleNum).toBe("第12条");
    expect(refs[0].targetParagraph).toBe("第3項");
    expect(refs[0].targetItem).toBe("第2号");
  });

  it("「条の2」形式を検出する", () => {
    const text = "第21条の2に定める事項。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetArticleNum).toBe("第21条の2");
  });

  it("全角数字を半角に正規化する", () => {
    const text = "第４７条第５項ただし書の規定に基づき。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetArticleNum).toBe("第47条");
    expect(refs[0].targetParagraph).toBe("第5項");
  });

  it("複数の参照を検出する", () => {
    const text =
      "第3条の規定にかかわらず、第12条第2項及び第25条に定めるところにより。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.targetArticleNum)).toEqual([
      "第3条",
      "第12条",
      "第25条",
    ]);
  });

  it("自己参照は除外する", () => {
    const text = "本条（第5条）の規定に基づき、第10条に定める事項。";
    const refs = detectReferences("第5条", text);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetArticleNum).toBe("第10条");
  });

  it("重複参照は除外する", () => {
    const text = "第3条及び第3条の規定により。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(1);
  });

  it("参照がないテキストでは空配列を返す", () => {
    const text = "区分所有者は、共同の利益に反する行為をしてはならない。";
    const refs = detectReferences("第1条", text);
    expect(refs).toHaveLength(0);
  });
});

describe("buildCrossRefGraph", () => {
  const articles = [
    { articleNum: "第1条", text: "第3条及び第5条に定める。" },
    { articleNum: "第3条", text: "第1条の規定に基づき。" },
    { articleNum: "第5条", text: "第99条の規定に従い。" },
  ];

  it("参照グラフを正しく構築する", () => {
    const graph = buildCrossRefGraph(articles);
    expect(graph.stats.totalReferences).toBe(4);
    expect(graph.outgoing.get("第1条")).toHaveLength(2);
    expect(graph.incoming.get("第3条")).toHaveLength(1);
  });

  it("参照先不在（broken）を検出する", () => {
    const graph = buildCrossRefGraph(articles);
    expect(graph.broken).toHaveLength(1);
    expect(graph.broken[0].targetArticleNum).toBe("第99条");
    expect(graph.stats.brokenReferences).toBe(1);
  });

  it("unique article pairs を正しくカウントする", () => {
    const graph = buildCrossRefGraph(articles);
    // 第1条→第3条, 第1条→第5条, 第3条→第1条, 第5条→第99条
    expect(graph.stats.uniqueArticlePairs).toBe(4);
  });

  it("空の入力では空のグラフを返す", () => {
    const graph = buildCrossRefGraph([]);
    expect(graph.stats.totalReferences).toBe(0);
    expect(graph.broken).toHaveLength(0);
  });
});
