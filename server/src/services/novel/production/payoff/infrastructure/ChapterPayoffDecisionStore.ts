import { z } from "zod";
import {
  chapterPayoffDirectiveSchema,
  type ChapterPayoffDirective,
} from "@ai-novel/shared/types/canonicalState";
import { prisma } from "../../../../../db/prisma";
import { withSqliteRetry } from "../../../../../db/sqliteRetry";

const decisionSchema = z.object({
  version: z.literal(1),
  fingerprint: z.string().min(1),
  directives: z.array(chapterPayoffDirectiveSchema).max(5),
});

export interface ChapterPayoffDecisionSaveOptions {
  /** Distinguishes a missing legacy contract hash (null) from an omitted guard. */
  expectedExecutionContractHash?: string | null;
  /** A winner for the same fingerprint is reusable even if its save advanced updatedAt. */
  expectedPlanUpdatedAt?: Date | string;
}

function parsePlanMetadata(rawPlanJson: string | null): Record<string, unknown> {
  if (!rawPlanJson?.trim()) return {};
  const parsed: unknown = JSON.parse(rawPlanJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("章节计划元数据不是有效对象，不能保存伏笔动作。");
  }
  return parsed as Record<string, unknown>;
}

function readDecision(
  metadata: Record<string, unknown>,
  fingerprint: string,
): ChapterPayoffDirective[] | null {
  const parsed = decisionSchema.safeParse(metadata.chapterPayoffDecision);
  if (!parsed.success || parsed.data.fingerprint !== fingerprint) return null;
  const keys = parsed.data.directives.map((item) => item.ledgerKey?.trim());
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) return null;
  return parsed.data.directives;
}

export class ChapterPayoffDecisionStore {
  async read(planId: string, fingerprint: string): Promise<ChapterPayoffDirective[] | null> {
    const plan = await prisma.storyPlan.findUnique({
      where: { id: planId },
      select: { rawPlanJson: true },
    });
    if (!plan) return null;
    try {
      return readDecision(parsePlanMetadata(plan.rawPlanJson), fingerprint);
    } catch {
      return null;
    }
  }

  async save(
    planId: string,
    fingerprint: string,
    directives: ChapterPayoffDirective[],
    options: ChapterPayoffDecisionSaveOptions = {},
  ): Promise<ChapterPayoffDirective[]> {
    const decision = decisionSchema.parse({ version: 1, fingerprint, directives });
    if (!readDecision({ chapterPayoffDecision: decision }, fingerprint)) {
      throw new Error("伏笔动作必须包含唯一且非空的账本身份。");
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await withSqliteRetry(
        () =>
          prisma.$transaction(async (tx) => {
            const plan = await tx.storyPlan.findUnique({
              where: { id: planId },
              select: { rawPlanJson: true, updatedAt: true },
            });
            if (!plan) throw new Error("章节计划不存在，不能保存伏笔动作。");
            const metadata = parsePlanMetadata(plan.rawPlanJson);
            const currentContractHash =
              typeof metadata.executionContractHash === "string"
                ? metadata.executionContractHash.trim() || null
                : null;
            if (
              options.expectedExecutionContractHash !== undefined &&
              currentContractHash !== options.expectedExecutionContractHash
            ) {
              throw new Error("章节执行合同已变更，请重新读取计划后规划伏笔动作。");
            }
            const winner = readDecision(metadata, fingerprint);
            if (winner) return { directives: winner };
            if (
              options.expectedPlanUpdatedAt !== undefined &&
              plan.updatedAt.getTime() !== new Date(options.expectedPlanUpdatedAt).getTime()
            ) {
              throw new Error("章节计划已变更，请重新读取计划后规划伏笔动作。");
            }
            const updated = await tx.storyPlan.updateMany({
              where: { id: planId, rawPlanJson: plan.rawPlanJson, updatedAt: plan.updatedAt },
              data: {
                rawPlanJson: JSON.stringify({ ...metadata, chapterPayoffDecision: decision }),
              },
            });
            return updated.count === 1 ? { directives: decision.directives } : null;
          }),
        { label: "chapterPayoffDecision.save" },
      );
      if (result) return result.directives;
    }
    throw new Error("章节计划正在被更新，伏笔动作尚未保存，请重新读取后重试。");
  }
}

export const chapterPayoffDecisionStore = new ChapterPayoffDecisionStore();
