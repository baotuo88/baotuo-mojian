import type { DirectorDashboardMode, DirectorTaskSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorSessionState } from "@ai-novel/shared/types/novelDirector";
import type { NovelExportDownloadFormat, NovelExportScope } from "@ai-novel/shared/types/novelExport";
import type { ChapterExecutionBackgroundActivity } from "./components/chapterExecution.shared";
import type { NovelEditTakeoverState } from "./components/NovelEditView.types";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";

export type NovelEditTakeoverTab =
  | "basic"
  | "world"
  | "story_macro"
  | "character"
  | "outline"
  | "structured"
  | "chapter"
  | "pipeline";

export function resolveNovelEditTakeoverTab(activeTab: string): NovelEditTakeoverTab {
  switch (activeTab) {
    case "story_macro":
    case "world":
    case "character":
    case "outline":
    case "structured":
    case "chapter":
    case "pipeline":
      return activeTab;
    default:
      return "basic";
  }
}

export function resolveNovelEditQueryLoadingPolicy(activeTab: string, selectedChapterId: string): {
  shouldLoadVolumeWorkspace: boolean;
  shouldLoadStoryMacro: boolean;
  shouldLoadWorldSlice: boolean;
  shouldLoadQualityReport: boolean;
  shouldLoadLatestState: boolean;
  shouldLoadPayoffLedger: boolean;
  shouldLoadCharacterResources: boolean;
  shouldLoadChapterContext: boolean;
  shouldLoadChapterTimeline: boolean;
} {
  const hasChapter = Boolean(selectedChapterId);
  const chapterTab = activeTab === "chapter";
  return {
    shouldLoadVolumeWorkspace: activeTab === "outline" || activeTab === "structured",
    shouldLoadStoryMacro: activeTab === "story_macro",
    shouldLoadWorldSlice: activeTab === "basic" || activeTab === "world",
    shouldLoadQualityReport: activeTab === "pipeline",
    shouldLoadLatestState: chapterTab || activeTab === "pipeline",
    shouldLoadPayoffLedger: activeTab === "structured" || chapterTab || activeTab === "pipeline",
    shouldLoadCharacterResources: activeTab === "character" || chapterTab || activeTab === "pipeline",
    shouldLoadChapterContext: chapterTab && hasChapter,
    shouldLoadChapterTimeline: chapterTab && hasChapter,
  };
}

export function mapDashboardModeToTakeoverMode(
  mode: DirectorDashboardMode | null | undefined,
): NovelEditTakeoverState["mode"] | null {
  switch (mode) {
    case "running":
    case "queued":
    case "completed":
      return "running";
    case "waiting_user":
      return "waiting";
    case "recovering":
      return "action_required";
    case "failed":
      return "failed";
    case "idle":
      return "loading";
    default:
      return null;
  }
}

export function parsePipelineBackgroundActivities(
  payload: string | null | undefined,
): ChapterExecutionBackgroundActivity[] {
  if (!payload?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(payload) as {
      backgroundSync?: {
        activities?: Array<{
          kind?: unknown;
          status?: unknown;
          chapterId?: unknown;
          chapterOrder?: unknown;
          chapterTitle?: unknown;
          updatedAt?: unknown;
          error?: unknown;
        }>;
      };
    };
    return (parsed.backgroundSync?.activities ?? [])
      .flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const kind = item.kind;
        const status = item.status;
        if (
          (kind !== "character_dynamics" && kind !== "state_snapshot" && kind !== "payoff_ledger" && kind !== "character_resources")
          || (status !== "running" && status !== "failed")
          || typeof item.chapterId !== "string"
          || !item.chapterId.trim()
          || typeof item.updatedAt !== "string"
          || !item.updatedAt.trim()
        ) {
          return [];
        }
        const activity: ChapterExecutionBackgroundActivity = {
          kind,
          status,
          chapterId: item.chapterId.trim(),
          chapterOrder: typeof item.chapterOrder === "number" ? item.chapterOrder : undefined,
          chapterTitle: typeof item.chapterTitle === "string" && item.chapterTitle.trim() ? item.chapterTitle.trim() : undefined,
          updatedAt: item.updatedAt.trim(),
          error: typeof item.error === "string" && item.error.trim() ? item.error.trim() : null,
        };
        return [activity];
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function createDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function resolveNovelExportProgress(input: {
  isPending: boolean;
  variables?: { format?: NovelExportDownloadFormat; scope?: NovelExportScope };
  currentScope?: NovelExportScope | null;
}): {
  isExportingCurrentMarkdown: boolean;
  isExportingCurrentJson: boolean;
  isExportingFullMarkdown: boolean;
  isExportingFullJson: boolean;
} {
  const { isPending, variables, currentScope } = input;
  return {
    isExportingCurrentMarkdown: isPending && variables?.scope === currentScope && variables?.format === "markdown",
    isExportingCurrentJson: isPending && variables?.scope === currentScope && variables?.format === "json",
    isExportingFullMarkdown: isPending && variables?.scope === "full" && variables?.format === "markdown",
    isExportingFullJson: isPending && variables?.scope === "full" && variables?.format === "json",
  };
}

export function resolveNovelTaskDrawerCapabilities(input: {
  hasTask: boolean;
  taskStatus?: string | null;
  hasActions: boolean;
  hasFollowUps: boolean;
  hasRuntimeSnapshot: boolean;
  canCancel: boolean;
}): {
  availableActions: boolean;
  availableFollowUps: boolean;
  canAdjustRuntimePolicy: boolean;
  canInspectManualEditImpact: boolean;
  canRetryWithOverrideModel: boolean;
  canCancel: boolean;
  canArchive: boolean;
} {
  const { hasTask, taskStatus } = input;
  const retryable = taskStatus === "failed" || taskStatus === "cancelled";
  const archivable = taskStatus === "succeeded" || retryable;
  return {
    availableActions: input.hasActions,
    availableFollowUps: input.hasFollowUps,
    canAdjustRuntimePolicy: hasTask && input.hasRuntimeSnapshot,
    canInspectManualEditImpact: hasTask,
    canRetryWithOverrideModel: hasTask && retryable,
    canCancel: hasTask && input.canCancel,
    canArchive: hasTask && archivable,
  };
}

export function resolveNovelResourceProposalMutationState(input: {
  confirming: boolean;
  confirmingId?: string | null;
  rejecting: boolean;
  rejectingId?: string | null;
}): {
  confirmingResourceProposalId: string;
  rejectingResourceProposalId: string;
} {
  return {
    confirmingResourceProposalId: input.confirming ? input.confirmingId ?? "" : "",
    rejectingResourceProposalId: input.rejecting ? input.rejectingId ?? "" : "",
  };
}

export function resolveRemovingChapterId(input: {
  isPending: boolean;
  chapterId?: string | null;
}): string | null {
  return input.isPending ? input.chapterId ?? null : null;
}

export function resolveChapterQualityReport<T extends { chapterId?: string | null }>(
  reports: T[] | null | undefined,
  chapterId: string,
): T | undefined {
  return (reports ?? []).find((report) => report.chapterId === chapterId);
}

export function resolveNovelChapterStreamState<TStatus, TPackage>(input: {
  chapter: {
    content: string;
    isStreaming: boolean;
    latestRun?: TStatus | null;
    runtimePackage?: TPackage;
  };
  chapterTarget?: { chapterId: string; chapterLabel: string } | null;
  repair: {
    content: string;
    isStreaming: boolean;
    latestRun?: TStatus | null;
  };
  repairTarget?: { chapterId: string; chapterLabel: string } | null;
}): {
  chapterRuntimePackage: TPackage | undefined;
  streamContent: string;
  isStreaming: boolean;
  streamingChapterId: string | null;
  streamingChapterLabel: string | null;
  chapterRunStatus: TStatus | null | undefined;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  repairStreamingChapterId: string | null;
  repairStreamingChapterLabel: string | null;
  repairRunStatus: TStatus | null | undefined;
} {
  return {
    chapterRuntimePackage: input.chapter.runtimePackage,
    streamContent: input.chapter.content,
    isStreaming: input.chapter.isStreaming,
    streamingChapterId: input.chapterTarget?.chapterId ?? null,
    streamingChapterLabel: input.chapterTarget?.chapterLabel ?? null,
    chapterRunStatus: input.chapter.latestRun,
    repairStreamContent: input.repair.content,
    isRepairStreaming: input.repair.isStreaming,
    repairStreamingChapterId: input.repairTarget?.chapterId ?? null,
    repairStreamingChapterLabel: input.repairTarget?.chapterLabel ?? null,
    repairRunStatus: input.repair.latestRun,
  };
}

export function resolveNovelTaskDrawerRetryState(input: {
  overrideModel: LLMSelectorValue;
  retryWithOverrideModelPending: boolean;
  retryWithTaskModelPending: boolean;
}): {
  overrideModel: LLMSelectorValue;
  retryWithOverrideModelPending: boolean;
  canRetryWithOverrideModel: boolean;
  retryWithTaskModelPending: boolean;
} {
  return {
    overrideModel: input.overrideModel,
    retryWithOverrideModelPending: input.retryWithOverrideModelPending,
    canRetryWithOverrideModel: Boolean(input.overrideModel.provider && input.overrideModel.model.trim()),
    retryWithTaskModelPending: input.retryWithTaskModelPending,
  };
}


export function takeoverDismissStorageKey(novelId: string): string {
  return `novel-edit:takeover-dismissed:${novelId}`;
}

export function resolveDirectorConsistencyIssue(input: {
  checkpointType: string | null | undefined;
  characterCount: number;
  chapterCount: number;
}): "missing_characters" | "missing_chapters" | null {
  if (input.checkpointType !== "chapter_batch_ready") {
    return null;
  }
  if (input.characterCount === 0) {
    return "missing_characters";
  }
  if (input.chapterCount === 0) {
    return "missing_chapters";
  }
  return null;
}

export function resolveActiveStructuredOutlineChapterId(snapshot: DirectorTaskSnapshot | null): string {
  if (!snapshot) {
    return "";
  }
  const activeRuntimeStep = snapshot.runtime?.steps.find((step) => (
    step.idempotencyKey === snapshot.activeStep?.idempotencyKey
  ));
  if (
    activeRuntimeStep?.nodeKey === "structured_outline.chapter_detail_bundle"
    && activeRuntimeStep.targetType === "chapter"
    && activeRuntimeStep.targetId?.trim()
  ) {
    return activeRuntimeStep.targetId.trim();
  }
  const latestStructuredChapterStep = [...(snapshot.runtime?.steps ?? [])].reverse().find((step) => (
    step.nodeKey === "structured_outline.chapter_detail_bundle"
    && step.status === "running"
    && step.targetType === "chapter"
    && step.targetId?.trim()
  ));
  return latestStructuredChapterStep?.targetId?.trim() ?? "";
}

export function resolveActiveDirectorSession(task: {
  status: string;
  meta?: { directorSession?: unknown } | null;
} | null | undefined): DirectorSessionState | null {
  if (
    !task
    || (
      task.status !== "queued"
      && task.status !== "running"
      && task.status !== "waiting_approval"
    )
  ) {
    return null;
  }
  const raw = task.meta?.directorSession;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return raw as DirectorSessionState;
}
