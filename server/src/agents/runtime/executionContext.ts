import type { ToolCall, ToolExecutionContext } from "../types";

export function resolveToolInput(
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const nextInput = { ...input };
  if (typeof nextInput.novelId !== "string" && context.novelId) {
    nextInput.novelId = context.novelId;
  }
  if (typeof nextInput.worldId !== "string" && context.worldId) {
    nextInput.worldId = context.worldId;
  }
  const source = context.chapterDraftSource;
  if (source && typeof nextInput.content === "string" && nextInput.novelId === source.novelId
    && (nextInput.chapterId === source.chapterId
      || (nextInput.chapterId === undefined && nextInput.chapterOrder === source.chapterOrder))) {
    nextInput.chapterId = source.chapterId;
    if (nextInput.expectedContent === undefined) nextInput.expectedContent = source.expectedContent;
  }
  return nextInput;
}

export function applyToolResultContext(
  context: Omit<ToolExecutionContext, "runId" | "agentName">,
  call: ToolCall,
  output?: Record<string, unknown>,
): Omit<ToolExecutionContext, "runId" | "agentName"> {
  if (!output) {
    return context;
  }
  const nextContext = { ...context };
  if ((call.tool === "get_chapter_content" || call.tool === "get_chapter_content_by_order")
    && typeof output.novelId === "string" && typeof output.chapterId === "string" && typeof output.order === "number"
    && (typeof output.expectedContent === "string" || output.expectedContent === null)) {
    nextContext.chapterDraftSource = {
      novelId: output.novelId, chapterId: output.chapterId, chapterOrder: output.order, expectedContent: output.expectedContent,
    };
  }
  if ((call.tool === "create_novel" || call.tool === "select_novel_workspace")
    && typeof output.novelId === "string"
    && output.novelId.trim()) {
    nextContext.novelId = output.novelId.trim();
    nextContext.contextMode = "novel";
  }
  if ((call.tool === "generate_world_for_novel" || call.tool === "bind_world_to_novel")
    && typeof output.worldId === "string"
    && output.worldId.trim()) {
    nextContext.worldId = output.worldId.trim();
  }
  if (call.tool === "unbind_world_from_novel") {
    nextContext.worldId = undefined;
  }
  if (call.tool === "bind_world_to_novel"
    && typeof output.novelId === "string"
    && output.novelId.trim()) {
    nextContext.novelId = output.novelId.trim();
    nextContext.contextMode = "novel";
  }
  if (call.tool === "unbind_world_from_novel"
    && typeof output.novelId === "string"
    && output.novelId.trim()) {
    nextContext.novelId = output.novelId.trim();
    nextContext.contextMode = "novel";
  }
  return nextContext;
}
