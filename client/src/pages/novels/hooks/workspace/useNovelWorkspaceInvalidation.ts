import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import {
  isNovelWorkspaceFlowTab,
  type NovelWorkspaceFlowTab,
} from "../../novelWorkspaceNavigation";

interface UseNovelWorkspaceInvalidationInput {
  novelId: string;
  activeTab: string;
  selectedChapterId: string;
  payoffLedgerChapterOrder?: number;
  actionTargetDirectorTaskId: string;
  activeAutoDirectorTaskId?: string;
  visibleDirectorTask: UnifiedTaskDetail | null;
  navigate: (to: string) => void;
  setActiveTab: (tab: string) => void;
  setSelectedChapterId: (chapterId: string) => void;
  setSelectedVolumeId: (volumeId: string) => void;
}

/** Owns React Query invalidation policy for the novel workspace and director projections. */
export function useNovelWorkspaceInvalidation({
  novelId,
  activeTab,
  selectedChapterId,
  payoffLedgerChapterOrder,
  actionTargetDirectorTaskId,
  activeAutoDirectorTaskId,
  visibleDirectorTask,
  navigate,
  setActiveTab,
  setSelectedChapterId,
  setSelectedVolumeId,
}: UseNovelWorkspaceInvalidationInput) {
  const queryClient = useQueryClient();

  const openAutoDirectorTaskCenter = useCallback((directorTaskId?: string) => {
    const targetId = directorTaskId || actionTargetDirectorTaskId || activeAutoDirectorTaskId;
    navigate(targetId ? `/tasks?kind=novel_workflow&id=${targetId}` : "/tasks");
  }, [actionTargetDirectorTaskId, activeAutoDirectorTaskId, navigate]);

  const alignToAutoDirectorResumeTarget = useCallback((task = visibleDirectorTask) => {
    const target = task?.resumeTarget;
    if (!target?.stage) return;
    setActiveTab(target.stage);
    if (target.chapterId) setSelectedChapterId(target.chapterId);
    if (target.volumeId) setSelectedVolumeId(target.volumeId);
  }, [setActiveTab, setSelectedChapterId, setSelectedVolumeId, visibleDirectorTask]);

  const invalidateAutoDirectorTaskState = useCallback(async (taskId?: string) => {
    const invalidations: Array<Promise<unknown>> = [
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.directorBookAutomation(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.recoveryCandidates }),
    ];
    if (taskId) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail("novel_workflow", taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorTaskSnapshot(taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.detail(taskId) }),
      );
    }
    await Promise.allSettled(invalidations);
  }, [novelId, queryClient]);

  const invalidateWorkspaceDataForTabs = useCallback(async (
    tabs: Array<NovelWorkspaceFlowTab | null | undefined>,
  ) => {
    const invalidations: Array<Promise<unknown>> = [];
    const targetTabs = new Set(tabs.filter((tab): tab is NovelWorkspaceFlowTab => Boolean(tab)));
    if (targetTabs.has("basic")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(novelId) }),
      );
    }
    if (targetTabs.has("story_macro")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacro(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacroState(novelId) }),
      );
    }
    if (targetTabs.has("character")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCastOptions(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(novelId) }),
      );
    }
    if (targetTabs.has("outline") || targetTabs.has("structured")) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(novelId) }));
    }
    if (targetTabs.has("structured")) {
      invalidations.push(queryClient.invalidateQueries({
        queryKey: queryKeys.novels.payoffLedger(novelId, payoffLedgerChapterOrder),
      }));
    }
    if (targetTabs.has("chapter")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.payoffLedger(novelId, payoffLedgerChapterOrder) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(novelId) }),
      );
      if (selectedChapterId) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResourceContext(novelId, selectedChapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterTimeline(novelId, selectedChapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(novelId, selectedChapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(novelId, selectedChapterId) }),
        );
      }
    }
    if (targetTabs.has("pipeline")) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.payoffLedger(novelId, payoffLedgerChapterOrder) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(novelId) }),
      );
    }
    await Promise.allSettled(invalidations);
  }, [novelId, payoffLedgerChapterOrder, queryClient, selectedChapterId]);

  const invalidateVisibleWorkspaceData = useCallback(async () => {
    await invalidateWorkspaceDataForTabs([
      isNovelWorkspaceFlowTab(activeTab) ? activeTab : null,
    ]);
  }, [activeTab, invalidateWorkspaceDataForTabs]);

  return {
    alignToAutoDirectorResumeTarget,
    openAutoDirectorTaskCenter,
    invalidateAutoDirectorTaskState,
    invalidateWorkspaceDataForTabs,
    invalidateVisibleWorkspaceData,
  };
}
