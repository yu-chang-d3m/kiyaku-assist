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
});
