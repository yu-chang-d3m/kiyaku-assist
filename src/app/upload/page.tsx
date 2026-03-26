"use client";

/**
 * アップロードページ — 現行規約のアップロード
 *
 * テキスト入力（textarea）またはドラッグ&ドロップで管理規約を読み込み、
 * callParse() で構造化データに変換し、結果を確認してから次のステップへ進む。
 *
 * v1 からの改善点:
 * - v2 の ParseResult 型に対応（フラット articles 配列 + metadata）
 * - StepId が文字列ベースに移行
 * - import パスを v2 の @/shared/* に統一
 * - デモデータで試す機能を実装
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { callParse, callParseFile, saveParsedBylawsRemote, syncCurrentStep } from "@/shared/api-client";
import type { ParseResult } from "@/domains/ingestion/types";
import { saveParsedBylaws, loadProjectId } from "@/shared/store";
import { AuthGuard } from "@/shared/auth/auth-guard";
import { cn } from "@/lib/utils";

// ---------- ファイル形式判定 ----------

/** 対応するファイル拡張子と MIME タイプ */
const SUPPORTED_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "text/plain": "テキスト",
};

/** 拡張子からファイル種別を判定する */
function getFileTypeLabel(file: File): string | null {
  // MIME タイプで判定
  if (SUPPORTED_FILE_TYPES[file.type]) return SUPPORTED_FILE_TYPES[file.type];
  // 拡張子フォールバック
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "Word";
  if (ext === "txt") return "テキスト";
  return null;
}

/** ファイルがバイナリ形式（PDF/Word）かどうか */
function isBinaryFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "pdf" ||
    ext === "docx"
  );
}

// ---------- 型定義 ----------

type UploadState = "idle" | "uploading" | "parsing" | "confirming" | "error";

/** 章ごとにグルーピングされた表示用データ */
interface ChapterGroup {
  chapter: number;
  title: string;
  articleCount: number;
}

// ---------- デモデータ ----------

const DEMO_PARSE_RESULT: ParseResult = {
  articles: [
    // 第1章 総則
    ...[
      {
        articleNum: "第1条",
        title: "目的",
        body: "この規約は、○○マンションの管理又は使用に関する事項等について定めることにより、区分所有者の共同の利益を増進し、良好な住環境を確保することを目的とする。",
        paragraphs: [
          { num: 1, body: "この規約は、○○マンションの管理又は使用に関する事項等について定めることにより、区分所有者の共同の利益を増進し、良好な住環境を確保することを目的とする。", items: [] },
        ],
      },
      {
        articleNum: "第2条",
        title: "定義",
        body: "この規約において、次の各号に掲げる用語の意義は、それぞれ当該各号に定めるところによる。",
        paragraphs: [
          { num: 1, body: "この規約において、次の各号に掲げる用語の意義は、それぞれ当該各号に定めるところによる。", items: [] },
          { num: 2, body: "一　区分所有権　建物の区分所有等に関する法律第2条第1項に規定する区分所有権をいう。", items: [] },
          { num: 3, body: "二　区分所有者　建物の区分所有等に関する法律第2条第2項に規定する区分所有者をいう。", items: [] },
          { num: 4, body: "三　占有者　区分所有者以外の専有部分の占有者をいう。", items: [] },
          { num: 5, body: "四　専有部分　区分所有権の目的たる建物の部分をいう。", items: [] },
          { num: 6, body: "五　共用部分　専有部分以外の建物の部分、専有部分に属しない建物の附属物及び規約により共用部分とされた附属の建物をいう。", items: [] },
        ],
      },
      {
        articleNum: "第3条",
        title: "規約及び総会の決議の遵守義務",
        body: "区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。",
        paragraphs: [
          { num: 1, body: "区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。", items: [] },
          { num: 2, body: "区分所有者は、同居する者に対してこの規約及び総会の決議を遵守させなければならない。", items: [] },
        ],
      },
      {
        articleNum: "第4条",
        title: "対象物件の範囲",
        body: "この規約の対象となる物件の範囲は、別表第1に記載された敷地、建物及び附属施設とする。",
        paragraphs: [
          { num: 1, body: "この規約の対象となる物件の範囲は、別表第1に記載された敷地、建物及び附属施設とする。", items: [] },
        ],
      },
      {
        articleNum: "第5条",
        title: "規約及び総会の決議の効力",
        body: "この規約及び総会の決議は、区分所有者の包括承継人及び特定承継人に対しても、その効力を有する。",
        paragraphs: [
          { num: 1, body: "この規約及び総会の決議は、区分所有者の包括承継人及び特定承継人に対しても、その効力を有する。", items: [] },
          { num: 2, body: "占有者は、対象物件の使用方法につき、区分所有者がこの規約及び総会の決議に基づいて負う義務と同一の義務を負う。", items: [] },
        ],
      },
      {
        articleNum: "第6条",
        title: "管理組合",
        body: "区分所有者は、区分所有法第3条に定める建物並びにその敷地及び附属施設の管理を行うための団体として、○○マンション管理組合を構成する。",
        paragraphs: [
          { num: 1, body: "区分所有者は、区分所有法第3条に定める建物並びにその敷地及び附属施設の管理を行うための団体として、○○マンション管理組合を構成する。", items: [] },
          { num: 2, body: "管理組合は、事務所を○○マンション内に置く。", items: [] },
          { num: 3, body: "管理組合の業務、組織等については、第6章に定めるところによる。", items: [] },
        ],
      },
    ].map((a) => ({
      ...a,
      chapter: 1,
      chapterTitle: "総則",
    })),
    // 第2章 専有部分等の範囲
    ...[
      {
        articleNum: "第7条",
        title: "専有部分の範囲",
        body: "対象物件のうち区分所有権の対象となる専有部分は、住戸番号を付した住戸とする。",
        paragraphs: [
          { num: 1, body: "対象物件のうち区分所有権の対象となる専有部分は、住戸番号を付した住戸とする。", items: [] },
          { num: 2, body: "前項の専有部分を他から区分する構造物の帰属については、次のとおりとする。", items: [] },
          { num: 3, body: "一　天井、床及び壁は、躯体部分を除く部分を専有部分とする。", items: [] },
          { num: 4, body: "二　玄関扉は、錠及び内部塗装部分を専有部分とする。", items: [] },
          { num: 5, body: "三　窓枠及び窓ガラスは、専有部分に含まれないものとする。", items: [] },
        ],
      },
      {
        articleNum: "第8条",
        title: "共用部分の範囲",
        body: "対象物件のうち共用部分の範囲は、別表第2に掲げるとおりとする。",
        paragraphs: [
          { num: 1, body: "対象物件のうち共用部分の範囲は、別表第2に掲げるとおりとする。", items: [] },
        ],
      },
      {
        articleNum: "第9条",
        title: "附属施設",
        body: "対象物件のうち附属施設の範囲は、別表第3に掲げるとおりとする。",
        paragraphs: [
          { num: 1, body: "対象物件のうち附属施設の範囲は、別表第3に掲げるとおりとする。", items: [] },
        ],
      },
    ].map((a) => ({
      ...a,
      chapter: 2,
      chapterTitle: "専有部分等の範囲",
    })),
    // 第3章 敷地及び共用部分等の共有
    ...[
      { articleNum: "第10条", title: "共有", body: "対象物件のうち敷地及び共用部分等は、区分所有者の共有とする。", paragraphs: [{ num: 1, body: "対象物件のうち敷地及び共用部分等は、区分所有者の共有とする。", items: [] }] },
      { articleNum: "第11条", title: "共有持分", body: "各区分所有者の共有持分は、別表第4に掲げるとおりとする。", paragraphs: [{ num: 1, body: "各区分所有者の共有持分は、別表第4に掲げるとおりとする。", items: [] }] },
      { articleNum: "第12条", title: "分割請求及び単独処分の禁止", body: "区分所有者は、敷地又は共用部分等の分割を請求することはできない。", paragraphs: [{ num: 1, body: "区分所有者は、敷地又は共用部分等の分割を請求することはできない。", items: [] }, { num: 2, body: "区分所有者は、専有部分と敷地及び共用部分等の共有持分とを分離して譲渡、抵当権の設定等の処分をしてはならない。", items: [] }] },
      { articleNum: "第13条", title: "敷地及び共用部分等の用法", body: "区分所有者は、敷地及び共用部分等をそれぞれの通常の用法に従って使用しなければならない。", paragraphs: [{ num: 1, body: "区分所有者は、敷地及び共用部分等をそれぞれの通常の用法に従って使用しなければならない。", items: [] }] },
      { articleNum: "第14条", title: "バルコニー等の専用使用権", body: "区分所有者は、別表第5に掲げるバルコニー、玄関扉、窓枠、窓ガラス、一階に面する庭及び屋上テラスについて、同表に掲げる区分所有者がそれぞれ専用使用権を有することを承認する。", paragraphs: [{ num: 1, body: "区分所有者は、別表第5に掲げるバルコニー、玄関扉、窓枠、窓ガラス、一階に面する庭及び屋上テラスについて、同表に掲げる区分所有者がそれぞれ専用使用権を有することを承認する。", items: [] }] },
      { articleNum: "第15条", title: "駐車場の使用", body: "管理組合は、別表第6に掲げる駐車場について、特定の区分所有者に駐車場使用契約により使用させることができる。", paragraphs: [{ num: 1, body: "管理組合は、別表第6に掲げる駐車場について、特定の区分所有者に駐車場使用契約により使用させることができる。", items: [] }] },
      { articleNum: "第16条", title: "敷地及び共用部分等の第三者の使用", body: "管理組合は、次に掲げる敷地及び共用部分等の一部を、それぞれ当該各号に掲げる者に使用させることができる。", paragraphs: [{ num: 1, body: "管理組合は、次に掲げる敷地及び共用部分等の一部を、それぞれ当該各号に掲げる者に使用させることができる。", items: [] }] },
      { articleNum: "第17条", title: "専有部分の修繕等", body: "区分所有者は、その専有部分について、修繕、模様替え又は建物に定着する物件の取付け若しくは取替えを行おうとするときは、あらかじめ、理事長にその旨を申請し、書面による承認を受けなければならない。", paragraphs: [{ num: 1, body: "区分所有者は、その専有部分について、修繕、模様替え又は建物に定着する物件の取付け若しくは取替えを行おうとするときは、あらかじめ、理事長にその旨を申請し、書面による承認を受けなければならない。", items: [] }] },
      { articleNum: "第18条", title: "使用細則", body: "対象物件の使用については、別に使用細則を定めるものとする。", paragraphs: [{ num: 1, body: "対象物件の使用については、別に使用細則を定めるものとする。", items: [] }] },
      { articleNum: "第19条", title: "専有部分の貸与", body: "区分所有者は、その専有部分を第三者に貸与する場合には、この規約及び使用細則に定める事項をその第三者に遵守させなければならない。", paragraphs: [{ num: 1, body: "区分所有者は、その専有部分を第三者に貸与する場合には、この規約及び使用細則に定める事項をその第三者に遵守させなければならない。", items: [] }] },
      { articleNum: "第20条", title: "暴力団等の排除", body: "区分所有者は、その専有部分を暴力団の事務所その他これに類する施設として使用してはならない。", paragraphs: [{ num: 1, body: "区分所有者は、その専有部分を暴力団の事務所その他これに類する施設として使用してはならない。", items: [] }] },
      { articleNum: "第21条", title: "敷地及び共用部分等の管理", body: "敷地及び共用部分等の管理については、管理組合がその責任と負担においてこれを行うものとする。", paragraphs: [{ num: 1, body: "敷地及び共用部分等の管理については、管理組合がその責任と負担においてこれを行うものとする。", items: [] }, { num: 2, body: "バルコニー等の保存行為のうち、通常の使用に伴うものについては、専用使用権を有する者がその責任と負担においてこれを行わなければならない。", items: [] }] },
    ].map((a) => ({
      ...a,
      chapter: 3,
      chapterTitle: "敷地及び共用部分等の共有",
    })),
    // 第4章 用法
    ...[
      {
        articleNum: "第22条",
        title: "専有部分の用途",
        body: "区分所有者は、その専有部分を専ら住宅として使用するものとし、他の用途に供してはならない。",
        paragraphs: [
          { num: 1, body: "区分所有者は、その専有部分を専ら住宅として使用するものとし、他の用途に供してはならない。", items: [] },
        ],
      },
      {
        articleNum: "第23条",
        title: "敷地及び共用部分等の用法",
        body: "区分所有者は、敷地及び共用部分等をそれぞれの通常の用法に従って使用しなければならない。",
        paragraphs: [
          { num: 1, body: "区分所有者は、敷地及び共用部分等をそれぞれの通常の用法に従って使用しなければならない。", items: [] },
        ],
      },
      {
        articleNum: "第24条",
        title: "バルコニー等の専用使用権",
        body: "バルコニー等の専用使用権を有する者は、通常の用法に従ってこれを使用しなければならない。",
        paragraphs: [
          { num: 1, body: "バルコニー等の専用使用権を有する者は、通常の用法に従ってこれを使用しなければならない。", items: [] },
        ],
      },
    ].map((a) => ({
      ...a,
      chapter: 4,
      chapterTitle: "用法",
    })),
    // 第5章 管理
    ...[
      { articleNum: "第25条", title: "管理費等", body: "区分所有者は、敷地及び共用部分等の管理に要する経費に充てるため、次の費用を管理組合に納入しなければならない。一　管理費　二　修繕積立金", paragraphs: [{ num: 1, body: "区分所有者は、敷地及び共用部分等の管理に要する経費に充てるため、次の費用を管理組合に納入しなければならない。", items: [] }] },
      { articleNum: "第26条", title: "承継人に対する債権の行使", body: "管理組合が管理費等について有する債権は、区分所有者の特定承継人に対しても行うことができる。", paragraphs: [{ num: 1, body: "管理組合が管理費等について有する債権は、区分所有者の特定承継人に対しても行うことができる。", items: [] }] },
      { articleNum: "第27条", title: "管理費", body: "管理費は、次の各号に掲げる通常の管理に要する経費に充当する。", paragraphs: [{ num: 1, body: "管理費は、次の各号に掲げる通常の管理に要する経費に充当する。", items: [] }] },
      { articleNum: "第28条", title: "修繕積立金", body: "管理組合は、各区分所有者が納入する修繕積立金を積み立てるものとし、積み立てた修繕積立金は、次の各号に掲げる特別の管理に要する経費に充当する場合に限って取り崩すことができる。", paragraphs: [{ num: 1, body: "管理組合は、各区分所有者が納入する修繕積立金を積み立てるものとし、積み立てた修繕積立金は、次の各号に掲げる特別の管理に要する経費に充当する場合に限って取り崩すことができる。", items: [] }] },
      { articleNum: "第29条", title: "使用料", body: "駐車場使用料その他の敷地及び共用部分等に係る使用料は、それらの管理に要する費用に充てるほか、修繕積立金として積み立てる。", paragraphs: [{ num: 1, body: "駐車場使用料その他の敷地及び共用部分等に係る使用料は、それらの管理に要する費用に充てるほか、修繕積立金として積み立てる。", items: [] }] },
      { articleNum: "第30条", title: "管理費等の過不足", body: "収支決算の結果、管理費に余剰を生じた場合には、その余剰は翌年度における管理費に充当する。", paragraphs: [{ num: 1, body: "収支決算の結果、管理費に余剰を生じた場合には、その余剰は翌年度における管理費に充当する。", items: [] }] },
      { articleNum: "第31条", title: "管理費等の徴収", body: "管理組合は、第25条に定める管理費等及び第29条に定める使用料について、組合員が各自開設する預金口座から自動振替の方法により第62条に定める口座に受け入れることとし、当月分は前月の末日までに一括して徴収する。", paragraphs: [{ num: 1, body: "管理組合は、第25条に定める管理費等及び第29条に定める使用料について、組合員が各自開設する預金口座から自動振替の方法により第62条に定める口座に受け入れることとし、当月分は前月の末日までに一括して徴収する。", items: [] }] },
      { articleNum: "第32条", title: "管理組合の業務", body: "管理組合は、建物並びにその敷地及び附属施設の管理のため、次の各号に掲げる業務を行う。", paragraphs: [{ num: 1, body: "管理組合は、建物並びにその敷地及び附属施設の管理のため、次の各号に掲げる業務を行う。", items: [] }] },
      { articleNum: "第33条", title: "業務の委託等", body: "管理組合は、前条に定める業務の全部又は一部を、マンション管理業者等第三者に委託し、又は請け負わせて執行することができる。", paragraphs: [{ num: 1, body: "管理組合は、前条に定める業務の全部又は一部を、マンション管理業者等第三者に委託し、又は請け負わせて執行することができる。", items: [] }] },
      { articleNum: "第34条", title: "専門的知識を有する者の活用", body: "管理組合は、マンション管理士その他マンション管理に関する各分野の専門的知識を有する者に対し、管理組合の運営その他マンションの管理に関し、相談したり、助言、指導その他の援助を求めたりすることができる。", paragraphs: [{ num: 1, body: "管理組合は、マンション管理士その他マンション管理に関する各分野の専門的知識を有する者に対し、管理組合の運営その他マンションの管理に関し、相談したり、助言、指導その他の援助を求めたりすることができる。", items: [] }] },
      { articleNum: "第35条", title: "必要箇所への立入り", body: "理事長又はその指定を受けた者は、管理を行うため必要な範囲内において、他の者が管理する専有部分又は専用使用部分への立入りを請求することができる。", paragraphs: [{ num: 1, body: "理事長又はその指定を受けた者は、管理を行うため必要な範囲内において、他の者が管理する専有部分又は専用使用部分への立入りを請求することができる。", items: [] }] },
      { articleNum: "第36条", title: "損害保険", body: "管理組合は、共用部分等に係る火災保険その他の損害保険の契約を締結する。", paragraphs: [{ num: 1, body: "管理組合は、共用部分等に係る火災保険その他の損害保険の契約を締結する。", items: [] }] },
      { articleNum: "第37条", title: "届出義務", body: "区分所有者は、その専有部分の貸与を含む使用方法について、別に定める届出書を理事長に届け出なければならない。", paragraphs: [{ num: 1, body: "区分所有者は、その専有部分の貸与を含む使用方法について、別に定める届出書を理事長に届け出なければならない。", items: [] }] },
      { articleNum: "第38条", title: "理事長の勧告及び指示等", body: "区分所有者がこの規約若しくは使用細則等に違反したとき、又は対象物件内における共同生活の秩序を乱す行為を行ったときは、理事長は、理事会の決議を経てその区分所有者に対し、その是正のための勧告又は指示等を行うことができる。", paragraphs: [{ num: 1, body: "区分所有者がこの規約若しくは使用細則等に違反したとき、又は対象物件内における共同生活の秩序を乱す行為を行ったときは、理事長は、理事会の決議を経てその区分所有者に対し、その是正のための勧告又は指示等を行うことができる。", items: [] }] },
    ].map((a) => ({
      ...a,
      chapter: 5,
      chapterTitle: "管理",
    })),
    // 第6章 管理組合
    ...[
      { articleNum: "第39条", title: "管理組合の組合員", body: "組合員の資格は、区分所有者となったときに取得し、区分所有者でなくなったときに喪失する。", paragraphs: [{ num: 1, body: "組合員の資格は、区分所有者となったときに取得し、区分所有者でなくなったときに喪失する。", items: [] }] },
      { articleNum: "第40条", title: "届出義務", body: "新たに組合員の資格を取得し又は喪失した者は、直ちにその旨を書面により管理組合に届け出なければならない。", paragraphs: [{ num: 1, body: "新たに組合員の資格を取得し又は喪失した者は、直ちにその旨を書面により管理組合に届け出なければならない。", items: [] }] },
      { articleNum: "第41条", title: "役員", body: "管理組合に次の役員を置く。一　理事長　二　副理事長　三　会計担当理事　四　理事　五　監事", paragraphs: [{ num: 1, body: "管理組合に次の役員を置く。", items: [] }] },
      { articleNum: "第42条", title: "役員の任期", body: "役員の任期は2年とする。ただし、再任を妨げない。", paragraphs: [{ num: 1, body: "役員の任期は2年とする。ただし、再任を妨げない。", items: [] }] },
      { articleNum: "第43条", title: "役員の欠格条項", body: "次の各号のいずれかに該当する者は、役員となることができない。", paragraphs: [{ num: 1, body: "次の各号のいずれかに該当する者は、役員となることができない。", items: [] }] },
      { articleNum: "第44条", title: "役員の誠実義務等", body: "役員は、法令、規約及び使用細則その他細則並びに総会及び理事会の決議に従い、組合員のため、誠実にその職務を遂行するものとする。", paragraphs: [{ num: 1, body: "役員は、法令、規約及び使用細則その他細則並びに総会及び理事会の決議に従い、組合員のため、誠実にその職務を遂行するものとする。", items: [] }] },
      { articleNum: "第45条", title: "理事長", body: "理事長は、管理組合を代表し、その業務を統括するほか、次の各号に掲げる業務を遂行する。", paragraphs: [{ num: 1, body: "理事長は、管理組合を代表し、その業務を統括するほか、次の各号に掲げる業務を遂行する。", items: [] }] },
      { articleNum: "第46条", title: "副理事長", body: "副理事長は、理事長を補佐し、理事長に事故があるときは、その職務を代理し、理事長が欠けたときは、その職務を行う。", paragraphs: [{ num: 1, body: "副理事長は、理事長を補佐し、理事長に事故があるときは、その職務を代理し、理事長が欠けたときは、その職務を行う。", items: [] }] },
      { articleNum: "第47条", title: "理事", body: "理事は、理事会を構成し、理事会の定めるところに従い、管理組合の業務を担当する。", paragraphs: [{ num: 1, body: "理事は、理事会を構成し、理事会の定めるところに従い、管理組合の業務を担当する。", items: [] }] },
      { articleNum: "第48条", title: "監事", body: "監事は、管理組合の業務の執行及び財産の状況を監査し、その結果を総会に報告しなければならない。", paragraphs: [{ num: 1, body: "監事は、管理組合の業務の執行及び財産の状況を監査し、その結果を総会に報告しなければならない。", items: [] }] },
      { articleNum: "第49条", title: "総会", body: "管理組合の総会は、総組合員で組織する。", paragraphs: [{ num: 1, body: "管理組合の総会は、総組合員で組織する。", items: [] }, { num: 2, body: "総会は、通常総会及び臨時総会とし、通常総会は、毎年1回新会計年度開始以後2か月以内に招集しなければならない。", items: [] }] },
      { articleNum: "第50条", title: "招集手続", body: "総会を招集するには、少なくとも会議を開く日の2週間前までに、会議の日時、場所及び目的を示して、組合員に通知を発しなければならない。", paragraphs: [{ num: 1, body: "総会を招集するには、少なくとも会議を開く日の2週間前までに、会議の日時、場所及び目的を示して、組合員に通知を発しなければならない。", items: [] }] },
      { articleNum: "第51条", title: "組合員の総会招集権", body: "組合員が組合員総数の5分の1以上及び議決権総数の5分の1以上に当たる組合員の同意を得て、会議の目的を示して総会の招集を請求した場合には、理事長は、2週間以内にその請求があった日から4週間以内の日を会日とする臨時総会の招集の通知を発しなければならない。", paragraphs: [{ num: 1, body: "組合員が組合員総数の5分の1以上及び議決権総数の5分の1以上に当たる組合員の同意を得て、会議の目的を示して総会の招集を請求した場合には、理事長は、2週間以内にその請求があった日から4週間以内の日を会日とする臨時総会の招集の通知を発しなければならない。", items: [] }] },
      { articleNum: "第52条", title: "議決権", body: "各組合員の議決権の割合は、別表第4に掲げるとおりとする。", paragraphs: [{ num: 1, body: "各組合員の議決権の割合は、別表第4に掲げるとおりとする。", items: [] }] },
      { articleNum: "第53条", title: "総会の会議及び議事", body: "総会の会議は、前条の議決権総数の半数以上を有する組合員が出席しなければならない。", paragraphs: [{ num: 1, body: "総会の会議は、前条の議決権総数の半数以上を有する組合員が出席しなければならない。", items: [] }, { num: 2, body: "総会の議事は、出席組合員の議決権の過半数で決する。", items: [] }] },
      { articleNum: "第54条", title: "議決事項", body: "次の各号に掲げる事項は、総会の決議を経なければならない。", paragraphs: [{ num: 1, body: "次の各号に掲げる事項は、総会の決議を経なければならない。", items: [] }] },
      { articleNum: "第55条", title: "特別の管理の実施並びに修繕積立金の取崩し", body: "特別の管理に要する経費の額が通常の管理に要する経費の額を著しく超えるときは、修繕積立金から取り崩すことができる。", paragraphs: [{ num: 1, body: "特別の管理に要する経費の額が通常の管理に要する経費の額を著しく超えるときは、修繕積立金から取り崩すことができる。", items: [] }] },
      { articleNum: "第56条", title: "建替え決議", body: "マンションの建替えに係る合意形成に必要となる事項の調査に関する業務は、総会の決議により行う。", paragraphs: [{ num: 1, body: "マンションの建替えに係る合意形成に必要となる事項の調査に関する業務は、総会の決議により行う。", items: [] }] },
      { articleNum: "第57条", title: "議事録の作成、保管等", body: "総会の議事については、議長は、議事録を作成しなければならない。", paragraphs: [{ num: 1, body: "総会の議事については、議長は、議事録を作成しなければならない。", items: [] }] },
      { articleNum: "第58条", title: "書面又は代理人による議決権の行使", body: "組合員は、書面又は代理人により議決権を行使することができる。", paragraphs: [{ num: 1, body: "組合員は、書面又は代理人により議決権を行使することができる。", items: [] }] },
      { articleNum: "第59条", title: "理事会", body: "理事会は、理事をもって構成する。", paragraphs: [{ num: 1, body: "理事会は、理事をもって構成する。", items: [] }] },
      { articleNum: "第60条", title: "理事会の招集", body: "理事会は、理事長が招集する。", paragraphs: [{ num: 1, body: "理事会は、理事長が招集する。", items: [] }] },
      { articleNum: "第61条", title: "理事会の会議及び議事", body: "理事会の会議は、理事の半数以上が出席しなければ開くことができず、その議事は出席理事の過半数で決する。", paragraphs: [{ num: 1, body: "理事会の会議は、理事の半数以上が出席しなければ開くことができず、その議事は出席理事の過半数で決する。", items: [] }] },
      { articleNum: "第62条", title: "理事会の議決事項", body: "理事会は、この規約に別に定めるもののほか、次の各号に掲げる事項を決議する。", paragraphs: [{ num: 1, body: "理事会は、この規約に別に定めるもののほか、次の各号に掲げる事項を決議する。", items: [] }] },
      { articleNum: "第63条", title: "理事会の議事録", body: "理事会の議事については、議長は、議事録を作成しなければならない。", paragraphs: [{ num: 1, body: "理事会の議事については、議長は、議事録を作成しなければならない。", items: [] }] },
      { articleNum: "第64条", title: "専門委員会の設置", body: "理事会は、その責任と権限の範囲内において、専門委員会を設置し、特定の課題を調査又は検討させることができる。", paragraphs: [{ num: 1, body: "理事会は、その責任と権限の範囲内において、専門委員会を設置し、特定の課題を調査又は検討させることができる。", items: [] }] },
      ...Array.from({ length: 8 }, (_, i) => ({
        articleNum: `第${65 + i}条`,
        title: `第${65 + i}条`,
        body: "",
        paragraphs: [] as { num: number; body: string; items: { num: number; body: string }[] }[],
      })),
    ].map((a) => ({
      ...a,
      chapter: 6,
      chapterTitle: "管理組合",
    })),
    // 第7章 会計
    ...[
      { articleNum: "第73条", title: "会計年度", body: "管理組合の会計年度は、毎年○月○日から翌年○月○日までとする。", paragraphs: [{ num: 1, body: "管理組合の会計年度は、毎年○月○日から翌年○月○日までとする。", items: [] }] },
      { articleNum: "第74条", title: "管理組合の収入及び支出", body: "管理組合の会計における収入は、第25条に定める管理費等及び第29条に定める使用料によるものとし、その支出は管理のために必要な経費に充てる。", paragraphs: [{ num: 1, body: "管理組合の会計における収入は、第25条に定める管理費等及び第29条に定める使用料によるものとし、その支出は管理のために必要な経費に充てる。", items: [] }] },
      { articleNum: "第75条", title: "収支予算の作成及び変更", body: "理事長は、毎会計年度の収支予算案を通常総会に提出し、その承認を得なければならない。", paragraphs: [{ num: 1, body: "理事長は、毎会計年度の収支予算案を通常総会に提出し、その承認を得なければならない。", items: [] }] },
      { articleNum: "第76条", title: "会計報告", body: "理事長は、毎会計年度の収支決算案を監事の会計監査を経て、通常総会に報告し、その承認を得なければならない。", paragraphs: [{ num: 1, body: "理事長は、毎会計年度の収支決算案を監事の会計監査を経て、通常総会に報告し、その承認を得なければならない。", items: [] }] },
      { articleNum: "第77条", title: "管理費等の預金口座", body: "管理組合における管理費等に係る収入及び支出の経理に当たっては、いわゆる原則方式による管理を行う。", paragraphs: [{ num: 1, body: "管理組合における管理費等に係る収入及び支出の経理に当たっては、いわゆる原則方式による管理を行う。", items: [] }] },
      { articleNum: "第78条", title: "帳票類等の作成、保管", body: "理事長は、会計帳簿、什器備品台帳、組合員名簿及びその他の帳票類を作成して保管しなければならない。", paragraphs: [{ num: 1, body: "理事長は、会計帳簿、什器備品台帳、組合員名簿及びその他の帳票類を作成して保管しなければならない。", items: [] }] },
      { articleNum: "第79条", title: "消滅時における残余財産の清算", body: "管理組合が消滅する場合の残余財産については、第10条に定める各区分所有者の共有持分割合に応じて各区分所有者に帰属するものとする。", paragraphs: [{ num: 1, body: "管理組合が消滅する場合の残余財産については、第10条に定める各区分所有者の共有持分割合に応じて各区分所有者に帰属するものとする。", items: [] }] },
      { articleNum: "第80条", title: "雑則", body: "この規約に定めるもののほか、管理組合の会計に関して必要な事項は、総会の決議により別に定める。", paragraphs: [{ num: 1, body: "この規約に定めるもののほか、管理組合の会計に関して必要な事項は、総会の決議により別に定める。", items: [] }] },
    ].map((a) => ({
      ...a,
      chapter: 7,
      chapterTitle: "会計",
    })),
    // 第8章 雑則
    ...[
      { articleNum: "第81条", title: "規約外事項", body: "規約に定めのない事項については、区分所有法その他の法令の定めるところによる。", paragraphs: [{ num: 1, body: "規約に定めのない事項については、区分所有法その他の法令の定めるところによる。", items: [] }] },
      { articleNum: "第82条", title: "規約原本等", body: "この規約を証するため、区分所有者全員が署名した規約を1通作成し、これを規約原本とする。", paragraphs: [{ num: 1, body: "この規約を証するため、区分所有者全員が署名した規約を1通作成し、これを規約原本とする。", items: [] }] },
      { articleNum: "第83条", title: "規約の変更", body: "この規約の変更は、区分所有者及び議決権の各4分の3以上の多数による集会の決議によってする。", paragraphs: [{ num: 1, body: "この規約の変更は、区分所有者及び議決権の各4分の3以上の多数による集会の決議によってする。", items: [] }] },
      { articleNum: "第84条", title: "細則", body: "この規約に定めるもののほか、対象物件の管理又は使用に関する細則は、総会の決議により定める。", paragraphs: [{ num: 1, body: "この規約に定めるもののほか、対象物件の管理又は使用に関する細則は、総会の決議により定める。", items: [] }] },
      { articleNum: "第85条", title: "附則", body: "この規約は、令和○年○月○日から施行する。", paragraphs: [{ num: 1, body: "この規約は、令和○年○月○日から施行する。", items: [] }] },
      { articleNum: "第86条", title: "経過措置", body: "この規約の施行前に、改正前の規約に基づいてした行為は、なお従前の例による。", paragraphs: [{ num: 1, body: "この規約の施行前に、改正前の規約に基づいてした行為は、なお従前の例による。", items: [] }] },
    ].map((a) => ({
      ...a,
      chapter: 8,
      chapterTitle: "雑則",
    })),
  ],
  metadata: {
    totalArticles: 86,
    totalChapters: 8,
    chapterNames: [
      "総則",
      "専有部分等の範囲",
      "敷地及び共用部分等の共有",
      "用法",
      "管理",
      "管理組合",
      "会計",
      "雑則",
    ],
    parsedAt: new Date().toISOString(),
    sourceFormat: "text",
    warnings: [],
  },
};

// ---------- ヘルパー関数 ----------

/** ParseResult の articles を章ごとにグルーピングする */
function groupByChapter(result: ParseResult): ChapterGroup[] {
  const map = new Map<number, ChapterGroup>();
  for (const article of result.articles) {
    const existing = map.get(article.chapter);
    if (existing) {
      existing.articleCount++;
    } else {
      map.set(article.chapter, {
        chapter: article.chapter,
        title: article.chapterTitle,
        articleCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.chapter - b.chapter);
}

// ---------- コンポーネント ----------

export default function UploadPage() {
  return <AuthGuard><UploadPageContent /></AuthGuard>;
}

function UploadPageContent() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [directText, setDirectText] = useState("");
  const [showDemoOption, setShowDemoOption] = useState(false);

  /** callParse を呼び出してパース結果を処理する共通関数 */
  const executeParse = useCallback(async (text: string) => {
    setState("parsing");
    setShowDemoOption(false);
    try {
      const result = await callParse(text);
      setParseResult(result);
      setState("confirming");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "パース処理中にエラーが発生しました";
      setErrorMessage(message);
      setShowDemoOption(true);
      setState("error");
    }
  }, []);

  /** ファイルアップロード（PDF/Word）→ パース結果を処理する */
  const executeParseFile = useCallback(async (f: File) => {
    setState("parsing");
    setShowDemoOption(false);
    try {
      const result = await callParseFile(f);
      setParseResult(result);
      setState("confirming");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "ファイルのパース処理中にエラーが発生しました";
      setErrorMessage(message);
      setShowDemoOption(true);
      setState("error");
    }
  }, []);

  /** ファイル選択・ドロップ時のハンドラ */
  const handleFile = useCallback(
    async (f: File) => {
      const typeLabel = getFileTypeLabel(f);

      if (!typeLabel) {
        setErrorMessage(
          "対応していないファイル形式です。PDF (.pdf)、Word (.docx)、テキスト (.txt) のいずれかをアップロードしてください。",
        );
        setState("error");
        return;
      }

      setFile(f);
      setState("uploading");

      try {
        if (isBinaryFile(f)) {
          // PDF / Word はファイルアップロード API を使用
          await executeParseFile(f);
        } else {
          // テキストファイルは従来のテキスト API を使用
          const text = await f.text();
          await executeParse(text);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "ファイルの読み取りに失敗しました";
        setErrorMessage(message);
        setState("error");
      }
    },
    [executeParse, executeParseFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  /** テキスト直接入力の送信 */
  const handleDirectTextSubmit = useCallback(async () => {
    if (!directText.trim()) return;
    setState("uploading");
    await executeParse(directText.trim());
  }, [directText, executeParse]);

  /** パース結果を保存して分析画面へ遷移 */
  const handleConfirmAndProceed = useCallback(
    async (result: ParseResult) => {
      saveParsedBylaws(result);
      // Firestore にも非同期で保存（失敗してもジャーニーは続行）
      const pid = loadProjectId();
      if (pid) {
        saveParsedBylawsRemote(pid, result).catch((err) =>
          console.error("Firestore へのパース結果保存に失敗:", err),
        );
        // アップロード完了 → step=2 を記録
        syncCurrentStep(pid, 2);
      }
      router.push("/analysis");
    },
    [router],
  );

  /** デモデータで試す */
  const handleUseDemo = useCallback(() => {
    saveParsedBylaws(DEMO_PARSE_RESULT);
    const pid = loadProjectId();
    if (pid) {
      saveParsedBylawsRemote(pid, DEMO_PARSE_RESULT).catch((err) =>
        console.error("Firestore へのデモデータ保存に失敗:", err),
      );
      syncCurrentStep(pid, 2);
    }
    router.push("/analysis");
  }, [router]);

  /** やり直し */
  const handleReset = useCallback(() => {
    setState("idle");
    setFile(null);
    setErrorMessage("");
    setParseResult(null);
    setShowTextInput(false);
    setDirectText("");
    setShowDemoOption(false);
  }, []);

  /** 章グループを取得 */
  const chapterGroups = parseResult ? groupByChapter(parseResult) : [];
  const totalArticles = parseResult?.metadata.totalArticles ?? 0;

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader currentStep="upload" />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            ステップ 3 / 6
          </Badge>
          <h2 className="text-2xl font-bold mb-2">現行規約のアップロード</h2>
          <p className="text-muted-foreground">
            お手元の管理規約をアップロードすると、AIが条文構造を自動認識します。目安:
            10分
          </p>
        </div>

        {/* 注意喚起 */}
        <div className="p-3 bg-muted rounded-lg mb-6 text-sm">
          <p className="font-medium">アップロード対象</p>
          <p className="text-muted-foreground text-xs mt-1">
            管理規約・使用細則のみをアップロードしてください。組合員名簿・議事録等の個人情報を含む文書は対象外です。
          </p>
        </div>

        {/* ---- idle: ファイル選択 / テキスト入力 ---- */}
        {state === "idle" && (
          <>
            {!showTextInput ? (
              <>
                {/* ドロップゾーン */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                  onClick={() =>
                    document.getElementById("file-input")?.click()
                  }
                >
                  <div className="text-4xl mb-4">📄</div>
                  <p className="font-medium mb-1">
                    ファイルをドラッグ&ドロップ
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    またはクリックしてファイルを選択
                  </p>
                  <p className="text-xs text-muted-foreground">
                    対応形式: PDF (.pdf) / Word (.docx) / テキスト (.txt)
                  </p>
                  <input
                    id="file-input"
                    type="file"
                    accept=".txt,.pdf,.docx"
                    className="hidden"
                    onChange={handleFileInput}
                    data-test="upload-file-input"
                  />
                </div>

                {/* テキスト直接入力の代替手段 */}
                <div className="mt-6 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    スキャンした紙の規約しかない場合は、
                    <button
                      className="text-primary underline ml-1"
                      onClick={() => setShowTextInput(true)}
                    >
                      テキストを直接貼り付け
                    </button>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Google Docs の場合: メニューの「ファイル」→「ダウンロード」→「Microsoft Word (.docx)」でダウンロードしてからアップロードしてください
                  </p>
                </div>
              </>
            ) : (
              /* テキスト直接入力エリア */
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">テキストを直接入力</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    管理規約の全文をコピー&ペーストしてください。
                  </p>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={directText}
                    onChange={(e) => setDirectText(e.target.value)}
                    placeholder={"第1章　総則\n（目的）\n第1条　この規約は..."}
                    className="w-full h-64 p-3 border rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="flex gap-3 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowTextInput(false);
                        setDirectText("");
                      }}
                      className="flex-1"
                    >
                      戻る
                    </Button>
                    <Button
                      onClick={handleDirectTextSubmit}
                      disabled={!directText.trim()}
                      className="flex-1"
                    >
                      パース実行
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ---- uploading / parsing: 処理中表示 ---- */}
        {(state === "uploading" || state === "parsing") && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 animate-pulse mb-4">
                <svg
                  className="w-6 h-6 text-primary animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
              <p className="font-medium mb-2">
                {state === "uploading"
                  ? "ファイルを読み込み中..."
                  : "AIが条文を解析中..."}
              </p>
              {file && (
                <p className="text-sm text-muted-foreground">
                  {file.name}（{((file.size ?? 0) / 1024).toFixed(0)} KB）
                  {getFileTypeLabel(file) && (
                    <span className="ml-1 text-xs">— {getFileTypeLabel(file)}形式</span>
                  )}
                </p>
              )}
              {state === "parsing" && (
                <p className="text-xs text-muted-foreground mt-4">
                  条文の構造を認識し、章・条・項に分類しています。少々お待ちください...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---- error: エラー表示 ---- */}
        {state === "error" && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">⚠️</div>
                <p className="font-medium text-destructive mb-2">
                  エラーが発生しました
                </p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              </div>

              <div className="flex flex-col gap-3 mt-6">
                <Button onClick={handleReset} variant="outline">
                  やり直す
                </Button>
                {showDemoOption && (
                  <Button onClick={handleUseDemo} variant="secondary" data-test="upload-demo">
                    デモデータで試す
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- confirming: パース結果表示 ---- */}
        {state === "confirming" && parseResult && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">解析結果の確認</CardTitle>
                <p className="text-sm text-muted-foreground">
                  AIが認識した規約の構造です。正しく読み取れているか確認してください。
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {chapterGroups.map((ch) => (
                    <div
                      key={ch.chapter}
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded"
                    >
                      <span className="font-medium">
                        第{ch.chapter}章 {ch.title}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {ch.articleCount}条
                      </span>
                    </div>
                  ))}
                </div>

                {/* 警告がある場合 */}
                {parseResult.metadata.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 font-medium mb-1">
                      注意事項
                    </p>
                    <ul className="text-xs text-amber-700 list-disc list-inside">
                      {parseResult.metadata.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800 font-medium">
                    全{totalArticles}条、{chapterGroups.length}
                    章構成として認識しました
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex-1"
              >
                やり直す
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleConfirmAndProceed(parseResult)}
                data-test="upload-confirm"
              >
                次のステップへ
              </Button>
            </div>
          </>
        )}
      </main>

      <AppFooter />
    </div>
  );
}
