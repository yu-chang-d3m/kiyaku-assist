/**
 * 拡張エクスポートオプション
 *
 * Phase 5 で追加された高品質エクスポート向けの設定。
 */

import type { ExportOptions } from "@/domains/export/types";

/** 拡張エクスポートオプション */
export interface EnhancedExportOptions extends ExportOptions {
  /** 表紙を含めるか */
  includeCoverPage?: boolean;
  /** サマリーテーブルを含めるか */
  includeSummaryTable?: boolean;
  /** 改正理由書を含めるか */
  includeRationaleReport?: boolean;
  /** 意味グループ別構成（false = 条文番号順） */
  groupBySemanticGroup?: boolean;
  /** 築年数（表紙用） */
  buildingAge?: number;
  /** 所在地（表紙用） */
  location?: string;
  /** 管理会社名（表紙用） */
  managementCompany?: string;
}

/** 表紙データ */
export interface CoverPageData {
  condoName: string;
  subtitle: string;
  date: string;
  buildingAge?: number;
  location?: string;
  managementCompany?: string;
  totalArticles: number;
  decidedArticles: number;
}

/** サマリーテーブル行 */
export interface SummaryRow {
  groupLabel: string;
  totalCount: number;
  mandatoryCount: number;
  decidedCount: number;
  keyChanges: string[];
}
