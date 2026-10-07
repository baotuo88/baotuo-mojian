import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { comicSourceBundlePrompt } from "../../../prompting/prompts/comic/comic.sourceBundle";
import { adaptationSourceRegistry } from "../../adaptation/source/SourceContentPort";
import type { SourceBundle, SourceRef } from "../../adaptation/contracts/sourceBundle";

/** AI owns story expansion and source understanding; the registry owns novel access. */
export async function loadComicSourceBundle(
  title: string,
  source: SourceRef,
): Promise<SourceBundle> {
  if (source.type === "novel_import")
    return adaptationSourceRegistry.resolve(source.type).loadBundle(source);
  if (source.type !== "original" && source.type !== "text_import") {
    throw new AppError("请选择小说改编、原创故事或文本导入来创建漫画。", 400);
  }
  const sourceInput = (source.type === "original" ? source.inspiration : source.rawText)?.trim();
  if (!sourceInput)
    throw new AppError(
      source.type === "original"
        ? "请填写故事灵感后整理资料。"
        : "请填写需要改编的原文后整理资料。",
      400,
    );
  const result = await runStructuredPrompt({
    asset: comicSourceBundlePrompt,
    promptInput: { title, sourceType: source.type, sourceInput },
    options: { temperature: source.type === "original" ? 0.7 : 0.3 },
  });
  return { ...result.output, ...(source.type === "text_import" ? { rawText: sourceInput } : {}) };
}
