import { createHash } from "node:crypto";
import type { CanonicalStateSnapshot, ChapterPayoffDirective } from "@ai-novel/shared/types/canonicalState";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type { PromptExecutionOptions } from "../../../../prompting/core/promptTypes";
import {
  chapterPayoffDecisionPrompt,
  buildChapterPayoffDecisionContextBlocks,
  toChapterPayoffDirectives,
  type ChapterPayoffDecisionInput,
} from "../../../../prompting/prompts/payoff/chapterPayoffDecision.prompts";
import { chapterPayoffDecisionStore } from "./infrastructure/ChapterPayoffDecisionStore";

type PlanningInput = Omit<ChapterPayoffDecisionInput, "payoffs" | "plan"> & {
  snapshot: CanonicalStateSnapshot;
  plan: (NonNullable<ChapterPayoffDecisionInput["plan"]> & {
    id?: string;
    rawPlanJson?: string | null;
    updatedAt?: string;
  }) | null;
};

export class ChapterPayoffPlanningService {
  constructor(private readonly store = chapterPayoffDecisionStore) {}

  async plan(
    input: PlanningInput,
    options: PromptExecutionOptions = {},
  ): Promise<ChapterPayoffDirective[]> {
    const candidates = [
      ...input.snapshot.narrative.overduePayoffs,
      ...input.snapshot.narrative.urgentPayoffs,
      ...input.snapshot.narrative.pendingPayoffs,
    ];
    const payoffs = [...new Map(candidates
      .filter((item) => item.currentStatus !== "paid_off" && item.currentStatus !== "failed")
      .map((item) => [item.ledgerKey, item])).values()].slice(0, 5);
    const promptInput: ChapterPayoffDecisionInput = {
      chapter: {
        id: input.chapter.id,
        order: input.chapter.order,
        title: input.chapter.title,
        expectation: input.chapter.expectation,
        taskSheet: input.chapter.taskSheet,
        sceneCards: input.chapter.sceneCards,
        mustAvoid: input.chapter.mustAvoid,
      },
      plan: input.plan ? {
        objective: input.plan.objective,
        mustAdvance: input.plan.mustAdvance,
        mustPreserve: input.plan.mustPreserve,
        reveals: input.plan.reveals,
      } : null,
      payoffs,
      protectedSecrets: input.protectedSecrets,
      forbiddenEvents: input.forbiddenEvents,
      previousChaptersSummary: input.previousChaptersSummary?.slice(0, 3),
      previousChapterTail: input.previousChapterTail,
    };
    // Bind the decision to the writing contract, not to the evolving ledger after
    // this chapter. Audit/repair must reuse the writer's obligations, even once
    // those obligations have been fulfilled and disappear from the open ledger.
    const fingerprint = createHash("sha256").update(JSON.stringify({
      version: chapterPayoffDecisionPrompt.version,
      chapter: promptInput.chapter,
      plan: promptInput.plan,
    })).digest("hex");
    const planId = input.plan?.id;
    if (planId) {
      const saved = await this.store.read(planId, fingerprint);
      if (saved !== null) return saved;
    }
    const save = async (directives: ChapterPayoffDirective[]) => {
      if (!planId) return directives;
      const metadata = JSON.parse(input.plan?.rawPlanJson || "{}") as { executionContractHash?: string };
      return this.store.save(planId, fingerprint, directives, {
        expectedExecutionContractHash: metadata.executionContractHash ?? null,
        expectedPlanUpdatedAt: input.plan?.updatedAt,
      });
    };
    if (payoffs.length === 0) return save([]);
    const result = await runStructuredPrompt({
      asset: chapterPayoffDecisionPrompt,
      promptInput,
      contextBlocks: buildChapterPayoffDecisionContextBlocks(promptInput),
      options: {
        ...options,
        maxTokens: 1800,
        temperature: options.temperature ?? 0.2,
        novelId: input.snapshot.novelId,
        chapterId: input.chapter.id,
        stage: "chapter_payoff_decision",
      },
    });
    return save(toChapterPayoffDirectives(result.output, promptInput));
  }
}

export const chapterPayoffPlanningService = new ChapterPayoffPlanningService();
