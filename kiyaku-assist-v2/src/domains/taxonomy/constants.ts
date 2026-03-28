/**
 * 意味的分類エンジン — 固定タクソノミー定義
 *
 * 改正区分所有法（2026年4月施行）および
 * 令和7年改正標準管理規約の改正内容を踏まえた12グループ。
 * タクソノミーはコードにハードコードし、LLMはマッピングのみ行う。
 */

import type { SemanticGroup, SemanticGroupId } from "./types";

/** 12グループの固定定義 */
export const SEMANTIC_GROUPS: readonly SemanticGroup[] = [
  {
    id: "digitalization",
    label: "電子化対応",
    description:
      "電磁的方法による議決権行使、総会通知、WEB会議出席、電磁的記録による書類管理など、ICT活用に関する規定",
    priority: 1,
    subThemes: [
      {
        id: "digitalization-definition",
        label: "電磁的方法の定義と通知手段",
        description: "電磁的記録・電磁的方法・WEB会議システム等の用語定義",
      },
      {
        id: "digitalization-voting",
        label: "電子議決権行使",
        description: "書面に加えて電磁的方法による議決権行使を可能にする規定",
      },
      {
        id: "digitalization-meeting",
        label: "オンライン出席・WEB総会",
        description: "WEB会議システムによる総会・理事会への出席",
      },
      {
        id: "digitalization-records",
        label: "電磁的方法による記録・閲覧",
        description: "議事録、規約原本、名簿等の電磁的記録と閲覧提供",
      },
    ],
    relatedLawSections: [
      "改正区分所有法 電磁的方法関連規定",
      "改正区分所有法第34条の2（電磁的方法による通知）",
      "改正区分所有法第39条第3項（電磁的方法による議決権行使）",
    ],
  },
  {
    id: "absent-owner",
    label: "所有者不明・不在対策",
    description:
      "所在等不明区分所有者の除外決議、国内管理人制度、所有者不明専有部分管理人・管理不全専有部分管理人に関する規定",
    priority: 2,
    subThemes: [
      {
        id: "absent-owner-exclusion",
        label: "所在等不明者の除外決議",
        description: "所在等不明区分所有者を決議の母数から除外する制度",
      },
      {
        id: "absent-owner-domestic-agent",
        label: "国内管理人制度",
        description: "海外居住区分所有者に国内管理人の選任を求める規定",
      },
      {
        id: "absent-owner-court-appointed",
        label: "裁判所選任の管理人",
        description:
          "所有者不明専有部分管理人・管理不全専有部分管理人の規定",
      },
    ],
    relatedLawSections: [
      "改正区分所有法第6条の2（国内管理人）",
      "改正区分所有法第46条の2（所有者不明専有部分管理人）",
      "改正区分所有法第46条の8（管理不全専有部分管理人）",
    ],
  },
  {
    id: "governance",
    label: "管理組合運営・総会・理事会",
    description:
      "総会の招集・議事・決議要件、理事会の構成・運営、役員の資格・選任・解任、管理者の権限に関する規定",
    priority: 3,
    subThemes: [
      {
        id: "governance-general-meeting",
        label: "総会の招集・運営",
        description: "総会の招集通知、議事進行、出席要件、議事録",
      },
      {
        id: "governance-resolution",
        label: "決議要件",
        description: "普通決議・特別決議・特別多数決議の要件",
      },
      {
        id: "governance-board",
        label: "理事会の構成・運営",
        description: "理事・監事の選任、理事会の招集・決議、専門委員会",
      },
      {
        id: "governance-officers",
        label: "役員の資格・義務",
        description: "役員の適格要件、善管注意義務、利益相反取引の制限",
      },
    ],
    relatedLawSections: [
      "改正区分所有法第34条（総会の招集）",
      "改正区分所有法第39条（決議要件の変更）",
    ],
  },
  {
    id: "general",
    label: "総則・定義",
    description:
      "規約の目的、用語の定義、規約の効力、対象物件の範囲、管理組合の構成など基本的な規定",
    priority: 4,
    subThemes: [
      {
        id: "general-purpose",
        label: "目的・適用範囲",
        description: "規約の目的、対象物件の範囲、効力の及ぶ範囲",
      },
      {
        id: "general-definition",
        label: "用語の定義",
        description: "区分所有権、共用部分、専有部分等の定義",
      },
      {
        id: "general-organization",
        label: "管理組合の構成",
        description: "組合員資格、管理組合の成立・目的",
      },
    ],
    relatedLawSections: ["区分所有法第2条（定義）", "区分所有法第3条（団体）"],
  },
  {
    id: "ownership",
    label: "専有部分・共用部分",
    description:
      "専有部分と共用部分の範囲、共有持分、用途制限、バルコニー等の専用使用権に関する規定",
    priority: 5,
    subThemes: [
      {
        id: "ownership-scope",
        label: "範囲の画定",
        description: "専有部分・共用部分の境界、附属施設の範囲",
      },
      {
        id: "ownership-share",
        label: "共有持分・議決権割合",
        description: "敷地・共用部分の持分割合、議決権の算定基準",
      },
      {
        id: "ownership-exclusive-use",
        label: "専用使用権",
        description: "バルコニー、専用庭、駐車場等の専用使用権",
      },
    ],
    relatedLawSections: [
      "区分所有法第4条（共用部分）",
      "区分所有法第14条（共有持分）",
    ],
  },
  {
    id: "usage",
    label: "用法・生活ルール",
    description:
      "専有部分・共用部分の用法、禁止行為、ペット、騒音、バルコニーの使用制限に関する規定",
    priority: 6,
    subThemes: [
      {
        id: "usage-residential",
        label: "住居専用・用途制限",
        description: "専有部分の住居専用規定、民泊への対応",
      },
      {
        id: "usage-common-area",
        label: "共用部分の使用",
        description: "共用施設の利用方法、駐車場・駐輪場の管理",
      },
      {
        id: "usage-prohibited",
        label: "禁止行為",
        description: "騒音、悪臭、危険物等の禁止行為",
      },
    ],
    relatedLawSections: ["区分所有法第6条（使用制限）"],
  },
  {
    id: "maintenance",
    label: "管理・修繕",
    description:
      "敷地・共用部分の管理、長期修繕計画、大規模修繕工事、修繕積立金の運用に関する規定",
    priority: 7,
    subThemes: [
      {
        id: "maintenance-duty",
        label: "管理の実施",
        description: "管理行為の範囲、管理委託契約、保険",
      },
      {
        id: "maintenance-repair",
        label: "修繕・改良",
        description: "共用部分の変更・修繕の決議要件、費用負担",
      },
      {
        id: "maintenance-plan",
        label: "長期修繕計画",
        description: "計画の作成・見直し、修繕積立金の算定根拠",
      },
    ],
    relatedLawSections: [
      "区分所有法第17条（共用部分の変更）",
      "区分所有法第18条（共用部分の管理）",
    ],
  },
  {
    id: "finance",
    label: "会計・管理費・修繕積立金",
    description:
      "管理費・修繕積立金の額と徴収、会計処理、収支予算・決算、預金口座管理に関する規定",
    priority: 8,
    subThemes: [
      {
        id: "finance-fee",
        label: "管理費・修繕積立金",
        description: "費用の額、負担割合、納付方法、滞納対応",
      },
      {
        id: "finance-accounting",
        label: "会計処理・予算",
        description: "収支予算、決算報告、帳簿・書類の保管",
      },
      {
        id: "finance-special",
        label: "特別会計・借入",
        description: "修繕積立金の運用、借入金の取り扱い",
      },
    ],
    relatedLawSections: ["区分所有法第19条（共用部分の負担）"],
  },
  {
    id: "disaster",
    label: "災害対応・復旧・建替え",
    description:
      "災害時の対応、大規模滅失の復旧、建替え決議、敷地売却に関する規定",
    priority: 9,
    subThemes: [
      {
        id: "disaster-emergency",
        label: "災害時対応",
        description: "緊急時の理事長権限、応急修繕、防災計画",
      },
      {
        id: "disaster-restoration",
        label: "復旧・建替え",
        description: "小規模・大規模滅失の復旧決議、建替え決議",
      },
      {
        id: "disaster-site-sale",
        label: "敷地売却",
        description: "マンション敷地売却決議に関する規定",
      },
    ],
    relatedLawSections: [
      "改正区分所有法 建替え関連規定",
      "区分所有法第61条（復旧）",
      "区分所有法第62条（建替え決議）",
    ],
  },
  {
    id: "lifestyle",
    label: "生活利便性",
    description:
      "置き配、EV充電設備、宅配ボックス、テレワーク対応など現代の生活様式に合わせた規定",
    priority: 10,
    subThemes: [
      {
        id: "lifestyle-delivery",
        label: "置き配・宅配",
        description: "置き配ルール、宅配ボックスの管理",
      },
      {
        id: "lifestyle-ev",
        label: "EV充電設備",
        description: "電気自動車充電設備の設置・管理",
      },
      {
        id: "lifestyle-modern",
        label: "現代的な利用形態",
        description: "テレワーク、シェアリング等への対応",
      },
    ],
    relatedLawSections: ["令和6年改正標準管理規約（生活利便性向上）"],
  },
  {
    id: "legal-compliance",
    label: "法令遵守・義務・罰則",
    description:
      "義務違反者への措置、訴訟追行、個人情報保護、名簿管理、届出義務に関する規定",
    priority: 11,
    subThemes: [
      {
        id: "legal-violation",
        label: "義務違反者への措置",
        description: "使用禁止・競売請求・引渡請求・訴訟追行",
      },
      {
        id: "legal-privacy",
        label: "名簿・個人情報管理",
        description: "組合員名簿、居住者名簿、個人情報保護",
      },
      {
        id: "legal-notification",
        label: "届出義務",
        description: "区分所有権の変動、賃貸、同居人の届出",
      },
    ],
    relatedLawSections: [
      "区分所有法第57条〜第60条（義務違反者に対する措置）",
      "改正区分所有法（名簿管理強化）",
    ],
  },
  {
    id: "misc",
    label: "雑則・附則",
    description:
      "規約外事項の処理、規約原本の保管、細則の制定、附則（発効日・経過措置）に関する規定",
    priority: 12,
    subThemes: [
      {
        id: "misc-bylaw-management",
        label: "規約原本・細則",
        description: "規約原本の保管・閲覧、使用細則の制定権限",
      },
      {
        id: "misc-supplementary",
        label: "附則・経過措置",
        description: "規約の発効日、改正時の経過措置",
      },
    ],
    relatedLawSections: ["区分所有法第30条（規約事項）"],
  },
] as const;

/** グループIDからグループ定義を引くルックアップマップ */
export const SEMANTIC_GROUP_MAP: ReadonlyMap<SemanticGroupId, SemanticGroup> =
  new Map(SEMANTIC_GROUPS.map((g) => [g.id, g]));

/** グループID → 表示ラベルの簡易マップ */
export const SEMANTIC_GROUP_LABELS: Record<SemanticGroupId, string> =
  Object.fromEntries(SEMANTIC_GROUPS.map((g) => [g.id, g.label])) as Record<
    SemanticGroupId,
    string
  >;
