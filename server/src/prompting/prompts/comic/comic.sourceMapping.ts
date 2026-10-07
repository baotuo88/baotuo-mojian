import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const outputSchema = z.object({
  matched: z.boolean(),
  sourceChapterStart: z.number().int().positive().optional(),
  sourceChapterEnd: z.number().int().positive().optional(),
  rationale: z.string().trim().min(1).max(400),
});
interface MappingInput {
  projectTitle: string;
  episodeOrder: number;
  episodeTitle: string;
  episodeOutline: string;
  beatsDigest: string;
}
export const comicSourceMappingPrompt: PromptAsset<MappingInput, z.infer<typeof outputSchema>> = {
  id: "comic.sourceMapping",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 16000 },
  management: { productPrompt: true, editModes: ["readonly"] },
  outputSchema,
  render(input) {
    return [
      new SystemMessage(
        "你负责为已有漫画分话匹配源小说章节。根据具体情节语义选择覆盖本话全部事件的最小连续章节区间，只能使用输入的源章节编号，禁止把漫画话序当成小说章序。无法可靠匹配时 matched=false，不要猜测。不要重写已有大纲。",
      ),
      new HumanMessage(
        `项目：${input.projectTitle}\n第 ${input.episodeOrder} 话：${input.episodeTitle}\n本话情节：${input.episodeOutline}\n\n源小说情节及章节编号：\n${input.beatsDigest}\n\n返回 matched、sourceChapterStart、sourceChapterEnd、rationale。`,
      ),
    ];
  },
};
