import { describe, test, expect } from "vitest";
import { MarkdownGenerator } from "@/domains/export/generators/markdown";
import { CsvGenerator } from "@/domains/export/generators/csv";
import type { ExportArticle, ExportOptions } from "@/domains/export/types";

// ---------- テストデータ ----------

const SAMPLE_ARTICLES: ExportArticle[] = [
  {
    chapter: 1,
    chapterTitle: "総則",
    articleNum: "第3条",
    original: "区分所有者は規約を遵守しなければならない。",
    draft: "区分所有者は規約を遵守しなければならない。\n2 同居者にも遵守させなければならない。",
    summary: "同居者への遵守義務を追加",
    explanation: "標準管理規約に準拠し、第2項を追加。",
    importance: "mandatory",
    decision: "adopted",
    baseRef: "標準管理規約第3条",
  },
  {
    chapter: 1,
    chapterTitle: "総則",
    articleNum: "第5条",
    original: null,
    draft: "置き配に関する規定。",
    summary: "置き配ルールの新設",
    explanation: "令和6年改正対応。",
    importance: "recommended",
    decision: "modified",
    baseRef: "標準管理規約第18条の2",
  },
  {
    chapter: 6,
    chapterTitle: "管理組合",
    articleNum: "第47条",
    original: null,
    draft: "電子議決権行使に関する規定。",
    summary: "電子議決権の新設",
    explanation: "改正区分所有法対応。",
    importance: "mandatory",
    decision: "pending",
    baseRef: "改正区分所有法第39条第3項",
  },
];

const DEFAULT_OPTIONS: ExportOptions = {
  condoName: "テストマンション",
  format: "markdown",
  includeTimestamp: false,
};

// ---------- Markdown ジェネレーター ----------

describe("MarkdownGenerator", () => {
  const generator = new MarkdownGenerator();

  test("Markdown を正しく生成する", () => {
    const result = generator.generate(SAMPLE_ARTICLES, DEFAULT_OPTIONS);

    expect(result.content).toContain("# テストマンション 管理規約改定案");
    expect(result.content).toContain("対象条文数: 3 条");
    expect(result.content).toContain("## 第1章 総則");
    expect(result.content).toContain("### 第3条");
    expect(result.content).toContain("### 第5条");
    expect(result.content).toContain("## 第6章 管理組合");
    expect(result.content).toContain("### 第47条");
    expect(result.content).toContain("必須");
    expect(result.content).toContain("採用");
    expect(result.content).toContain("修正採用");
    expect(result.content).toContain("保留");
    expect(result.articleCount).toBe(3);
    expect(result.mimeType).toBe("text/markdown; charset=utf-8");
    expect(result.filename).toContain("テストマンション_規約改定案_");
    expect(result.filename).toMatch(/\.md$/);
  });

  test("タイムスタンプを含めることができる", () => {
    const options = { ...DEFAULT_OPTIONS, includeTimestamp: true };
    const result = generator.generate(SAMPLE_ARTICLES, options);

    expect(result.content).toContain("生成日:");
  });

  test("タイムスタンプなしの場合は生成日が含まれない", () => {
    const result = generator.generate(SAMPLE_ARTICLES, DEFAULT_OPTIONS);

    expect(result.content).not.toContain("生成日:");
  });

  test("現行規約がある場合は details タグで表示する", () => {
    const result = generator.generate(SAMPLE_ARTICLES, DEFAULT_OPTIONS);

    expect(result.content).toContain("<details>");
    expect(result.content).toContain("現行規約（参考）");
  });

  test("免責メッセージを含む", () => {
    const result = generator.generate(SAMPLE_ARTICLES, DEFAULT_OPTIONS);

    expect(result.content).toContain("法的助言ではありません");
    expect(result.content).toContain("専門家にご相談ください");
  });

  test("decision フィルタが動作する", () => {
    const options: ExportOptions = {
      ...DEFAULT_OPTIONS,
      filter: { decisions: ["adopted"] },
    };
    const result = generator.generate(SAMPLE_ARTICLES, options);

    expect(result.articleCount).toBe(1);
    expect(result.content).toContain("第3条");
    expect(result.content).not.toContain("第47条");
  });

  test("importance フィルタが動作する", () => {
    const options: ExportOptions = {
      ...DEFAULT_OPTIONS,
      filter: { importances: ["recommended"] },
    };
    const result = generator.generate(SAMPLE_ARTICLES, options);

    expect(result.articleCount).toBe(1);
    expect(result.content).toContain("第5条");
  });

  test("章番号フィルタが動作する", () => {
    const options: ExportOptions = {
      ...DEFAULT_OPTIONS,
      filter: { chapters: [6] },
    };
    const result = generator.generate(SAMPLE_ARTICLES, options);

    expect(result.articleCount).toBe(1);
    expect(result.content).toContain("第47条");
    expect(result.content).not.toContain("第3条");
  });

  test("空の入力でも正しく動作する", () => {
    const result = generator.generate([], DEFAULT_OPTIONS);

    expect(result.articleCount).toBe(0);
    expect(result.content).toContain("対象条文数: 0 条");
  });
});

// ---------- CSV ジェネレーター ----------

describe("CsvGenerator", () => {
  const generator = new CsvGenerator();

  test("CSV を正しく生成する", () => {
    const result = generator.generate(SAMPLE_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "csv",
    });

    expect(result.content).toContain("\uFEFF"); // BOM
    expect(result.content).toContain("章番号,章名,条番号,重要度,判定,改定案,現行規約,要約,解説,準拠先");
    expect(result.articleCount).toBe(3);
    expect(result.mimeType).toBe("text/csv; charset=utf-8");
    expect(result.filename).toContain("テストマンション_規約改定案_");
    expect(result.filename).toMatch(/\.csv$/);
  });

  test("フィールドのダブルクォートがエスケープされる", () => {
    const articles: ExportArticle[] = [
      {
        ...SAMPLE_ARTICLES[0],
        draft: 'テスト"引用"付き',
      },
    ];
    const result = generator.generate(articles, {
      ...DEFAULT_OPTIONS,
      format: "csv",
    });

    expect(result.content).toContain('""引用""');
  });

  test("改行がスペースに置換される", () => {
    const result = generator.generate(SAMPLE_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "csv",
    });

    // ドラフトに \n が含まれるが、CSV 内ではスペースに置換されている
    const lines = result.content.split("\r\n");
    // ヘッダー + 3データ行
    expect(lines.filter((l) => l.length > 0)).toHaveLength(4);
  });

  test("新規追加条文は「（新規追加）」と表示される", () => {
    const result = generator.generate(SAMPLE_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "csv",
    });

    expect(result.content).toContain("（新規追加）");
  });

  test("フィルタが動作する", () => {
    const options: ExportOptions = {
      ...DEFAULT_OPTIONS,
      format: "csv",
      filter: { decisions: ["adopted", "modified"] },
    };
    const result = generator.generate(SAMPLE_ARTICLES, options);

    expect(result.articleCount).toBe(2);
  });

  test("空の入力でも正しく動作する", () => {
    const result = generator.generate([], {
      ...DEFAULT_OPTIONS,
      format: "csv",
    });

    expect(result.articleCount).toBe(0);
    // ヘッダー行のみ
    const lines = result.content.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
  });
});
