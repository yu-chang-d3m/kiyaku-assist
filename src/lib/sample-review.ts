/** レビューモードのデモデータ */
export type Decision = "adopted" | "modified" | "pending" | null;

export interface ReviewArticle {
  id: string;
  articleNum: string;
  title: string;
  importance: "mandatory" | "recommended" | "optional";
  summary: string;
  explanation: string;
  currentText: string | null;
  draftText: string;
  baseRef: string;
  category: string;
}

export const SAMPLE_REVIEW_ARTICLES: ReviewArticle[] = [
  {
    id: "rev-1",
    articleNum: "第47条第1項",
    title: "総会の定足数",
    importance: "mandatory",
    summary:
      "総会の普通決議の成立要件を「半数以上」から「過半数」に変更します。改正区分所有法で定足数の定め方が変わったことに対応するものです。",
    explanation:
      "法改正で、総会は組合員の「過半数」が出席（書面・代理含む）すれば成立するようになりました。文言を合わせておかないと規約と法律が食い違います。",
    currentText:
      "総会の会議は、前条第1項に定める議決権総数の半数以上を有する組合員が出席しなければならない。",
    draftText:
      "総会の会議は、前条第1項に定める議決権総数の過半数を有する組合員が出席しなければならない。",
    baseRef: "標準管理規約 第47条第1項",
    category: "総会運営",
  },
  {
    id: "rev-2",
    articleNum: "第47条第3項",
    title: "特別多数決議の要件緩和",
    importance: "mandatory",
    summary:
      "規約変更などの特別決議の要件を「組合員総数の3/4以上」から「出席者の3/4以上」に変更します。不在・無関心の区分所有者に左右されにくくなります。",
    explanation:
      "これまでは全員を分母にした3/4が必要でしたが、出席者ベースに変わります。「関心のある人で決められる」ようになる大きな変更です。",
    currentText:
      "次の各号に掲げる事項に関する総会の議事は、組合員総数の4分の3以上及び議決権総数の4分の3以上で決する。",
    draftText:
      "次の各号に掲げる事項に関する総会の議事は、出席組合員の議決権の4分の3以上で決する。",
    baseRef: "標準管理規約 第47条第3項",
    category: "総会運営",
  },
  {
    id: "rev-3",
    articleNum: "第43条第1項",
    title: "招集通知の期間延長",
    importance: "mandatory",
    summary:
      "総会の招集通知の発出期限を「少なくとも会議を開く日の5日前」から「1週間前」に延長します。同時に議案の要領の記載を義務化します。",
    explanation:
      "住民が議案を検討する時間を確保するための改正です。「議案の要領」とは、変更する条文の概要を通知に記載することを意味します。",
    currentText:
      "総会の招集通知は、少なくとも会議を開く日の5日前までに、会議の日時、場所及び目的を示して発しなければならない。",
    draftText:
      "総会の招集通知は、少なくとも会議を開く日の1週間前までに、会議の日時、場所、目的及び議案の要領を示して発しなければならない。",
    baseRef: "標準管理規約 第43条第1項",
    category: "総会運営",
  },
  {
    id: "rev-4",
    articleNum: "新設（第76条の2）",
    title: "所在等不明区分所有者の除外手続",
    importance: "mandatory",
    summary:
      "連絡が取れない区分所有者を、裁判所への申立てにより決議の分母から除外できる手続きを新設します。",
    explanation:
      "高齢化や相続放棄で連絡不能な所有者が増えています。この規定により、連絡不能者に決議が阻まれることを防げます。",
    currentText: null,
    draftText:
      "管理者は、所在等不明区分所有者がある場合において、集会の決議をするときは、裁判所に対し、当該所在等不明区分所有者を集会の決議から除外する旨の決定を求めることができる。\n2　前項の決定があった場合、当該所在等不明区分所有者は、集会の決議の定足数及び多数決の母数から除外する。\n3　管理者は、第1項の申立てに要した費用を、当該所在等不明区分所有者に対し求償することができる。",
    baseRef: "改正区分所有法 第XX条に基づき新設",
    category: "所在不明対応",
  },
  {
    id: "rev-5",
    articleNum: "第45条第5項（新設）",
    title: "電磁的方法による議決権行使",
    importance: "recommended",
    summary:
      "書面と代理人に加えて、電子メールやウェブフォーム等の電磁的方法による議決権行使を可能にする規定を追加します。",
    explanation:
      "スマートフォンやPCから議決権を行使できるようになります。必須ではありませんが、出席率向上や利便性のために導入をお勧めします。",
    currentText:
      "組合員は、書面又は代理人によって議決権を行使することができる。",
    draftText:
      "組合員は、書面、電磁的方法又は代理人によって議決権を行使することができる。",
    baseRef: "標準管理規約 第45条第5項",
    category: "総会運営",
  },
];
