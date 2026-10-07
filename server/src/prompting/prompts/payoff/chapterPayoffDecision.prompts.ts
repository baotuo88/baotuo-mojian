import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  CanonicalPayoffState,
  ChapterPayoffDirective,
} from "@ai-novel/shared/types/canonicalState";
import type { PromptAsset } from "../../core/promptTypes";
import { createContextBlock } from "../../core/contextBudget";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";

export interface ChapterPayoffDecisionInput {
  chapter: {
    id: string;
    order: number;
    title: string;
    expectation?: string | null;
    taskSheet?: string | null;
    sceneCards?: string | null;
    mustAvoid?: string | null;
  };
  plan: {
    objective: string;
    mustAdvance: string[];
    mustPreserve: string[];
    reveals: string[];
  } | null;
  payoffs: CanonicalPayoffState[];
  protectedSecrets: string[];
  forbiddenEvents: Array<{ title: string; reason: string }>;
  previousChaptersSummary?: string[];
  previousChapterTail?: string;
}

const directiveSchema = z.object({
  ledgerKey: z.string().trim().min(1),
  operation: z.enum(["seed", "touch", "pressure", "partial_reveal", "payoff", "forbid"]),
  reason: z.string().trim().min(1).max(300),
  forbiddenReveal: z.string().trim().min(1).nullable(),
});

export const chapterPayoffDecisionOutputSchema = z.object({
  directives: z.array(directiveSchema).max(5),
});

export function buildChapterPayoffDecisionContextBlocks(input: ChapterPayoffDecisionInput) {
  return [
    { group: "chapter_mission", value: { chapter: input?.chapter, plan: input?.plan } },
    { group: "payoff_ledger", value: input?.payoffs ?? [] },
    {
      group: "chapter_boundary",
      value: {
        secrets: input?.protectedSecrets ?? [],
        forbiddenEvents: input?.forbiddenEvents ?? [],
      },
    },
    {
      group: "recent_chapters",
      value: {
        summaries: input?.previousChaptersSummary ?? [],
        tail: input?.previousChapterTail ?? "",
      },
    },
  ].map(({ group, value }) =>
    createContextBlock({
      id: `payoff_decision:${group}`,
      group,
      priority: 100,
      required: true,
      allowSummary: false,
      content: `${group}\n${JSON.stringify(value, null, 2)}`,
    }),
  );
}

export function validateChapterPayoffDecisions(
  output: z.infer<typeof chapterPayoffDecisionOutputSchema>,
  input: ChapterPayoffDecisionInput,
): void {
  const keys = new Set(input.payoffs.map((item) => item.ledgerKey));
  const seen = new Set<string>();
  for (const directive of output.directives) {
    if (!keys.has(directive.ledgerKey) || seen.has(directive.ledgerKey)) {
      throw new Error("伏笔动作必须逐项引用输入中的唯一账本身份。");
    }
    seen.add(directive.ledgerKey);
    if (directive.operation === "forbid" && !directive.forbiddenReveal) {
      throw new Error("保留秘密的动作必须说明本章不得揭示的内容。");
    }
    if (directive.operation === "payoff" && directive.forbiddenReveal) {
      throw new Error("完整兑现不能同时要求保留该兑现内容；请明确部分揭示与保密边界。");
    }
  }
  if (seen.size !== keys.size) {
    throw new Error("每个输入伏笔都必须得到明确动作，不能遗漏待兑现的承诺。");
  }
}

export const chapterPayoffDecisionPrompt: PromptAsset<
  ChapterPayoffDecisionInput,
  z.infer<typeof chapterPayoffDecisionOutputSchema>
> = {
  id: "novel.chapter.payoff_decision",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: {
    maxTokensBudget: 4800,
    requiredGroups: ["chapter_mission", "payoff_ledger", "chapter_boundary", "recent_chapters"],
  },
  outputSchema: chapterPayoffDecisionOutputSchema,
  semanticRetryPolicy: { maxAttempts: 2 },
  render: (input, context) => [
    new SystemMessage(
      [
        "你是长篇小说的本章伏笔动作规划器，只输出符合 Schema 的 JSON。",
        "逐项结合当前章节任务单、场景卡、已发生的事实及保密边界决定动作，不得用账本状态替代叙事判断。",
        "seed=铺垫；touch=轻触；pressure=增加压力；partial_reveal=给出部分答案或阶段回报；payoff=完成该项承诺；forbid=本章保留秘密。",
        "本章合同要求兑现且已有铺垫支持时，应选择 payoff 或 partial_reveal，不能持续只施压；逾期本身既不强制兑现，也不禁止兑现。",
        "protectedSecrets 和 forbiddenEvents 是禁止提前揭示的边界。若可交付阶段回报且不暴露秘密，可用 partial_reveal 并在 forbiddenReveal 写清保留部分。否则选择 forbid。",
        "不得编造新剧情、改写章节合同、复活已兑现伏笔或把规划动作当作已经发生的事实。",
        "每个输入 ledgerKey 必须且只能输出一次；reason 解释当前章节为何采用该动作。没有保密边界时 forbiddenReveal=null。",
      ].join("\n"),
    ),
    new HumanMessage(
      context.blocks.length > 0
        ? renderSelectedContextBlocks(context)
        : buildChapterPayoffDecisionContextBlocks(input)
            .map((block) => block.content)
            .join("\n\n"),
    ),
  ],
  postValidate: (output, input) => {
    if (!input?.chapter || !Array.isArray(input.payoffs)) {
      throw new Error("请提供当前章节执行合同和待处理的伏笔账本。");
    }
    validateChapterPayoffDecisions(output, input);
    return output;
  },
};

export function toChapterPayoffDirectives(
  output: z.infer<typeof chapterPayoffDecisionOutputSchema>,
  input: ChapterPayoffDecisionInput,
): ChapterPayoffDirective[] {
  validateChapterPayoffDecisions(output, input);
  const byKey = new Map(output.directives.map((item) => [item.ledgerKey, item]));
  return input.payoffs.map((payoff) => ({ ...byKey.get(payoff.ledgerKey)!, title: payoff.title }));
}
