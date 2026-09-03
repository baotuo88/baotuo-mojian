import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export interface VolumeOutcomeSummaryPromptInput {
  novelTitle: string;
  volumeTitle: string;
  volumeMission: string;
  chapterDigest: string[];
  keyTimelineEvents: string[];
  openHooks: string[];
  completedFacts: string[];
  characterStateNotes: string[];
}

export const volumeOutcomeSummaryOutputSchema = z.object({
  narrativeProgress: z.string().describe("本卷实际发生的核心情节推进，压缩为一段清晰叙事，供下一卷写章直接承接"),
  characterStateChanges: z.array(z.string()).default([]).describe("本卷结束时关键角色的状态、关系、能力变化"),
  unresolvedThreads: z.array(z.string()).default([]).describe("本卷遗留的钩子与未解冲突，下一卷必须继续推进"),
  irreversibleFacts: z.array(z.string()).default([]).describe("本卷确立的不可逆事实，后续章节不得改写或重新触发"),
  continuityMusts: z.array(z.string()).default([]).describe("下一卷开篇必须承接的连续性要点"),
});

export const volumeOutcomeSummaryPrompt: PromptAsset<
  VolumeOutcomeSummaryPromptInput,
  z.infer<typeof volumeOutcomeSummaryOutputSchema>
> = {
  id: "novel.volume.outcome_summary",
  version: "v1",
  taskType: "summary_generation",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeOutcomeSummary,
  },
  outputSchema: volumeOutcomeSummaryOutputSchema,
  render: (input) => {
    const section = (title: string, items: string[]) => {
      const trimmed = items.map((item) => (item ?? "").trim()).filter(Boolean);
      if (trimmed.length === 0) {
        return `${title}：无`;
      }
      return `${title}：\n${trimmed.map((item) => `- ${item}`).join("\n")}`;
    };
    return [
      new SystemMessage([
        "你是长篇网文的卷末结果摘要助手。",
        "你的任务是：在一卷内容完成后，把它「实际发生了什么」压缩成可供下一卷写章直接承接的滚动摘要，避免后续写作遗忘前卷剧情、重复已发生事件、或遗漏未解线索。",
        "",
        "【任务边界】",
        "只总结这一卷「实际已发生」的内容，不写计划目标、不写未来计划、不分析文笔。",
        "只输出严格 JSON，不要输出 Markdown、解释、注释或额外文本。",
        "",
        "【输出字段（固定形状）】",
        "narrativeProgress：一段 80-200 字的叙事，概括本卷核心情节推进。",
        "characterStateChanges：本卷结束时关键角色的状态/关系/能力变化，2-8 条。",
        "unresolvedThreads：本卷遗留的钩子与未解冲突，0-6 条，必须是下一卷仍需推进的。",
        "irreversibleFacts：本卷确立的不可逆事实，2-10 条，后续不得改写或重新触发。",
        "continuityMusts：下一卷开篇必须承接的连续性要点，2-6 条。",
        "",
        "【判断原则】",
        "1. 以「防止下一卷写作脱节、重复、矛盾」为唯一目标。",
        "2. 不可逆事实只记录真正不可回溯的（死亡、失去、获得、公开揭示、重大立场转变）；普通进展不必列为不可逆事实。",
        "3. unresolvedThreads 只保留仍开放、会影响后续的线索；已经在本卷收束的不要列入。",
        "4. 信息不足时保守输出，但所有字段必须给出（数组可为空，narrativeProgress 必须有内容）。",
      ].join("\n")),
      new HumanMessage([
        "请为以下已完成的卷生成结果滚动摘要。",
        "",
        `小说：${input.novelTitle}`,
        `本卷：${input.volumeTitle}`,
        `本卷计划目标：${input.volumeMission.trim() || "未提供"}`,
        "",
        section("本卷各章摘要", input.chapterDigest),
        "",
        section("本卷关键时间线事件", input.keyTimelineEvents),
        "",
        section("本卷结束时仍开放的钩子", input.openHooks),
        "",
        section("本卷已完成的不可逆事实", input.completedFacts),
        "",
        section("本卷角色状态变化提示", input.characterStateNotes),
        "",
        "请输出严格 JSON。",
      ].join("\n")),
    ];
  },
};