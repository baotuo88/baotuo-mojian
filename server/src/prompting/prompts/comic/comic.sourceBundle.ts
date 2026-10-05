import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const outputSchema = z.object({
  synopsis: z.string().trim().min(10).max(4000),
  beats: z.array(z.object({ order: z.number().int().positive(), summary: z.string().trim().min(1).max(1000) })).min(1).max(100),
  characters: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    gender: z.enum(["male", "female", "other", "unknown"]).default("unknown"),
    persona: z.string().trim().max(1000).optional(),
    relations: z.string().trim().max(1000).optional(),
    visualHint: z.string().trim().max(1000).optional(),
  })).min(1).max(60),
  worldNotes: z.string().trim().max(4000).optional(),
  hardFacts: z.array(z.object({ text: z.string().trim().min(1).max(500), category: z.enum(["completed", "revealed", "state_changed"]) })).max(100).default([]),
});

interface SourceBundleInput { title: string; sourceType: "original" | "text_import"; sourceInput: string }

export const comicSourceBundlePrompt: PromptAsset<SourceBundleInput, z.infer<typeof outputSchema>> = {
  id: "comic.sourceBundle",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 70000 },
  outputSchema,
  semanticRetryPolicy: { maxAttempts: 1 },
  postValidate(output) {
    if (output.beats.some((beat, index) => beat.order !== index + 1)) throw new Error("情节节拍必须从 1 开始连续排序，保留开端、发展和结局。");
    if (new Set(output.characters.map(character => character.name)).size !== output.characters.length) throw new Error("角色名称不能重复，同一角色应合并为一条记录。");
    return output;
  },
  render(input) {
    return [
      new SystemMessage(`你是帮助写作新手完成漫画的故事策划。将用户材料整理为可直接规划分话的故事资料：完整梗概、按时间顺序的情节节拍、角色（含性别、性格和可绘制外貌）、世界设定及不可违背的事实。
${input.sourceType === "original" ? "以用户灵感为创作约束，补全人物、矛盾、发展和结局，形成完整故事。" : "忠实整理输入原文，覆盖末尾事件；不得新增原文没有的情节、角色关系或结局。"}
节拍 order 从 1 开始连续编号，它不是小说章节编号。硬事实用于改编约束，不代表漫画首话已经发生的事件。只输出要求的结构化对象。`),
      new HumanMessage(`漫画项目：${input.title}\n\n用户${input.sourceType === "original" ? "灵感" : "原文"}：\n${input.sourceInput}`),
    ];
  },
};
