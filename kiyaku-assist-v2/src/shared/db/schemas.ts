/**
 * Zod バリデーションスキーマ
 *
 * Server Actions とは別ファイルに分離
 * （"use server" ファイルからはオブジェクトをエクスポートできないため）
 */

import * as z from "zod/v4";

/** プロジェクト作成スキーマ */
export const ProjectCreateSchema = z.object({
  userId: z.string().min(1, "ユーザー ID は必須です"),
  condoName: z.string().min(1, "マンション名は必須です").max(100, "マンション名は100文字以内で入力してください"),
  condoType: z.enum(["corporate", "non-corporate", "unknown"]),
  unitCount: z.enum(["small", "medium", "large", "xlarge"]),
  targetTiming: z.string().min(1, "改定目標時期は必須です"),
  hasCurrentRules: z.boolean(),
  documentType: z.enum(["management-rules", "usage-rules", "other-bylaws"]).default("management-rules"),
  currentStep: z.number().int().min(0).max(5).default(0),
  version: z.enum(["draft", "reviewed", "finalized"]).optional(),
  finalizedAt: z.string().nullable().optional(),
});

/** プロジェクト更新スキーマ */
export const ProjectUpdateSchema = z.object({
  condoName: z.string().min(1).max(100).optional(),
  condoType: z.enum(["corporate", "non-corporate", "unknown"]).optional(),
  unitCount: z.enum(["small", "medium", "large", "xlarge"]).optional(),
  targetTiming: z.string().min(1).optional(),
  hasCurrentRules: z.boolean().optional(),
  documentType: z.enum(["management-rules", "usage-rules", "other-bylaws"]).optional(),
  currentStep: z.number().int().min(0).max(5).optional(),
  version: z.enum(["draft", "reviewed", "finalized"]).optional(),
  finalizedAt: z.string().nullable().optional(),
});

/** 標準管理規約条文スキーマ */
export const StandardArticleSchema = z.object({
  articleNum: z.string().min(1),
  title: z.string(),
  body: z.string().min(1),
  chapter: z.number().int().min(0),
  chapterTitle: z.string().min(1),
  comment: z.string(),
  semanticGroup: z.string().min(1),
  secondaryGroups: z.array(z.string()),
});

/** レビュー記事スキーマ */
export const ReviewArticleSchema = z.object({
  projectId: z.string().min(1),
  chapter: z.number().int().min(0),
  articleNum: z.string().min(1),
  original: z.string().nullable(),
  draft: z.string(),
  summary: z.string(),
  explanation: z.string(),
  importance: z.enum(["mandatory", "recommended", "optional"]),
  baseRef: z.string(),
  decision: z.enum(["adopted", "modified", "keep-current", "adopt-management", "pending"]).nullable(),
  modificationHistory: z.array(z.string()),
  memo: z.string().default(""),
  category: z.string(),
  aiRecommendation: z.enum(["adopted", "modified", "pending"]).nullable().optional(),
  gapType: z.enum(["missing", "outdated", "partial", "compliant", "custom"]).optional(),
  relatedLawRefs: z.array(z.string()).optional(),
  impactOnResidents: z.string().optional(),
  riskIfUnchanged: z.string().optional(),
  transitionalMeasure: z.string().optional(),
  standardRuleComparison: z.string().optional(),
  reformText: z.string().optional(),
  semanticGroup: z.string().optional(),
  secondaryGroups: z.array(z.string()).optional(),
  standardArticleNum: z.string().optional(),
  detailedBackground: z.string().optional(),
  issueGroup: z.string().optional(),
  managementDraft: z.string().nullable().optional(),
  reviewAssignee: z.string().nullable().optional(),
  reviewStatus: z.enum(["not-started", "in-review", "reviewed", "remanded"]).optional(),
  meetingConclusion: z.string().nullable().optional(),
  remandReason: z.string().nullable().optional(),
  isFinalized: z.boolean().optional(),
  finalizedAt: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});
