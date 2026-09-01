import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveNovelEditTakeoverTab,
  resolveNovelEditQueryLoadingPolicy,
  resolveActiveDirectorSession,
  resolveDirectorConsistencyIssue,
  resolveNovelExportProgress,
  resolveNovelResourceProposalMutationState,
  resolveRemovingChapterId,
  resolveNovelTaskDrawerRetryState,
  resolveChapterQualityReport,
  resolveNovelChapterStreamState,
  resolveNovelTaskDrawerCapabilities,
} from "./novelEditRuntime.utils.ts";

test("resolveNovelEditTakeoverTab normalizes workspace tabs", () => {
  assert.equal(resolveNovelEditTakeoverTab("pipeline"), "pipeline");
  assert.equal(resolveNovelEditTakeoverTab("history"), "basic");
  assert.equal(resolveNovelEditTakeoverTab("unknown"), "basic");
});

test("resolveNovelEditQueryLoadingPolicy limits expensive queries to relevant tabs", () => {
  assert.deepEqual(resolveNovelEditQueryLoadingPolicy("chapter", "chapter-1"), {
    shouldLoadVolumeWorkspace: false,
    shouldLoadStoryMacro: false,
    shouldLoadWorldSlice: false,
    shouldLoadQualityReport: false,
    shouldLoadLatestState: true,
    shouldLoadPayoffLedger: true,
    shouldLoadCharacterResources: true,
    shouldLoadChapterContext: true,
    shouldLoadChapterTimeline: true,
  });
  assert.equal(resolveNovelEditQueryLoadingPolicy("chapter", "").shouldLoadChapterContext, false);
  assert.equal(resolveNovelEditQueryLoadingPolicy("pipeline", "").shouldLoadLatestState, true);
});

test("resolveActiveDirectorSession only exposes active director sessions", () => {
  const session = { phase: "review", reviewScope: "outline" };
  assert.deepEqual(resolveActiveDirectorSession({ status: "running", meta: { directorSession: session } }), session);
  assert.equal(resolveActiveDirectorSession({ status: "completed", meta: { directorSession: session } }), null);
  assert.equal(resolveActiveDirectorSession({ status: "running", meta: { directorSession: "invalid" } }), null);
});

test("resolveDirectorConsistencyIssue reports only chapter batch gaps", () => {
  assert.equal(resolveDirectorConsistencyIssue({ checkpointType: "chapter_batch_ready", characterCount: 0, chapterCount: 3 }), "missing_characters");
  assert.equal(resolveDirectorConsistencyIssue({ checkpointType: "chapter_batch_ready", characterCount: 2, chapterCount: 0 }), "missing_chapters");
  assert.equal(resolveDirectorConsistencyIssue({ checkpointType: "workflow_completed", characterCount: 0, chapterCount: 0 }), null);
});

test("resolveNovelExportProgress tracks current and full export variants", () => {
  assert.deepEqual(resolveNovelExportProgress({
    isPending: true,
    variables: { format: "markdown", scope: "current" },
    currentScope: "current",
  }), {
    isExportingCurrentMarkdown: true,
    isExportingCurrentJson: false,
    isExportingFullMarkdown: false,
    isExportingFullJson: false,
  });
  assert.equal(resolveNovelExportProgress({
    isPending: false,
    variables: { format: "json", scope: "full" },
    currentScope: "current",
  }).isExportingFullJson, false);
});

test("resolveNovelTaskDrawerCapabilities derives task actions from status", () => {
  assert.deepEqual(resolveNovelTaskDrawerCapabilities({
    hasTask: true,
    taskStatus: "failed",
    hasActions: true,
    hasFollowUps: false,
    hasRuntimeSnapshot: true,
    canCancel: false,
  }), {
    availableActions: true,
    availableFollowUps: false,
    canAdjustRuntimePolicy: true,
    canInspectManualEditImpact: true,
    canRetryWithOverrideModel: true,
    canCancel: false,
    canArchive: true,
  });
  assert.equal(resolveNovelTaskDrawerCapabilities({
    hasTask: false,
    hasActions: true,
    hasFollowUps: true,
    hasRuntimeSnapshot: true,
    canCancel: true,
  }).canArchive, false);
});

test("resolveNovelResourceProposalMutationState exposes only active mutation ids", () => {
  assert.deepEqual(resolveNovelResourceProposalMutationState({
    confirming: true,
    confirmingId: "proposal-1",
    rejecting: false,
    rejectingId: "proposal-2",
  }), {
    confirmingResourceProposalId: "proposal-1",
    rejectingResourceProposalId: "",
  });
  assert.deepEqual(resolveNovelResourceProposalMutationState({
    confirming: true,
    rejecting: true,
  }), {
    confirmingResourceProposalId: "",
    rejectingResourceProposalId: "",
  });
});

test("resolveRemovingChapterId exposes only the active deletion target", () => {
  assert.equal(resolveRemovingChapterId({ isPending: true, chapterId: "chapter-1" }), "chapter-1");
  assert.equal(resolveRemovingChapterId({ isPending: false, chapterId: "chapter-1" }), null);
});

test("resolveChapterQualityReport selects the report for the active chapter", () => {
  const reports = [{ chapterId: "chapter-1", overall: 72 }, { chapterId: "chapter-2", overall: 88 }];
  assert.deepEqual(resolveChapterQualityReport(reports, "chapter-2"), reports[1]);
  assert.equal(resolveChapterQualityReport(reports, "missing"), undefined);
});

test("resolveNovelChapterStreamState projects chapter and repair streams together", () => {
  const chapterStatus = { status: "running" };
  const repairStatus = { status: "completed" };
  assert.deepEqual(resolveNovelChapterStreamState({
    chapter: { content: "draft", isStreaming: true, latestRun: chapterStatus, runtimePackage: { step: "draft" } },
    chapterTarget: { chapterId: "chapter-1", chapterLabel: "第一章" },
    repair: { content: "repair", isStreaming: false, latestRun: repairStatus },
    repairTarget: null,
  }), {
    chapterRuntimePackage: { step: "draft" },
    streamContent: "draft",
    isStreaming: true,
    streamingChapterId: "chapter-1",
    streamingChapterLabel: "第一章",
    chapterRunStatus: chapterStatus,
    repairStreamContent: "repair",
    isRepairStreaming: false,
    repairStreamingChapterId: null,
    repairStreamingChapterLabel: null,
    repairRunStatus: repairStatus,
  });
});

test("resolveNovelTaskDrawerRetryState validates the override model", () => {
  const overrideModel = { provider: "openai", model: "  gpt-4.1  " };
  assert.deepEqual(resolveNovelTaskDrawerRetryState({
    overrideModel,
    retryWithOverrideModelPending: false,
    retryWithTaskModelPending: true,
  }), {
    overrideModel,
    retryWithOverrideModelPending: false,
    canRetryWithOverrideModel: true,
    retryWithTaskModelPending: true,
  });
  assert.equal(resolveNovelTaskDrawerRetryState({
    overrideModel: { provider: "", model: "gpt-4.1" },
    retryWithOverrideModelPending: false,
    retryWithTaskModelPending: false,
  }).canRetryWithOverrideModel, false);
});
