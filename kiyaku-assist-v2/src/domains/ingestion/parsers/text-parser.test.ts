/**
 * TextParser のテスト
 *
 * 管理規約の様々なフォーマットを正しくパースできるか検証する。
 * 特に条文検出の正確性（全件漏れなく検出すること）を重視。
 */

import { describe, it, expect } from "vitest";
import { TextParser } from "./text-parser";

const parser = new TextParser();

describe("TextParser", () => {
  describe("条文検出パターン", () => {
    it("条番号のみの行を検出する", async () => {
      const input = `第1条
この規約は目的を定める。
第2条
定義を定める。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].articleNum).toBe("第1条");
      expect(result.articles[1].articleNum).toBe("第2条");
    });

    it("条番号＋括弧タイトルのみの行を検出する", async () => {
      const input = `第1条（目的）
この規約は目的を定める。
第2条（定義）
定義を定める。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].title).toBe("目的");
      expect(result.articles[1].title).toBe("定義");
    });

    it("条番号＋括弧タイトル＋本文が同一行にある場合を検出する", async () => {
      const input = `第1条（目的） この規約は、マンションの管理又は使用に関する事項を定めることを目的とする。
第2条（定義） この規約において、次の各号に掲げる用語の意義は当該各号に定めるところによる。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].articleNum).toBe("第1条");
      expect(result.articles[0].title).toBe("目的");
      expect(result.articles[0].body).toContain("この規約は、マンションの管理又は使用に関する事項を定めること");
      expect(result.articles[1].articleNum).toBe("第2条");
      expect(result.articles[1].title).toBe("定義");
    });

    it("条番号＋本文（タイトルなし）が同一行にある場合を検出する", async () => {
      const input = `第1条 この規約は目的を定める。
第2条 定義を定める。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].articleNum).toBe("第1条");
      expect(result.articles[0].title).toBe("");
      expect(result.articles[0].body).toBe("この規約は目的を定める。");
    });

    it("枝番号の条文を検出する（第3条の2）", async () => {
      const input = `第3条（義務）
義務を定める。
第3条の2（特例）
特例を定める。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[1].articleNum).toBe("第3条の2");
      expect(result.articles[1].title).toBe("特例");
    });

    it("全角数字の条番号を検出する", async () => {
      const input = `第１条（目的） この規約は目的を定める。
第２条（定義） 定義を定める。
第１０条（管理） 管理を定める。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(3);
      expect(result.articles[0].articleNum).toBe("第１条");
      expect(result.articles[2].articleNum).toBe("第１０条");
    });

    it("全角括弧のタイトルを検出する", async () => {
      const input = `第1条（目的） 目的を定める。
第2条(定義) 定義を定める。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].title).toBe("目的");
      expect(result.articles[1].title).toBe("定義");
    });
  });

  describe("章の検出", () => {
    it("章をまたぐ条文に正しい章番号を付与する", async () => {
      const input = `第1章 総則
第1条（目的） 目的を定める。
第2条（定義） 定義を定める。
第2章 管理
第3条（管理） 管理を定める。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(3);
      expect(result.articles[0].chapter).toBe(1);
      expect(result.articles[0].chapterTitle).toBe("総則");
      expect(result.articles[2].chapter).toBe(2);
      expect(result.articles[2].chapterTitle).toBe("管理");
    });
  });

  describe("項・号の検出", () => {
    it("項番号付きの本文を検出する", async () => {
      const input = `第1条（目的）
この規約は目的を定める。
2 前項の目的を達成するために必要な事項を定める。
3 この規約の変更は総会の決議による。`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].paragraphs).toHaveLength(2);
      expect(result.articles[0].paragraphs[0].num).toBe(2);
      expect(result.articles[0].paragraphs[1].num).toBe(3);
    });

    it("号（漢数字）を検出する", async () => {
      const input = `第2条（定義）
この規約において、次の各号に掲げる用語の意義は当該各号に定めるところによる。
一 区分所有者
二 占有者`;
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(1);
      // 号が暗黙の第1項に追加される
      const para = result.articles[0].paragraphs[0];
      expect(para).toBeDefined();
      expect(para.items).toHaveLength(2);
      expect(para.items[0].num).toBe(1);
      expect(para.items[1].num).toBe(2);
    });
  });

  describe("実際の管理規約フォーマット（複合テスト）", () => {
    it("タイトルが独立行のフォーマット（旧式）を正しくパースする", async () => {
      // 一部の規約では「（目的）」がタイトル行として独立している
      const input = `第1章 総則
（目的）
第1条 この規約は、マンションの管理又は使用に関する事項等について定めることを目的とする。
（定義）
第2条 この規約において、次の各号に掲げる用語の意義は、当該各号に定めるところによる。
一 区分所有権
二 区分所有者`;
      const result = await parser.parse(input);
      // 「（目的）」行は条文として検出されない（第N条 で始まらないため）
      // 第1条と第2条が検出される
      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].articleNum).toBe("第1条");
      expect(result.articles[0].body).toContain("この規約は、マンション");
      expect(result.articles[1].articleNum).toBe("第2条");
    });

    it("大量の条文（80条以上）を漏れなく検出する", async () => {
      // 80条分のテストデータを生成
      const lines: string[] = [];
      lines.push("第1章 総則");
      for (let i = 1; i <= 80; i++) {
        lines.push(`第${i}条（第${i}条の規定） この条文は第${i}条の内容を定める。`);
      }
      const input = lines.join("\n");
      const result = await parser.parse(input);
      expect(result.articles).toHaveLength(80);
      expect(result.articles[0].articleNum).toBe("第1条");
      expect(result.articles[79].articleNum).toBe("第80条");
    });
  });
});
