/**
 * テスト用規約サンプルデータ
 *
 * - SAMPLE_PARSED_BYLAWS: パース済み規約（3章分）
 * - SAMPLE_GAP_RESULTS: ギャップ分析結果（5件）
 * - SAMPLE_REVIEW_ARTICLES: レビュー対象条文（3件）
 */

// --- 型定義 ---

/** パース済み条文 */
interface ParsedArticle {
  number: string;
  title: string;
  content: string;
  chapter: string;
}

/** パース済み章 */
interface ParsedChapter {
  number: string;
  title: string;
  articles: ParsedArticle[];
}

/** パース済み規約全体 */
interface ParsedBylaws {
  title: string;
  lastModified: string;
  chapters: ParsedChapter[];
}

/** ギャップ分析の重要度 */
type GapSeverity = 'critical' | 'major' | 'minor';

/** ギャップ分析結果 */
interface GapResult {
  id: string;
  articleNumber: string;
  category: string;
  severity: GapSeverity;
  currentText: string;
  standardText: string;
  recommendation: string;
  legalBasis: string;
}

/** レビュー対象条文 */
interface ReviewArticle {
  articleNumber: string;
  title: string;
  currentText: string;
  proposedText: string;
  changeReason: string;
  relatedGapIds: string[];
}

// --- パース済み規約データ ---

export const SAMPLE_PARSED_BYLAWS: ParsedBylaws = {
  title: 'テストマンション管理規約',
  lastModified: '2020-04-01',
  chapters: [
    {
      number: '第1章',
      title: '総則',
      articles: [
        {
          number: '第1条',
          title: '目的',
          content:
            'この規約は、テストマンションの管理又は使用に関する事項等について定めることにより、' +
            '区分所有者の共同の利益を増進し、良好な住環境を確保することを目的とする。',
          chapter: '第1章',
        },
        {
          number: '第2条',
          title: '定義',
          content:
            'この規約において、次の各号に掲げる用語の意義は、それぞれ当該各号に定めるところによる。' +
            '\n一 区分所有権 建物の区分所有等に関する法律第2条第1項に規定する区分所有権をいう。' +
            '\n二 区分所有者 建物の区分所有等に関する法律第2条第2項に規定する区分所有者をいう。' +
            '\n三 占有者 区分所有者以外の専有部分の占有者をいう。',
          chapter: '第1章',
        },
        {
          number: '第3条',
          title: '規約及び総会の決議の遵守義務',
          content:
            '区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。',
          chapter: '第1章',
        },
      ],
    },
    {
      number: '第2章',
      title: '専有部分等の範囲',
      articles: [
        {
          number: '第7条',
          title: '専有部分の範囲',
          content:
            '対象物件のうち区分所有権の対象となる専有部分は、住戸番号を付した住戸とする。' +
            '\n2 前項の専有部分を他から区分する構造物の帰属については、次のとおりとする。' +
            '\n一 天井、床及び壁は、躯体部分を除く部分を専有部分とする。' +
            '\n二 玄関扉は、錠及び内部塗装部分を専有部分とする。' +
            '\n三 窓枠及び窓ガラスは、専有部分に含まれないものとする。',
          chapter: '第2章',
        },
        {
          number: '第8条',
          title: '共用部分の範囲',
          content:
            '対象物件のうち共用部分の範囲は、別表第2に掲げるとおりとする。',
          chapter: '第2章',
        },
      ],
    },
    {
      number: '第6章',
      title: '管理組合',
      articles: [
        {
          number: '第25条',
          title: '管理組合',
          content:
            '区分所有者は、全員で建物並びにその敷地及び附属施設の管理を行うための団体を構成する。',
          chapter: '第6章',
        },
        {
          number: '第26条',
          title: '業務',
          content:
            '管理組合は、建物並びにその敷地及び附属施設の管理のため、次の各号に掲げる業務を行う。' +
            '\n一 管理組合が管理する敷地及び共用部分等の保安、保全、保守、清掃、消毒及びごみ処理' +
            '\n二 組合管理部分の修繕' +
            '\n三 長期修繕計画の作成又は変更に関する業務',
          chapter: '第6章',
        },
      ],
    },
  ],
};

// --- ギャップ分析結果 ---

export const SAMPLE_GAP_RESULTS: GapResult[] = [
  {
    id: 'gap-001',
    articleNumber: '第3条',
    category: '遵守義務',
    severity: 'minor',
    currentText:
      '区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。',
    standardText:
      '区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。' +
      '\n2 区分所有者は、同居する者に対してこの規約及び総会の決議を遵守させなければならない。',
    recommendation: '第2項（同居者への遵守義務）を追加する。',
    legalBasis: '区分所有法第46条第2項',
  },
  {
    id: 'gap-002',
    articleNumber: '第17条',
    category: '置き配',
    severity: 'major',
    currentText: '（規定なし）',
    standardText:
      '区分所有者又は占有者は、宅配ボックス又は専用使用部分に配達物を一時保管させることができる。',
    recommendation: '置き配に関する条文を新設する（令和6年改正対応）。',
    legalBasis: '標準管理規約第18条の2',
  },
  {
    id: 'gap-003',
    articleNumber: '第47条',
    category: '電子議決権',
    severity: 'critical',
    currentText: '（規定なし）',
    standardText:
      '組合員は、総会に出席できない場合、電磁的方法により議決権を行使することができる。',
    recommendation:
      '電子議決権行使に関する条文を新設する（改正区分所有法対応）。',
    legalBasis: '改正区分所有法第39条第3項',
  },
  {
    id: 'gap-004',
    articleNumber: '第15条',
    category: 'EV充電設備',
    severity: 'major',
    currentText: '（規定なし）',
    standardText:
      '管理組合は、電気自動車充電設備の設置及びその使用に関する細則を定めることができる。',
    recommendation: 'EV充電設備に関する条文を新設する（令和6年改正対応）。',
    legalBasis: '標準管理規約第15条第2項',
  },
  {
    id: 'gap-005',
    articleNumber: '第25条',
    category: '管理組合法人',
    severity: 'critical',
    currentText:
      '区分所有者は、全員で建物並びにその敷地及び附属施設の管理を行うための団体を構成する。',
    standardText:
      '区分所有者は、全員で建物並びにその敷地及び附属施設の管理を行うための管理組合法人を構成する。',
    recommendation:
      '管理組合法人形態への対応。改正区分所有法に基づく法人化要件を反映する。',
    legalBasis: '改正区分所有法第47条',
  },
];

// --- レビュー対象条文 ---

export const SAMPLE_REVIEW_ARTICLES: ReviewArticle[] = [
  {
    articleNumber: '第3条',
    title: '規約及び総会の決議の遵守義務',
    currentText:
      '区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。',
    proposedText:
      '区分所有者は、円滑な共同生活を維持するため、この規約及び総会の決議を誠実に遵守しなければならない。' +
      '\n2 区分所有者は、同居する者に対してこの規約及び総会の決議を遵守させなければならない。',
    changeReason: '標準管理規約に準拠し、同居者への遵守義務規定を追加。',
    relatedGapIds: ['gap-001'],
  },
  {
    articleNumber: '第47条',
    title: '電子議決権行使',
    currentText: '（条文なし・新設）',
    proposedText:
      '組合員は、総会に出席できない場合、電磁的方法により議決権を行使することができる。' +
      '\n2 前項の電磁的方法の具体的な内容は、理事会の決議により定める。' +
      '\n3 電磁的方法による議決権行使は、総会の開会時までに管理組合に到達したものに限り有効とする。',
    changeReason:
      '改正区分所有法（2026年4月施行）に対応し、電子議決権行使の規定を新設。',
    relatedGapIds: ['gap-003'],
  },
  {
    articleNumber: '第25条',
    title: '管理組合',
    currentText:
      '区分所有者は、全員で建物並びにその敷地及び附属施設の管理を行うための団体を構成する。',
    proposedText:
      '区分所有者は、全員で建物並びにその敷地及び附属施設の管理を行うための管理組合法人（以下「管理組合」という。）を構成する。' +
      '\n2 管理組合法人の事務所は、本マンション内に置く。',
    changeReason:
      '管理組合法人形態に合わせた規定に変更。改正区分所有法第47条に対応。',
    relatedGapIds: ['gap-005'],
  },
];
