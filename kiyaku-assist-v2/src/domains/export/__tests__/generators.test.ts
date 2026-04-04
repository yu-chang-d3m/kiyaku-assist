import { describe, test, expect } from "vitest";
import { MarkdownGenerator } from "@/domains/export/generators/markdown";
import { CsvGenerator } from "@/domains/export/generators/csv";
import { ExcelGenerator } from "@/domains/export/generators/excel";
import { PdfGenerator } from "@/domains/export/generators/pdf";
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
    semanticGroup: "general",
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
    semanticGroup: "lifestyle",
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
    semanticGroup: "digitalization",
  },
];

const DEFAULT_OPTIONS: ExportOptions = {
  condoName: "テストマンション",
  format: "markdown",
  includeTimestamp: false,
};

const CHAPTER_ORDER_OPTIONS: ExportOptions = {
  ...DEFAULT_OPTIONS,
  sortOrder: "chapter",
};

// ---------- Markdown ジェネレーター ----------

describe("MarkdownGenerator", () => {
  const generator = new MarkdownGenerator();

  test("デフォルト（優先度順）で Markdown を正しく生成する", () => {
    const result = generator.generate(SAMPLE_ARTICLES, DEFAULT_OPTIONS);

    expect(result.content).toContain("# テストマンション 管理規約改定案");
    expect(result.content).toContain("対象条文数: 3 条");
    // 優先度順: mandatory → recommended の順にセクションヘッダー
    expect(result.content).toContain("## 法的必須の改正事項");
    expect(result.content).toContain("## 推奨される改正事項");
    // 意味グループのサブヘッダー
    expect(result.content).toContain("### 総則・定義");
    expect(result.content).toContain("### 電子化対応");
    expect(result.content).toContain("### 生活利便性");
    // 条文
    expect(result.content).toContain("#### 第3条");
    expect(result.content).toContain("#### 第5条");
    expect(result.content).toContain("#### 第47条");
    expect(result.content).toContain("必須");
    expect(result.content).toContain("採用");
    expect(result.content).toContain("修正採用");
    expect(result.content).toContain("保留");
    expect(result.articleCount).toBe(3);
    expect(result.mimeType).toBe("text/markdown; charset=utf-8");
    expect(result.filename).toContain("テストマンション_規約改定案_");
    expect(result.filename).toMatch(/\.md$/);
  });

  test("章番号順で Markdown を生成する", () => {
    const result = generator.generate(SAMPLE_ARTICLES, CHAPTER_ORDER_OPTIONS);

    expect(result.content).toContain("## 第1章 総則");
    expect(result.content).toContain("## 第6章 管理組合");
    // 優先度セクションヘッダーは含まない
    expect(result.content).not.toContain("法的必須の改正事項");
    expect(result.content).not.toContain("推奨される改正事項");
  });

  test("優先度順のソート: mandatory が recommended より先に出現する", () => {
    const result = generator.generate(SAMPLE_ARTICLES, DEFAULT_OPTIONS);
    const content = result.content as string;

    const mandatoryIdx = content.indexOf("## 法的必須の改正事項");
    const recommendedIdx = content.indexOf("## 推奨される改正事項");
    expect(mandatoryIdx).toBeGreaterThan(-1);
    expect(recommendedIdx).toBeGreaterThan(-1);
    expect(mandatoryIdx).toBeLessThan(recommendedIdx);
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

  test("現行規約がある場合は新旧対照表を表示する", () => {
    const result = generator.generate(SAMPLE_ARTICLES, DEFAULT_OPTIONS);

    expect(result.content).toContain("##### 新旧対照表");
    expect(result.content).toContain("| 現行規約 | 改定案 |");
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
    const content = result.content as string;

    // ドラフトに \n が含まれるが、CSV 内ではスペースに置換されている
    const lines = content.split("\r\n");
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
    const content = result.content as string;

    expect(result.articleCount).toBe(0);
    // ヘッダー行のみ
    const lines = content.split("\r\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
  });
});

// ---------- PDF ジェネレーター ----------

describe("PdfGenerator", () => {
  const generator = new PdfGenerator();

  test("PDF を正しく生成する", async () => {
    const result = await generator.generate(SAMPLE_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "pdf",
    });

    expect(result.articleCount).toBe(3);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filename).toContain("テストマンション_規約改定案_");
    expect(result.filename).toMatch(/\.pdf$/);
    expect(Buffer.from(result.content).byteLength).toBeGreaterThan(0);
    expect(Buffer.from(result.content).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("PDF に Markdown と同じ主要項目を含める", async () => {
    const result = await generator.generate(SAMPLE_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "pdf",
    });

    const { PDFParse } = await import("pdf-parse");
    const pdf = new PDFParse({ data: Buffer.from(result.content) });

    try {
      const text = (await pdf.getText()).text;

      expect(text).toContain("テストマンション");
      expect(text).toContain("第3条");
      expect(text).toContain("新旧対照表");
      expect(text).toContain("同居者への遵守義務を追加");
      expect(text).toContain("標準管理規約第3条");
      expect(text).toContain("置き配ルールの新設");
      expect(text).toContain("改正区分所有法対応");
    } finally {
      await pdf.destroy().catch(() => {});
    }
  });
});

// ---------- sortByPriority 単体テスト ----------

describe("sortByPriority", () => {
  // presentation.ts からインポート
  test("importance → semanticGroup → issueGroup → chapter の順でソートされる", async () => {
    const { sortByPriority } = await import("@/domains/export/presentation");

    const articles: ExportArticle[] = [
      {
        ...SAMPLE_ARTICLES[1], // recommended, lifestyle
        articleNum: "第5条",
      },
      {
        ...SAMPLE_ARTICLES[0], // mandatory, general
        articleNum: "第3条",
      },
      {
        ...SAMPLE_ARTICLES[2], // mandatory, digitalization
        articleNum: "第47条",
      },
    ];

    const sorted = sortByPriority(articles);

    // mandatory が先（digitalization priority=1, general priority=4）
    expect(sorted[0].articleNum).toBe("第47条"); // mandatory + digitalization(1)
    expect(sorted[1].articleNum).toBe("第3条");  // mandatory + general(4)
    expect(sorted[2].articleNum).toBe("第5条");  // recommended + lifestyle(10)
  });

  test("元の配列を変更しない（非破壊的ソート）", async () => {
    const { sortByPriority } = await import("@/domains/export/presentation");

    const original = [...SAMPLE_ARTICLES];
    sortByPriority(SAMPLE_ARTICLES);

    expect(SAMPLE_ARTICLES[0].articleNum).toBe(original[0].articleNum);
    expect(SAMPLE_ARTICLES[1].articleNum).toBe(original[1].articleNum);
    expect(SAMPLE_ARTICLES[2].articleNum).toBe(original[2].articleNum);
  });
});

// ---------- Excel ジェネレーター（レビュー台帳） ----------

/** レビュー台帳テスト用: issueGroup・detailedBackground・aiRecommendation 付きデータ */
const LEDGER_ARTICLES: ExportArticle[] = [
  {
    ...SAMPLE_ARTICLES[0],
    issueGroup: "管理組合法人化",
    detailedBackground: "改正区分所有法により法人化手続きが簡素化された。",
    aiRecommendation: "adopted",
  },
  {
    ...SAMPLE_ARTICLES[1],
    issueGroup: "生活利便性向上",
    detailedBackground: "置き配需要の高まりに対応。",
    aiRecommendation: "modified",
  },
  {
    ...SAMPLE_ARTICLES[2],
    issueGroup: "電子化対応",
    detailedBackground: "電子議決権行使の法的根拠が新設された。",
    aiRecommendation: "adopted",
  },
];

describe("ExcelGenerator（レビュー台帳）", () => {
  const generator = new ExcelGenerator();

  test("xlsx バイナリを正しく生成する", async () => {
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "excel",
    });

    expect(result.content).toBeInstanceOf(Uint8Array);
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(result.filename).toContain("テストマンション");
    expect(result.filename).toContain("レビュー台帳");
    expect(result.filename).toMatch(/\.xlsx$/);
    expect(result.articleCount).toBe(3);
  });

  test("PRD v1.0 レビュー台帳の 14 列ヘッダーを含む", async () => {
    const ExcelJS = await import("exceljs");
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "excel",
    });

    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs の Buffer 型定義と Node 22+ の Buffer<ArrayBufferLike> が非互換
    await workbook.xlsx.load(result.content);
    const ws = workbook.getWorksheet("レビュー台帳")!;

    const headers = ws.getRow(1).values as (string | undefined)[];
    // exceljs の values は 1-indexed（index 0 は undefined）
    const headerTexts = headers.slice(1);

    expect(headerTexts).toEqual([
      "条文番号", "章名", "重要度", "課題グループ",
      "現行条文", "AI改正案", "変更理由", "未変更リスク",
      "AI推奨判断", "レビュー担当", "コメント", "会議結論",
      "対応状況", "最終確定",
    ]);
  });

  test("デフォルトソートが issueGroup → importance → chapter 順になる", async () => {
    const ExcelJS = await import("exceljs");
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "excel",
    });

    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs の Buffer 型定義と Node 22+ の Buffer<ArrayBufferLike> が非互換
    await workbook.xlsx.load(result.content);
    const ws = workbook.getWorksheet("レビュー台帳")!;

    // issueGroup 列（col 4）の値を取得
    const issueGroups: string[] = [];
    for (let r = 2; r <= 4; r++) {
      issueGroups.push(ws.getRow(r).getCell(4).value as string);
    }

    // issueGroup の日本語ソート順:
    // "管理組合法人化" < "生活利便性向上" < "電子化対応"
    expect(issueGroups).toEqual([
      "管理組合法人化",  // 第3条
      "生活利便性向上",  // 第5条
      "電子化対応",      // 第47条
    ]);
  });

  test("章番号順で出力できる", async () => {
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...CHAPTER_ORDER_OPTIONS,
      format: "excel",
    });

    expect(result.articleCount).toBe(3);
    expect((result.content as Uint8Array).length).toBeGreaterThan(0);
  });

  test("空欄列（レビュー担当〜最終確定）は空文字で出力される", async () => {
    const ExcelJS = await import("exceljs");
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "excel",
    });

    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs の Buffer 型定義と Node 22+ の Buffer<ArrayBufferLike> が非互換
    await workbook.xlsx.load(result.content);
    const ws = workbook.getWorksheet("レビュー台帳")!;

    // 行 2 の空欄列（col 10〜14）を検証
    const row = ws.getRow(2);
    for (let col = 10; col <= 14; col++) {
      const val = row.getCell(col).value;
      expect(val === "" || val === null).toBe(true);
    }
  });

  test("detailedBackground が変更理由列に出力される", async () => {
    const ExcelJS = await import("exceljs");
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "excel",
    });

    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs の Buffer 型定義と Node 22+ の Buffer<ArrayBufferLike> が非互換
    await workbook.xlsx.load(result.content);
    const ws = workbook.getWorksheet("レビュー台帳")!;

    // 変更理由は col 7
    const reasons: string[] = [];
    for (let r = 2; r <= 4; r++) {
      reasons.push(ws.getRow(r).getCell(7).value as string);
    }
    expect(reasons).toContain("改正区分所有法により法人化手続きが簡素化された。");
    expect(reasons).toContain("置き配需要の高まりに対応。");
  });

  test("フィルタが適用される", async () => {
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "excel",
      filter: { importances: ["mandatory"] },
    });

    expect(result.articleCount).toBe(2);
  });

  test("凡例シートが含まれる", async () => {
    const ExcelJS = await import("exceljs");
    const result = await generator.generate(LEDGER_ARTICLES, {
      ...DEFAULT_OPTIONS,
      format: "excel",
    });

    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs の Buffer 型定義と Node 22+ の Buffer<ArrayBufferLike> が非互換
    await workbook.xlsx.load(result.content);
    const legendWs = workbook.getWorksheet("凡例");

    expect(legendWs).toBeDefined();
  });
});
