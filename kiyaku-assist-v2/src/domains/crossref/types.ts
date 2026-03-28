/**
 * 相互参照ドメインの型定義
 *
 * 条文間の参照関係（「第X条」「第Y条第Z項」等）を検出・管理する。
 */

/** 個別の参照 */
export interface CrossReference {
  /** 参照元の条文番号 */
  sourceArticleNum: string;
  /** 参照先の条文番号（例: "第3条"） */
  targetArticleNum: string;
  /** 参照先の項番号（例: "第2項"、null = 条全体） */
  targetParagraph: string | null;
  /** 参照先の号番号（例: "第1号"、null = 項全体） */
  targetItem: string | null;
  /** 参照テキストの原文（例: "第3条第2項"） */
  rawText: string;
  /** 参照が見つかった位置（テキスト内のインデックス） */
  position: number;
}

/** 参照グラフ（条文間の参照関係） */
export interface CrossRefGraph {
  /** 全参照のリスト */
  references: CrossReference[];
  /** 条文番号 → その条文からの参照リスト */
  outgoing: Map<string, CrossReference[]>;
  /** 条文番号 → その条文への参照リスト */
  incoming: Map<string, CrossReference[]>;
  /** 参照先が存在しない参照（不整合） */
  broken: CrossReference[];
  /** 統計 */
  stats: {
    totalReferences: number;
    uniqueArticlePairs: number;
    brokenReferences: number;
  };
}

/** 参照バリデーション結果 */
export interface CrossRefValidation {
  /** 条文番号 */
  articleNum: string;
  /** この条文の参照に関する問題 */
  issues: CrossRefIssue[];
}

/** 参照の問題 */
export interface CrossRefIssue {
  /** 問題の種類 */
  type: "broken" | "circular" | "outdated";
  /** 問題の説明 */
  message: string;
  /** 問題のある参照 */
  reference: CrossReference;
}
