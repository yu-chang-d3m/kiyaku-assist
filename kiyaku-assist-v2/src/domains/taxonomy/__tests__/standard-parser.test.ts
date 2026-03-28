/**
 * 標準管理規約パーサーのテスト
 *
 * R7 標準管理規約 Markdown（data/mlit/mlit_standard_rules_r7_2025.md）を
 * 読み込んでパースし、条文抽出・章構造・コメント紐付けの正確性を検証する。
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseStandardRules, getParseStats } from "../standard-parser";
import type { StandardArticle } from "../types";

// R7 標準管理規約ファイルのパス（プロジェクトルートからの相対パス）
const R7_FILE = path.resolve(
  __dirname,
  "../../../../../data/mlit/mlit_standard_rules_r7_2025.md",
);

describe("parseStandardRules", () => {
  let articles: StandardArticle[];

  beforeAll(() => {
    const markdown = fs.readFileSync(R7_FILE, "utf-8");
    articles = parseStandardRules(markdown);
  });

  it("条文を抽出できる（70条以上）", () => {
    // R7 標準管理規約は第1条〜第72条 + 附則第1条 = 73条以上
    expect(articles.length).toBeGreaterThanOrEqual(70);
  });

  it("第1条（目的）が正しくパースされる", () => {
    const article1 = articles.find((a) => a.articleNum === "第1条");
    expect(article1).toBeDefined();
    expect(article1!.title).toBe("目的");
    expect(article1!.chapter).toBe(1);
    expect(article1!.chapterTitle).toBe("総則");
    expect(article1!.body).toContain("管理又は使用に関する事項");
  });

  it("第2条（定義）が正しくパースされる", () => {
    const article2 = articles.find((a) => a.articleNum === "第2条");
    expect(article2).toBeDefined();
    expect(article2!.title).toBe("定義");
    // 電磁的記録、電磁的方法の定義を含む
    expect(article2!.body).toContain("電磁的記録");
    expect(article2!.body).toContain("電磁的方法");
  });

  it("第2条にコメントが紐付けられている", () => {
    const article2 = articles.find((a) => a.articleNum === "第2条");
    expect(article2).toBeDefined();
    expect(article2!.comment).toContain("電磁的方法の具体例");
  });

  it("「条の2」形式の条文をパースできる", () => {
    // R7 では第19条の2、第24条の2 等が存在
    const articles19_2 = articles.filter((a) =>
      a.articleNum.includes("条の"),
    );
    expect(articles19_2.length).toBeGreaterThan(0);
  });

  it("8章構成を検出する", () => {
    const stats = getParseStats(articles);
    // 第1章〜第8章 + 附則 = 9セクション
    expect(stats.chapters.length).toBeGreaterThanOrEqual(8);

    // 章タイトルの確認
    const chapterTitles = stats.chapters.map((c) => c.title);
    expect(chapterTitles).toContain("総則");
  });

  it("コメント付き条文が50件以上ある", () => {
    const stats = getParseStats(articles);
    // コメントは60件あるが、全条文にコメントがあるわけではない
    expect(stats.articlesWithComments).toBeGreaterThanOrEqual(50);
  });

  it("全条文に chapter, chapterTitle が設定されている", () => {
    for (const article of articles) {
      expect(article.chapter).toBeGreaterThan(0);
      expect(article.chapterTitle).not.toBe("");
    }
  });

  it("全条文に body が設定されている", () => {
    for (const article of articles) {
      expect(article.body.length).toBeGreaterThan(0);
    }
  });

  it("semanticGroup のデフォルト値が 'misc' である", () => {
    for (const article of articles) {
      expect(article.semanticGroup).toBe("misc");
    }
  });

  it("ページヘッダーが本文に混入していない", () => {
    for (const article of articles) {
      expect(article.body).not.toContain(
        "令和７年改正マンション標準管理規約",
      );
    }
  });

  it("ページ番号が本文に混入していない", () => {
    for (const article of articles) {
      // "- 1 -" 等のページ番号パターン
      expect(article.body).not.toMatch(/^\s*-\s*\d+\s*-\s*$/m);
    }
  });

  it("重複する条文番号がない", () => {
    const nums = articles.map((a) => a.articleNum);
    const unique = new Set(nums);
    expect(unique.size).toBe(nums.length);
  });
});
