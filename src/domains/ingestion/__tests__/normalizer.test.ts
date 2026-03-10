import { describe, test, expect } from "vitest";
import {
  normalizeFullWidthNumbers,
  normalizeParentheses,
  normalizeWhitespace,
  normalizeArticleNum,
  normalizeParseResult,
  articleNumToSortKey,
  sortArticles,
} from "@/domains/ingestion/normalizer";
import type { ParseResult, ParsedArticle } from "@/domains/ingestion/types";

describe("normalizeFullWidthNumbers", () => {
  test("全角数字を半角に変換する", () => {
    expect(normalizeFullWidthNumbers("第３条")).toBe("第3条");
    expect(normalizeFullWidthNumbers("１２３")).toBe("123");
    expect(normalizeFullWidthNumbers("０")).toBe("0");
  });

  test("半角数字はそのまま", () => {
    expect(normalizeFullWidthNumbers("第3条")).toBe("第3条");
  });

  test("数字が含まれない文字列はそのまま", () => {
    expect(normalizeFullWidthNumbers("総則")).toBe("総則");
  });
});

describe("normalizeParentheses", () => {
  test("全角カッコを半角に変換する", () => {
    expect(normalizeParentheses("（目的）")).toBe("(目的)");
    expect(normalizeParentheses("第３条（規約の遵守義務）")).toBe(
      "第３条(規約の遵守義務)"
    );
  });

  test("半角カッコはそのまま", () => {
    expect(normalizeParentheses("(目的)")).toBe("(目的)");
  });
});

describe("normalizeWhitespace", () => {
  test("連続する半角スペースを1つに圧縮", () => {
    expect(normalizeWhitespace("a  b   c")).toBe("a b c");
  });

  test("全角スペースも対象", () => {
    expect(normalizeWhitespace("a　b　　c")).toBe("a b c");
  });

  test("前後の空白を除去", () => {
    expect(normalizeWhitespace("  hello  ")).toBe("hello");
  });

  test("タブと改行も対象", () => {
    expect(normalizeWhitespace("a\t\nb")).toBe("a b");
  });
});

describe("normalizeArticleNum", () => {
  test("全角数字を含む条番号を正規化する", () => {
    expect(normalizeArticleNum("第３条")).toBe("第3条");
    expect(normalizeArticleNum("第１２条の２")).toBe("第12条の2");
  });
});

describe("articleNumToSortKey", () => {
  test("基本的な条番号をソートキーに変換", () => {
    expect(articleNumToSortKey("第3条")).toEqual([3, 0]);
    expect(articleNumToSortKey("第12条")).toEqual([12, 0]);
  });

  test("枝番号付きの条番号を変換", () => {
    expect(articleNumToSortKey("第12条の2")).toEqual([12, 2]);
    expect(articleNumToSortKey("第3条の5")).toEqual([3, 5]);
  });

  test("全角数字にも対応", () => {
    expect(articleNumToSortKey("第３条")).toEqual([3, 0]);
    expect(articleNumToSortKey("第１２条の２")).toEqual([12, 2]);
  });

  test("パースできない形式は [0, 0] を返す", () => {
    expect(articleNumToSortKey("附則")).toEqual([0, 0]);
    expect(articleNumToSortKey("")).toEqual([0, 0]);
  });
});

describe("sortArticles", () => {
  const createArticle = (articleNum: string): ParsedArticle => ({
    chapter: 1,
    chapterTitle: "テスト",
    articleNum,
    title: "",
    body: "",
    paragraphs: [],
  });

  test("条番号順にソートする", () => {
    const articles = [
      createArticle("第12条"),
      createArticle("第3条"),
      createArticle("第1条"),
    ];
    const sorted = sortArticles(articles);
    expect(sorted.map((a) => a.articleNum)).toEqual([
      "第1条",
      "第3条",
      "第12条",
    ]);
  });

  test("枝番号付きの条文を正しくソート", () => {
    const articles = [
      createArticle("第3条の2"),
      createArticle("第3条"),
      createArticle("第4条"),
      createArticle("第3条の1"),
    ];
    const sorted = sortArticles(articles);
    expect(sorted.map((a) => a.articleNum)).toEqual([
      "第3条",
      "第3条の1",
      "第3条の2",
      "第4条",
    ]);
  });

  test("元の配列を変更しない（イミュータブル）", () => {
    const articles = [createArticle("第3条"), createArticle("第1条")];
    const original = [...articles];
    sortArticles(articles);
    expect(articles).toEqual(original);
  });
});

describe("normalizeParseResult", () => {
  test("ParseResult 全体を正規化する", () => {
    const input: ParseResult = {
      articles: [
        {
          chapter: 1,
          chapterTitle: "　総則　",
          articleNum: "第３条",
          title: "規約の  遵守義務",
          body: "条文　本文",
          paragraphs: [
            {
              num: 2,
              body: "第２項の  本文",
              items: [{ num: 1, body: "号の　本文" }],
            },
          ],
        },
      ],
      metadata: {
        totalArticles: 1,
        totalChapters: 1,
        chapterNames: ["　総則　"],
        parsedAt: "2024-01-01T00:00:00.000Z",
        sourceFormat: "text",
        warnings: [],
      },
    };

    const result = normalizeParseResult(input);

    expect(result.articles[0].articleNum).toBe("第3条");
    expect(result.articles[0].chapterTitle).toBe("総則");
    expect(result.articles[0].title).toBe("規約の 遵守義務");
    expect(result.articles[0].body).toBe("条文 本文");
    expect(result.articles[0].paragraphs[0].body).toBe("第２項の 本文");
    expect(result.articles[0].paragraphs[0].items[0].body).toBe("号の 本文");
    expect(result.metadata.chapterNames[0]).toBe("総則");
  });
});
