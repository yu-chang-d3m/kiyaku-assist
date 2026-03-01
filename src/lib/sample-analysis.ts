/** ギャップ分析結果のデモデータ */
export type Importance = "mandatory" | "recommended" | "optional";
export type GapStatus = "missing" | "needs-update" | "ok";

export interface GapItem {
  id: string;
  articleNum: string;
  title: string;
  status: GapStatus;
  importance: Importance;
  summary: string;
  category: string;
}

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  mandatory: "法的必須",
  recommended: "推奨",
  optional: "任意",
};

export const STATUS_LABELS: Record<GapStatus, string> = {
  missing: "未対応",
  "needs-update": "要修正",
  ok: "対応済み",
};

export const SAMPLE_GAP_RESULTS: GapItem[] = [
  {
    id: "gap-1",
    articleNum: "第47条",
    title: "総会の定足数",
    status: "needs-update",
    importance: "mandatory",
    summary: "普通決議の定足数を「半数以上」から「過半数」に変更する必要があります。",
    category: "総会運営",
  },
  {
    id: "gap-2",
    articleNum: "第47条",
    title: "特別多数決議の要件",
    status: "needs-update",
    importance: "mandatory",
    summary: "特別決議を「組合員総数の3/4以上」から「出席者の3/4以上」に変更が必要です。",
    category: "総会運営",
  },
  {
    id: "gap-3",
    articleNum: "第43条",
    title: "招集通知の期間",
    status: "needs-update",
    importance: "mandatory",
    summary: "招集通知の発出期間を「5日前」から「1週間前」に延長し、議案の要領の記載を義務化する必要があります。",
    category: "総会運営",
  },
  {
    id: "gap-4",
    articleNum: "新設",
    title: "所在等不明区分所有者の除外手続",
    status: "missing",
    importance: "mandatory",
    summary: "連絡不能な区分所有者を裁判所の手続きで決議の分母から除外する規定がありません。",
    category: "所在不明対応",
  },
  {
    id: "gap-5",
    articleNum: "第62条",
    title: "マンション再生手法の拡充",
    status: "missing",
    importance: "mandatory",
    summary: "建替え以外の再生手法（一括売却・一棟リノベーション・取壊し）の規定がありません。",
    category: "再生",
  },
  {
    id: "gap-6",
    articleNum: "第47条",
    title: "共用部分変更の決議要件緩和",
    status: "needs-update",
    importance: "mandatory",
    summary: "バリアフリー化等の共用部分変更を2/3決議で実施できるよう要件を緩和する必要があります。",
    category: "共用部分",
  },
  {
    id: "gap-7",
    articleNum: "第45条",
    title: "電磁的方法による議決権行使",
    status: "missing",
    importance: "recommended",
    summary: "オンラインでの議決権行使（電子投票）に関する規定がありません。",
    category: "総会運営",
  },
  {
    id: "gap-8",
    articleNum: "新設",
    title: "国内管理人制度",
    status: "missing",
    importance: "recommended",
    summary: "海外在住の区分所有者に国内管理人の選任を求める規定がありません。",
    category: "所在不明対応",
  },
  {
    id: "gap-9",
    articleNum: "第28条",
    title: "修繕積立金の使途拡大",
    status: "needs-update",
    importance: "recommended",
    summary: "修繕積立金の使途に「改良」「再生検討のための調査費用」を追加する必要があります。",
    category: "財務",
  },
  {
    id: "gap-10",
    articleNum: "第18条",
    title: "置き配ルール",
    status: "missing",
    importance: "recommended",
    summary: "共用廊下での置き配に関するルールがありません（使用細則での対応推奨）。",
    category: "使用細則",
  },
  {
    id: "gap-11",
    articleNum: "駐車場細則",
    title: "EV充電設備",
    status: "missing",
    importance: "recommended",
    summary: "電気自動車用充電設備の設置・利用に関する規定がありません（使用細則での対応推奨）。",
    category: "使用細則",
  },
  {
    id: "gap-12",
    articleNum: "第12条",
    title: "民泊（住宅宿泊事業）の禁止",
    status: "ok",
    importance: "recommended",
    summary: "民泊禁止の規定が既に存在しています。対応不要です。",
    category: "用法",
  },
];
