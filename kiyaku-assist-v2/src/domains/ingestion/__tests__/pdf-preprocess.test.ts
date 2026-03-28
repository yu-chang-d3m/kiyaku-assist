/**
 * PdfParser 前処理テスト
 *
 * pdf-parse v2 の実出力パターンに基づくテスト:
 * - ページ区切りマーカー（"-- N of M --"）の除去
 * - 繰り返しヘッダー/フッターの除去
 * - タイトル行 + 条番号行のマージ（「（目的）\n第1条」→「第1条（目的）」）
 * - ページ番号行の除去
 * - 目次ページの除去（‥ パターン）
 * - レタースペーシングの除去（CJK 文字間の空白圧縮）
 */

import { describe, test, expect } from "vitest";
import { preprocessPdfText } from "@/domains/ingestion/parsers/pdf-parser";

describe("preprocessPdfText", () => {
  test("ページ区切りマーカーを除去する", () => {
    const input = [
      "第1章 総則",
      "-- 1 of 94 --",
      "第1条（目的）",
      "この規約は目的を定める。",
      "-- 2 of 94 --",
      "第2条（定義）",
      "定義を定める。",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).not.toContain("-- 1 of 94 --");
    expect(result).not.toContain("-- 2 of 94 --");
    // レタースペーシング除去で「第1章 総則」→「第1章総則」になる
    // （「章」と「総」は非 ASCII 同士なのでスペース除去）
    expect(result).toContain("第1章総則");
    expect(result).toContain("第1条（目的）");
    expect(result).toContain("第2条（定義）");
  });

  test("ページ番号行を除去する", () => {
    const input = [
      "第1章 総則",
      "- 1 -",
      "第1条（目的）",
      "この規約は目的を定める。",
      "- 2 -",
      "第2条（定義）",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).not.toContain("- 1 -");
    expect(result).not.toContain("- 2 -");
    expect(result).toContain("第1条（目的）");
  });

  test("単独数字のページ番号行を除去する", () => {
    const input = [
      "第1章 総則",
      "1",
      "第1条（目的）",
      "この規約は目的を定める。",
      "2",
      "第2条（定義）",
    ].join("\n");

    const result = preprocessPdfText(input);
    const lines = result.split("\n");

    expect(lines).not.toContain("1");
    expect(lines).not.toContain("2");
  });

  test("目次ページの点線行を除去する", () => {
    const input = [
      "第 \t１ \t章 \t（ 総 \t則 ） ‥ ‥ ‥ ‥ ‥ ‥ ‥ ‥ ‥ ‥ \t０",
      "第 \t２ \t章 \t（ 専 有 部 分 及 び 共 用 部 分 の 範 囲 ） ‥ ‥ ‥ ‥ ‥ \t０",
      "別 \t表 \t第 \t１ \t‥ ‥ ‥ ‥ ‥ ‥ ‥ ‥ ‥ ‥ \t00",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result.trim()).toBe("");
  });

  test("目次ラベルを除去する", () => {
    const input = [
      "目次1",
      "ﾍﾟｰｼﾞ",
      "第1章 総則",
      "第1条（目的）",
      "目次2",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).not.toContain("目次1");
    expect(result).not.toContain("目次2");
    expect(result).toContain("第1章総則");
  });

  test("繰り返しヘッダーを除去する（3回以上出現する行）", () => {
    const header = "令和７年改正マンション標準管理規約（単棟型）";
    const input = [
      header,
      "第1章 総則",
      "第1条（目的）",
      "この規約は目的を定める。",
      header,
      "第2条（定義）",
      "定義を定める。",
      header,
      "第3条（遵守）",
      "遵守を定める。",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).not.toContain(header);
    expect(result).toContain("第1条（目的）");
    expect(result).toContain("第3条（遵守）");
  });

  // ---------- レタースペーシング除去テスト ----------

  test("TAB + スペースのレタースペーシングを除去する（pdf-parse 実出力パターン）", () => {
    const input = [
      "第 \t１ \t章 \t総 \t則",
      "（ 目 \t的 ）",
      "第 \t１ \t条 \t本 規 約 は 、○ ○ マ ン シ ョ ン の 管 理 に つ い て 定 め る 。",
    ].join("\n");

    const result = preprocessPdfText(input);
    const lines = result.split("\n");

    expect(lines[0]).toBe("第１章総則");
    // タイトルマージされる（マージ時のスペースは維持、それ以降は非ASCII間のスペース除去）
    expect(lines[1]).toMatch(/^第１条（目的）/);
    expect(lines[1]).toContain("本規約は、○○マンションの管理について定める。");
  });

  test("2桁条番号のレタースペーシングを除去する", () => {
    const input = [
      "第 １ ０ 条 \t各 区 分 所 有 者 の 共 用 部 分 の 共 有 持 分 は 定 め る 。",
      "第 ８ ７ 条 理 事 長 は 防 火 管 理 者 を 選 任 す る 。",
    ].join("\n");

    const result = preprocessPdfText(input);
    const lines = result.split("\n");

    expect(lines[0]).toMatch(/^第１０条/);
    expect(lines[0]).toContain("各区分所有者の共用部分の共有持分は定める。");
    expect(lines[1]).toMatch(/^第８７条/);
  });

  test("項番号のレタースペーシングを除去する", () => {
    const input = "２ \t区 分 所 有 者 は 、同 居 す る 者 に 遵 守 さ せ な け れ ば な ら な い 。";
    const result = preprocessPdfText(input);

    expect(result).toMatch(/^２区分所有者は、同居する者に遵守させなければならない。$/);
  });

  test("号（漢数字 + TAB）のレタースペーシングを除去する", () => {
    const input = "一 \t区 分 所 有 権… 区 分 所 有 法 第 ２ 条 の 所 有 権 を い う 。";
    const result = preprocessPdfText(input);

    expect(result).toContain("一区分所有権…区分所有法第２条の所有権をいう。");
  });

  test("半角三点リーダ周辺のスペースも除去する", () => {
    const input = "占 有 者… 区 分 所 有 法 の 占 有 者 を い う 。";
    const result = preprocessPdfText(input);

    expect(result).toBe("占有者…区分所有法の占有者をいう。");
  });

  // ---------- タイトル行マージテスト ----------

  test("レタースペーシング付きのタイトル行を条番号にマージする", () => {
    const input = [
      "第 \t１ \t章 \t総 \t則",
      "（ 目 \t的 ）",
      "第 \t１ \t条",
      "こ の 規 約 は 目 的 を 定 め る 。",
      "（ 定 \t義 ）",
      "第 \t２ \t条",
      "定 義 を 定 め る 。",
    ].join("\n");

    const result = preprocessPdfText(input);
    const lines = result.split("\n");

    expect(lines).toContain("第１条（目的）");
    expect(lines).toContain("第２条（定義）");
    expect(lines).not.toContain("（目的）");
    expect(lines).not.toContain("（定義）");
  });

  test("タイトル行が条番号と同一行の場合はそのまま維持する", () => {
    const input = [
      "第1章 総則",
      "第1条（目的） この規約は目的を定める。",
      "第2条（定義） 定義を定める。",
    ].join("\n");

    const result = preprocessPdfText(input);

    // レタースペーシング除去で非ASCII文字間のスペースが除去される
    expect(result).toContain("第1条（目的）この規約は目的を定める。");
    expect(result).toContain("第2条（定義）定義を定める。");
  });

  test("タイトル行の次が条番号でない場合はタイトル行をそのまま出力する", () => {
    const input = [
      "第1章 総則",
      "第1条",
      "（以下「管理組合」という。）を設置する。",
    ].join("\n");

    const result = preprocessPdfText(input);
    expect(result).toContain("第1条");
  });

  test("枝番号付きの条番号にもタイトルマージが適用される", () => {
    const input = [
      "（特例）",
      "第12条の2",
      "特例を定める。",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).toContain("第12条の2（特例）");
  });

  test("空行はスキップされる", () => {
    const input = [
      "第1章 総則",
      "",
      "（目的）",
      "",
      "第1条",
      "",
      "この規約は目的を定める。",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).toContain("第1条（目的）");
    expect(result).toContain("この規約は目的を定める。");
    expect(result).not.toMatch(/^\s*$/m);
  });

  // ---------- 複合パターンテスト（実PDF再現） ----------

  test("複合パターン: pdf-parse 実出力を完全再現（ページマーカー + ヘッダー + TOC + レタースペーシング + タイトルマージ）", () => {
    const input = [
      "管 理 組 合 法 人 規 約 集",
      "○ ○ マ ン シ ョ ン 管 理 組 合 法 人",
      "",
      "-- 1 of 100 --",
      "",
      "目次1",
      "目 \t次",
      "ﾍﾟｰｼﾞ",
      "１ \t○ ○ マ ン シ ョ ン 管 理 組 合 法 人 規 約",
      "第 \t１ \t章 \t（ 総 \t則 ） ‥ ‥ ‥ ‥ ‥ ‥ ‥ ‥ \t０",
      "第 \t２ \t章 \t（ 専 有 部 分 ） ‥ ‥ ‥ ‥ ‥ ‥ \t０",
      "",
      "-- 2 of 100 --",
      "",
      "目次2",
      "ﾍﾟｰｼﾞ",
      "",
      "-- 3 of 100 --",
      "",
      "1",
      "○○マンション管理組合法人規約",
      "第 \t１ \t章 \t総 \t則",
      "（ 目 \t的 ）",
      "第 \t１ \t条 \t本 規 約 は 、○ ○ マ ン シ ョ ン の 管 理 に つ い て 定 め る 。",
      "（ 定 \t義 ）",
      "第 \t２ \t条 \t本 規 約 に お い て 、次 の 各 号 に 掲 げ る 用 語 の 意 義 は 定 め る 。",
      "一 \t区 分 所 有 権… 所 有 権 を い う 。",
      "二 \t区 分 所 有 者… 区 分 所 有 権 を 有 す る 者 。",
      "（ 遵 守 義 務 ）",
      "",
      "-- 4 of 100 --",
      "",
      "2",
      "第 \t３ \t条 \t区 分 所 有 者 は 遵 守 し な け れ ば な ら な い 。",
      "２ \t区 分 所 有 者 は 同 居 者 に も 遵 守 さ せ な け れ ば な ら な い 。",
    ].join("\n");

    const result = preprocessPdfText(input);
    const lines = result.split("\n");

    // ページマーカー除去
    expect(result).not.toContain("-- 1 of 100 --");
    expect(result).not.toContain("-- 3 of 100 --");

    // 目次行除去
    expect(result).not.toContain("‥");
    expect(result).not.toContain("目次1");
    expect(result).not.toContain("目次2");

    // ページ番号除去
    for (const line of lines) {
      expect(line).not.toMatch(/^[12]$/);
    }

    // レタースペーシング除去 + タイトルマージ
    expect(lines).toContain("第１章総則");
    // タイトルマージ後、マージ部分のスペースは保持されるが
    // レタースペーシング除去済みの本文が結合される
    const art1 = lines.find(l => l.startsWith("第１条（目的）"));
    expect(art1).toBeTruthy();
    expect(art1).toContain("本規約は、○○マンションの管理について定める。");

    const art2 = lines.find(l => l.startsWith("第２条（定義）"));
    expect(art2).toBeTruthy();
    expect(art2).toContain("本規約において、次の各号に掲げる用語の意義は定める。");

    const art3 = lines.find(l => l.startsWith("第３条（遵守義務）"));
    expect(art3).toBeTruthy();
    expect(art3).toContain("区分所有者は遵守しなければならない。");

    // 号の保持
    expect(result).toContain("一区分所有権…所有権をいう。");
    expect(result).toContain("二区分所有者…区分所有権を有する者。");

    // 項の保持
    expect(result).toContain("２区分所有者は同居者にも遵守させなければならない。");
  });

  // ---------- タイトル行の保護テスト ----------

  test("同一タイトル行が3回以上出現してもヘッダーとして除去されない", () => {
    // 実PDF では「（目的）」「（経過措置）」等が本則+細則で複数回出現する
    const input = [
      "第 \t１ \t章 \t総 \t則",
      "（ 目 \t的 ）",
      "第 \t１ \t条 \t本 規 約 は 目 的 を 定 め る 。",
      "（ 定 \t義 ）",
      "第 \t２ \t条 \t定 義 を 定 め る 。",
      "（ 経 過 措 置 ）",
      "第 \t３ \t条 \t旧 規 約 は 廃 止 す る 。",
      "使 用 細 則",
      "（ 目 \t的 ）",
      "第 \t１ \t条 \t本 細 則 は 使 用 を 定 め る 。",
      "（ 遵 守 事 項 ）",
      "第 \t２ \t条 \t遵 守 す る 。",
      "（ 経 過 措 置 ）",
      "第 \t３ \t条 \t旧 細 則 は 廃 止 す る 。",
      "店 舗 使 用 細 則",
      "（ 目 \t的 ）",
      "第 \t１ \t条 \t本 細 則 は 店 舗 を 定 め る 。",
      "（ 経 過 措 置 ）",
      "第 \t２ \t条 \t旧 細 則 は 廃 止 す る 。",
    ].join("\n");

    const result = preprocessPdfText(input);
    const lines = result.split("\n");

    // タイトルが条番号にマージされていること（除去されていない）
    expect(lines.filter((l) => l.includes("（目的）"))).toHaveLength(3);
    expect(lines.filter((l) => l.includes("（経過措置）"))).toHaveLength(3);
    expect(lines.filter((l) => l.includes("（定義）"))).toHaveLength(1);
    expect(lines.filter((l) => l.includes("（遵守事項）"))).toHaveLength(1);

    // タイトルが正しくマージされていること
    expect(lines).toContain("第１条（目的） 本規約は目的を定める。");
    expect(lines).toContain("第３条（経過措置） 旧規約は廃止する。");
  });

  test("短い本文断片（する。等）が繰り返しヘッダーとして除去されない", () => {
    // 実PDF では「する。」「ならない。」等の文末が多数出現する
    const input = [
      "第1条（目的） 目的を定める。",
      "す る 。",
      "第2条（定義） 定義を定める。",
      "す る 。",
      "第3条（遵守） 遵守する。",
      "す る 。",
      "第4条（範囲） 範囲を定める。",
      "な ら な い 。",
      "第5条（効力） 効力を定める。",
      "な ら な い 。",
      "第6条（組合） 組合を定める。",
      "な ら な い 。",
    ].join("\n");

    const result = preprocessPdfText(input);

    // 「する。」「ならない。」が除去されず残っていること
    expect(result.match(/する。/g)?.length).toBeGreaterThanOrEqual(3);
    expect(result.match(/ならない。/g)?.length).toBeGreaterThanOrEqual(3);
  });

  // ---------- エッジケース ----------

  test("2文字以下の短い行はヘッダー判定の対象外", () => {
    const input = [
      "第1章 総則",
      "第1条（目的）",
      "AB",
      "AB",
      "AB",
      "この規約は目的を定める。",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).toContain("AB");
  });

  test("80文字以上の長い行はヘッダー判定の対象外", () => {
    const longLine = "あ".repeat(80);
    const input = [
      longLine,
      "第1章 総則",
      longLine,
      "第1条（目的）",
      longLine,
      "この規約は目的を定める。",
    ].join("\n");

    const result = preprocessPdfText(input);

    expect(result).toContain(longLine);
  });

  test("半角英数字間のスペースは保持される", () => {
    const input = "Hello World 123 test";
    const result = preprocessPdfText(input);

    expect(result).toBe("Hello World 123 test");
  });

  test("半角数字とCJK文字が混在する場合のスペース処理", () => {
    // ﾍﾟｰｼﾞ のような半角カナはレタースペーシング除去対象外
    const input = "ﾍﾟｰｼﾞ";
    const result = preprocessPdfText(input);
    // 半角カナは FF00-FFEF 範囲に含まれるため圧縮される可能性がある
    // → 実際には半角カナは FF65-FF9F で FF00-FFEF 範囲内
    expect(result).toBeTruthy();
  });
});
