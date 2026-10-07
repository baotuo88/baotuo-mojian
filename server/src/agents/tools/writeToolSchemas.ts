import { z } from "zod";
import {
  toolCountSchema,
  toolDryRunSchema,
  toolNullableTimestampSchema,
  toolOptionalIdSchema,
  toolOptionalTextSchema,
  toolRequiredIdSchema,
  toolRequiredTextSchema,
  toolSummarySchema,
} from "./toolSchemaPrimitives";

export const chapterPatchModeSchema = z.enum(["append", "replace_segment", "full_replace"]);

export const diffChapterPatchInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  chapterId: toolRequiredIdSchema,
  mode: chapterPatchModeSchema.default("append"),
  content: toolRequiredTextSchema,
  marker: toolOptionalTextSchema,
});

export const diffChapterPatchOutputSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  mode: chapterPatchModeSchema,
  beforeLength: toolCountSchema,
  afterLength: toolCountSchema,
  summary: toolSummarySchema,
  beforePreview: z.string(),
  afterPreview: z.string(),
});

export const saveChapterDraftInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  chapterId: toolRequiredIdSchema,
  content: toolRequiredTextSchema,
  expectedContent: z
    .string()
    .nullable()
    .describe(
      "生成或修改草稿前 get_chapter_content 返回的 expectedContent，必须原样传回，保留空白与 null。",
    ),
  title: toolOptionalTextSchema,
  dryRun: toolDryRunSchema,
});

export const saveChapterDraftOutputSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  contentLength: toolCountSchema,
  updatedAt: toolNullableTimestampSchema,
  dryRun: z.boolean(),
  summary: toolSummarySchema,
});

export const applyChapterPatchInputSchema = z
  .object({
    novelId: toolRequiredIdSchema,
    chapterId: toolRequiredIdSchema,
    mode: chapterPatchModeSchema.default("append"),
    content: toolRequiredTextSchema,
    expectedContent: z
      .string()
      .nullable()
      .optional()
      .describe("整章覆盖时必须传读取原稿时取得的 expectedContent；增量补丁可使用执行时的原稿。"),
    marker: toolOptionalTextSchema,
    chapterIds: z.array(toolRequiredIdSchema).optional(),
    worldRuleChange: z.boolean().optional(),
    worldId: toolOptionalIdSchema,
    dryRun: toolDryRunSchema,
  })
  .superRefine((input, context) => {
    if (input.mode === "full_replace" && input.expectedContent === undefined) {
      context.addIssue({
        code: "custom",
        path: ["expectedContent"],
        message: "整章覆盖需要生成前读取的原稿版本。",
      });
    }
  });

export const applyChapterPatchOutputSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  mode: chapterPatchModeSchema,
  contentLength: toolCountSchema,
  updatedAt: toolNullableTimestampSchema,
  dryRun: z.boolean(),
  summary: toolSummarySchema,
  beforePreview: z.string(),
  afterPreview: z.string(),
});

export const previewPipelineRunInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
});

export const previewPipelineRunOutputSchema = z.object({
  novelId: z.string(),
  startOrder: toolCountSchema,
  endOrder: toolCountSchema,
  chapterCount: toolCountSchema,
  chapterIds: z.array(z.string()),
});

export const queuePipelineRunInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
  maxRetries: z.number().int().min(0).max(5).optional(),
  dryRun: toolDryRunSchema,
});

export const queuePipelineRunOutputSchema = z.object({
  novelId: z.string(),
  jobId: z.string().nullable(),
  status: z.string(),
  startOrder: toolCountSchema,
  endOrder: toolCountSchema,
  dryRun: z.boolean(),
  summary: toolSummarySchema,
});
