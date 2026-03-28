import { describe, test, expect } from "vitest";
import { TextParser } from "@/domains/ingestion/parsers/text-parser";

const parser = new TextParser();

describe("TextParser", () => {
  test("章・条の基本的な構造を抽出する", async () => {
    const input = `第1章 総則
第1条（目的）
この規約は、テストマンションの管理について定める。
第2条（定義）
この規約において、次の用語の意義はそれぞれ定めるとおりとする。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].articleNum).toBe("第1条");
    expect(result.articles[0].title).toBe("目的");
    expect(result.articles[0].chapter).toBe(1);
    expect(result.articles[0].chapterTitle).toBe("総則");
    expect(result.articles[1].articleNum).toBe("第2条");
    expect(result.metadata.totalArticles).toBe(2);
    expect(result.metadata.totalChapters).toBe(1);
    expect(result.metadata.chapterNames).toEqual(["総則"]);
  });

  test("項番号を検出する", async () => {
    const input = `第1章 総則
第3条（遵守義務）
区分所有者は規約を遵守しなければならない。
2 区分所有者は同居者に遵守させなければならない。
3 占有者もこの規約を遵守しなければならない。`;

    const result = await parser.parse(input);
    const article = result.articles[0];

    expect(article.paragraphs).toHaveLength(2);
    expect(article.paragraphs[0].num).toBe(2);
    expect(article.paragraphs[1].num).toBe(3);
  });

  test("号（漢数字）を検出する", async () => {
    const input = `第1章 総則
第2条（定義）
この規約において、次の各号に掲げる用語の意義はそれぞれ定めるところによる。
一 区分所有権 建物の区分所有等に関する法律に規定する区分所有権をいう。
二 区分所有者 同法に規定する区分所有者をいう。
三 占有者 区分所有者以外の専有部分の占有者をいう。`;

    const result = await parser.parse(input);
    const article = result.articles[0];

    // 号が暗黙の第1項に含まれる
    expect(article.paragraphs).toHaveLength(1);
    expect(article.paragraphs[0].items).toHaveLength(3);
    expect(article.paragraphs[0].items[0].num).toBe(1);
    expect(article.paragraphs[0].items[1].num).toBe(2);
    expect(article.paragraphs[0].items[2].num).toBe(3);
  });

  test("複数の章を正しく処理する", async () => {
    const input = `第1章 総則
第1条（目的）
目的を定める。
第2章 専有部分等の範囲
第7条（専有部分の範囲）
専有部分の範囲を定める。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].chapter).toBe(1);
    expect(result.articles[0].chapterTitle).toBe("総則");
    expect(result.articles[1].chapter).toBe(2);
    expect(result.articles[1].chapterTitle).toBe("専有部分等の範囲");
    expect(result.metadata.totalChapters).toBe(2);
  });

  test("全角数字の章番号・条番号に対応する", async () => {
    const input = `第１章 総則
第１条（目的）
目的を定める。`;

    const result = await parser.parse(input);

    expect(result.articles[0].chapter).toBe(1);
    expect(result.articles[0].articleNum).toBe("第１条");
  });

  test("空の入力では空の結果を返す", async () => {
    const result = await parser.parse("");

    expect(result.articles).toHaveLength(0);
    expect(result.metadata.totalArticles).toBe(0);
    expect(result.metadata.totalChapters).toBe(0);
  });

  test("章なしの条文には警告が出る", async () => {
    const input = `第1条（目的）
目的を定める。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].chapter).toBe(0);
    expect(result.metadata.warnings.length).toBeGreaterThan(0);
    expect(result.metadata.warnings[0]).toContain("章番号を検出できません");
  });

  test("sourceFormat が text である", async () => {
    const result = await parser.parse("第1章 総則\n第1条（目的）\ntest");
    expect(result.metadata.sourceFormat).toBe("text");
  });

  test("parsedAt が ISO 8601 形式である", async () => {
    const result = await parser.parse("第1章 総則\n第1条（目的）\ntest");
    expect(() => new Date(result.metadata.parsedAt)).not.toThrow();
    expect(result.metadata.parsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ---------- PDF 抽出テキスト対応テスト ----------

  test("字間スペース入りの条番号を正しくパースする（PDF抽出パターン）", async () => {
    const input = `第 1 章 総則
第 1 条（目的）
この規約は目的を定める。
第 2 条（定義）
定義を定める。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(2);
    // スペースが除去された正規化済み条番号
    expect(result.articles[0].articleNum).toBe("第1条");
    expect(result.articles[0].title).toBe("目的");
    expect(result.articles[0].chapter).toBe(1);
    expect(result.articles[1].articleNum).toBe("第2条");
  });

  test("半角数字の条番号をパースする（PDF抽出で10条以降は半角が多い）", async () => {
    const input = `第1章 総則
第10条（専有部分の範囲）
専有部分の範囲を定める。
第11条（共用部分の範囲）
共用部分の範囲を定める。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].articleNum).toBe("第10条");
    expect(result.articles[0].title).toBe("専有部分の範囲");
    expect(result.articles[1].articleNum).toBe("第11条");
  });

  test("枝番号付き条文を正しくパースする", async () => {
    const input = `第1章 総則
第12条の2（特例）
特例を定める。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].articleNum).toBe("第12条の2");
    expect(result.articles[0].title).toBe("特例");
  });

  test("字間スペース入りの枝番号も正しくパースする", async () => {
    const input = `第1章 総則
第 12 条 の 2（特例）
特例を定める。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].articleNum).toBe("第12条の2");
  });

  test("スペース区切りの2桁数字を正しく処理する（第 1 0 条 → 第10条）", async () => {
    const input = `第1章 総則
第 1 0 条（共有持分）
各区分所有者の共用部分の共有持分を定める。
第 1 1 条（分割請求の禁止）
区分所有者は分割を請求できない。
第 8 7 条（防火管理者）
理事長は防火管理者を選任する。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(3);
    expect(result.articles[0].articleNum).toBe("第10条");
    expect(result.articles[0].title).toBe("共有持分");
    expect(result.articles[1].articleNum).toBe("第11条");
    expect(result.articles[2].articleNum).toBe("第87条");
  });

  test("全角スペース区切りの2桁数字を正しく処理する（第 １ ０ 条 → 第１０条）", async () => {
    const input = `第１章 総則
第 １ ０ 条（共有持分）
各区分所有者の共有持分を定める。
第 ８ ７ 条（防火管理者）
理事長は防火管理者を選任する。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].articleNum).toBe("第１０条");
    expect(result.articles[0].title).toBe("共有持分");
    expect(result.articles[1].articleNum).toBe("第８７条");
  });

  test("大規模な規約（87条+）を正しくパースする", async () => {
    // 87条分のテストデータを生成
    const lines: string[] = [];
    const chapters = [
      { num: 1, title: "総則", articles: [1, 2, 3, 4, 5, 6] },
      { num: 2, title: "専有部分等の範囲", articles: [7, 8, 9] },
      { num: 3, title: "敷地及び共用部分等の共有", articles: [10, 11, 12, 13, 14, 15] },
      { num: 4, title: "用法", articles: [16, 17, 18, 19] },
      { num: 5, title: "管理", articles: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] },
      { num: 6, title: "管理組合", articles: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64] },
      { num: 7, title: "会計", articles: [65, 66, 67, 68, 69, 70, 71, 72, 73, 74] },
      { num: 8, title: "雑則", articles: [75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87] },
    ];

    for (const ch of chapters) {
      lines.push(`第${ch.num}章 ${ch.title}`);
      for (const artNum of ch.articles) {
        lines.push(`第${artNum}条（テスト条文${artNum}）`);
        lines.push(`テスト条文${artNum}の本文。`);
        if (artNum % 3 === 0) {
          lines.push(`2 テスト条文${artNum}の第2項。`);
        }
      }
    }

    const result = await parser.parse(lines.join("\n"));

    expect(result.articles).toHaveLength(87);
    expect(result.metadata.totalArticles).toBe(87);
    expect(result.metadata.totalChapters).toBe(8);
    expect(result.articles[0].articleNum).toBe("第1条");
    expect(result.articles[86].articleNum).toBe("第87条");

    // 3の倍数の条文には第2項がある
    const article3 = result.articles.find(a => a.articleNum === "第3条");
    expect(article3?.paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  test("前処理済みPDF形式（タイトルがマージ済み）のテキストをパースする", async () => {
    // preprocessPdfText の出力を模擬
    const input = `第１章 総則
第１条（目的）
この規約は、○○マンション管理組合法人の管理について定める。
第２条（定義）
この規約において、次の各号に掲げる用語の意義はそれぞれ定めるところによる。
一 区分所有権 建物の区分所有等に関する法律に規定する区分所有権をいう。
二 区分所有者 同法に規定する区分所有者をいう。
三 占有者 区分所有者以外の専有部分の占有者をいう。
第３条（遵守義務）
区分所有者は、円滑な共同生活を維持するため、この規約を遵守しなければならない。
2 区分所有者は、その同居人に対してもこの規約を遵守させなければならない。
3 区分所有者及びその同居人は、対象物件の使用方法につき、法令の定め及びこの規約に従わなければならない。`;

    const result = await parser.parse(input);

    expect(result.articles).toHaveLength(3);
    expect(result.articles[0].articleNum).toBe("第１条");
    expect(result.articles[0].title).toBe("目的");
    expect(result.articles[1].articleNum).toBe("第２条");
    expect(result.articles[1].title).toBe("定義");

    // 第2条に号が3つある
    const art2 = result.articles[1];
    expect(art2.paragraphs).toHaveLength(1);
    expect(art2.paragraphs[0].items).toHaveLength(3);

    // 第3条に項が2つある（2項、3項）
    const art3 = result.articles[2];
    expect(art3.paragraphs).toHaveLength(2);
    expect(art3.paragraphs[0].num).toBe(2);
    expect(art3.paragraphs[1].num).toBe(3);
  });

  // ---------- preprocessPdfText 通過後のパターン（レタースペーシング除去済み） ----------

  test("レタースペーシング除去済みの全87条テキストをパースする", async () => {
    // preprocessPdfText を通過した後の形式（レタースペーシング除去済み）
    const lines: string[] = [];
    const chapters = [
      { num: 1, title: "総則", articles: [1, 2, 3, 4, 5, 6] },
      { num: 2, title: "専有部分及び共用部分の範囲", articles: [7, 8, 9] },
      { num: 3, title: "敷地及び共用部分等の共有", articles: [10, 11, 12, 13, 14, 15] },
      { num: 4, title: "用法", articles: [16, 17, 18, 19] },
      { num: 5, title: "管理", articles: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] },
      { num: 6, title: "管理組合法人", articles: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64] },
      { num: 7, title: "会計", articles: [65, 66, 67, 68, 69, 70, 71, 72, 73, 74] },
      { num: 8, title: "雑則", articles: [75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87] },
    ];

    for (const ch of chapters) {
      lines.push(`第${ch.num}章${ch.title}`);
      for (const artNum of ch.articles) {
        lines.push(`第${artNum}条（テスト条文${artNum}）`);
        lines.push(`テスト条文${artNum}の本文。`);
      }
    }

    const result = await parser.parse(lines.join("\n"));

    expect(result.articles).toHaveLength(87);
    expect(result.metadata.totalArticles).toBe(87);
    expect(result.metadata.totalChapters).toBe(8);
    expect(result.metadata.chapterNames).toEqual([
      "総則",
      "専有部分及び共用部分の範囲",
      "敷地及び共用部分等の共有",
      "用法",
      "管理",
      "管理組合法人",
      "会計",
      "雑則",
    ]);
    expect(result.articles[0].articleNum).toBe("第1条");
    expect(result.articles[86].articleNum).toBe("第87条");

    // 章の割り当て
    expect(result.articles[0].chapter).toBe(1);
    expect(result.articles[6].chapter).toBe(2); // 第7条
    expect(result.articles[86].chapter).toBe(8); // 第87条
  });
});
