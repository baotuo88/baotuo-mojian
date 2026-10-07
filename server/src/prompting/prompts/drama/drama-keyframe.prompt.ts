import { HumanMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";

export interface DramaKeyframePromptInput {
  location?: string | null;
  shotSize?: string | null;
  cameraMove?: string | null;
  action: string;
  dialogue?: string | null;
  visualPrompt?: string | null;
  characters: string[];
}

/** Image-provider prompt: rendered directly for the image runtime, without a second text-model call. */
export const dramaKeyframePrompt: PromptAsset<DramaKeyframePromptInput, string> = {
  id: "drama.shot.keyframe",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "en",
  contextPolicy: { maxTokensBudget: 4000 },
  management: { productPrompt: true, editModes: ["readonly"] },
  render: (input) => [
    new HumanMessage(
      [
        "vertical 9:16 short drama keyframe, photorealistic cinematic still frame",
        "single decisive first frame for image-to-video generation",
        "clean composition, strong subject focus, commercial Chinese vertical micro-drama style",
        input.location ? `location: ${input.location}` : "",
        input.shotSize ? `shot size: ${input.shotSize}` : "",
        input.cameraMove ? `camera movement intention: ${input.cameraMove}` : "",
        `screen action: ${input.action}`,
        input.dialogue ? `dialogue context, do not render subtitles: ${input.dialogue}` : "",
        input.visualPrompt ? `visual prompt: ${input.visualPrompt}` : "",
        input.characters.length ? `characters: ${input.characters.join(" | ")}` : "",
        "preserve consistent costume, hairstyle, face, age, and mood for all recurring characters",
        "no text, no watermark, no subtitles, no logo",
      ]
        .filter(Boolean)
        .join(", "),
    ),
  ],
  postValidate: (output) => {
    if (!output.trim()) throw new Error("首帧提示词不能为空。");
    return output.trim();
  },
};

export function renderDramaKeyframePrompt(input: DramaKeyframePromptInput): string {
  return dramaKeyframePrompt
    .render(input, {
      blocks: [],
      selectedBlockIds: [],
      droppedBlockIds: [],
      summarizedBlockIds: [],
      estimatedInputTokens: 0,
    })
    .map((message) => String(message.content))
    .join("\n");
}
