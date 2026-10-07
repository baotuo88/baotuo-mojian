import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { SourceBundle } from "../../adaptation/contracts/sourceBundle";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { comicSourceMappingPrompt } from "../../../prompting/prompts/comic/comic.sourceMapping";

export interface ComicSourceRange {
  start: number;
  end: number;
}

export function readScriptConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    /* Legacy configuration may be missing; never infer source chapters from episode order. */
  }
  return {};
}

export function sourceBeatsDigest(bundle: SourceBundle): string {
  return bundle.beats
    .map(
      (beat) =>
        `节拍${beat.order}（源章节${beat.sourceChapterStart ?? "未标注"}-${beat.sourceChapterEnd ?? "未标注"}）：${beat.summary}`,
    )
    .join("\n");
}

export function validateSourceRange(raw: unknown, bundle: SourceBundle): ComicSourceRange {
  const range = raw as Partial<ComicSourceRange> | undefined;
  const start = range?.start;
  const end = range?.end;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    !start ||
    !end ||
    start < 1 ||
    end < start
  ) {
    throw new AppError("AI 尚未确定本话对应的小说章节，请重新规划本话。", 422);
  }
  const covered = bundle.beats
    .filter(
      (beat) =>
        Number.isInteger(beat.sourceChapterStart) && Number.isInteger(beat.sourceChapterEnd),
    )
    .map((beat) => ({ start: beat.sourceChapterStart!, end: beat.sourceChapterEnd! }))
    .sort((a, b) => a.start - b.start);
  let cursor = start;
  for (const part of covered) {
    if (part.end < cursor) continue;
    if (part.start > cursor) break;
    cursor = Math.max(cursor, part.end + 1);
    if (cursor > end) return { start, end };
  }
  throw new AppError("AI 选择的章节不在已导入的小说范围内，请重新规划本话。", 422);
}

export async function resolveEpisodeSourceRange(input: {
  episode: {
    order: number;
    title: string | null;
    outline: string | null;
    scriptConfig: string | null;
  };
  projectTitle: string;
  bundle: SourceBundle;
  provider?: LLMProvider;
}): Promise<ComicSourceRange> {
  const existing = readScriptConfig(input.episode.scriptConfig).sourceRange;
  if (existing) return validateSourceRange(existing, input.bundle);
  const result = await runStructuredPrompt({
    asset: comicSourceMappingPrompt,
    promptInput: {
      projectTitle: input.projectTitle,
      episodeOrder: input.episode.order,
      episodeTitle: input.episode.title ?? `第 ${input.episode.order} 话`,
      episodeOutline: input.episode.outline ?? "",
      beatsDigest: sourceBeatsDigest(input.bundle),
    },
    options: { temperature: 0.2, provider: input.provider },
  });
  if (!result.output.matched)
    throw new AppError("AI 无法将本话情节对应到已导入的小说，请重新生成分话大纲。", 422);
  return validateSourceRange(
    { start: result.output.sourceChapterStart, end: result.output.sourceChapterEnd },
    input.bundle,
  );
}
