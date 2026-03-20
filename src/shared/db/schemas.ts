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
  currentStep: z.number().int().min(0).max(5).default(0),
});

/** プロジェクト更新スキーマ */
export const ProjectUpdateSchema = z.object({
  condoName: z.string().min(1).max(100).optional(),
  condoType: z.enum(["corporate", "non-corporate", "unknown"]).optional(),
  unitCount: z.enum(["small", "medium", "large", "xlarge"]).optional(),
  targetTiming: z.string().min(1).optional(),
  hasCurrentRules: z.boolean().optional(),
  currentStep: z.number().int().min(0).max(5).optional(),
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
  decision: z.enum(["adopted", "modified", "pending"]).nullable(),
  modificationHistory: z.array(z.string()),
  memo: z.string().default(""),
  category: z.string(),
});
