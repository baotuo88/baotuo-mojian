import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import type { NavigateFunction } from "react-router-dom";
import type { QueryClient } from "@tanstack/react-query";
import type { AutoDirectorAction, AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { DirectorBookAutomationAction, DirectorBookAutomationProjection } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorContinuationMode, DirectorSessionState, DirectorStepCalibrationAction } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { acceptManualChangesAndContinueDirector, calibrateDirectorStep } from "@/api/novelDirector";
import { executeAutoDirectorFollowUpAction } from "@/api/autoDirectorFollowUps";
import { archiveTask, cancelTask, retryTask } from "@/api/tasks";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { toast } from "@/components/ui/toast";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { getCandidateSelectionLink } from "@/lib/novelWorkflowTaskUi";
import { resolveDirectorContinueMode, resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { syncAutoDirectorTaskCache } from "@/lib/taskQueryCache";
import { resolveInternalNavigationTarget } from "@/lib/internalNavigation";
import { getDirectorCockpitActionHref, getDirectorCockpitContinuationMode, isDirectorCockpitContinuationAction } from "@/lib/directorCockpitActions";
import { useStructuredOutlineWorkspaceStore } from "../stores/useStructuredOutlineWorkspaceStore";
import { resolveDirectorConsistencyIssue } from "../novelEditRuntime.utils";
import { tabFromScope } from "../novelWorkspaceNavigation";
import { resolveAutoExecutionScopeLabel } from "../novelEditTakeover.shared";
import type { NovelTaskDrawerState } from "../components/workspace/NovelEditView.types.ts";
import { resolveChapterTitleWarning } from "@/lib/directorTaskNotice";

interface PendingFlagMutation<TVars> { isPending: boolean; mutate: (variables: TVars) => void; }
export interface UseNovelDirectorTaskActionsArgs {
  actionTargetDirectorTaskId: string; alignToAutoDirectorResumeTarget: (task?: UnifiedTaskDetail | null) => void; openAutoDirectorTaskCenter: (taskId?: string) => void; activeAutoDirectorFollowUp: { directorTaskId?: string | null } | null;
  activeAutoExecutionScopeLabel: string; activeAutoDirectorTask: UnifiedTaskDetail | null;
  activeChapterTitleWarning: ReturnType<typeof resolveChapterTitleWarning>; activeDirectorSession: DirectorSessionState | null;
  bookAutomationProjection: DirectorBookAutomationProjection | null; characterCount: number; chapterCount: number;
  displayAutoDirectorTask: UnifiedTaskDetail | null; visibleDirectorTask: UnifiedTaskDetail | null; id: string;
  invalidateAutoDirectorTaskState: (taskId?: string) => Promise<void>; llmProvider: string; llmModel: string; llmTemperature: number;
  navigate: NavigateFunction; queryClient: QueryClient; setActiveTab: (value: string) => void; setDirectorTaskId: (value: string) => void;
  setIsDirectorExitActionExpanded: (value: boolean) => void; setIsTaskDrawerOpen: (value: boolean) => void;
  setSelectedChapterId: (value: string) => void; setSelectedVolumeId: (value: string) => void;
}
export function useNovelDirectorTaskActions({
  actionTargetDirectorTaskId, alignToAutoDirectorResumeTarget, openAutoDirectorTaskCenter, activeAutoDirectorFollowUp, activeAutoExecutionScopeLabel, activeAutoDirectorTask,
  activeChapterTitleWarning, activeDirectorSession, bookAutomationProjection, characterCount, chapterCount,
  displayAutoDirectorTask, visibleDirectorTask, id, invalidateAutoDirectorTaskState, llmProvider, llmModel, llmTemperature,
  navigate, queryClient, setActiveTab, setDirectorTaskId, setIsDirectorExitActionExpanded, setIsTaskDrawerOpen,
  setSelectedChapterId, setSelectedVolumeId,
}: UseNovelDirectorTaskActionsArgs) {
  const continueAutoDirectorMutation = useMutation({
    mutationFn: async (input?: { directorTaskId?: string }) => {
      const targetTaskId = input?.directorTaskId || actionTargetDirectorTaskId;
      const targetTask = targetTaskId === visibleDirectorTask?.id ? visibleDirectorTask : activeAutoDirectorTask;
      if (!targetTaskId) {
        throw new Error("当前没有可继续的自动导演任务。");
      }
      return continueNovelWorkflow(targetTaskId, {
        continuationMode: resolveDirectorContinueMode(targetTask),
      });
    },
    onSuccess: async (response, input) => {
      const targetTaskId = input?.directorTaskId || actionTargetDirectorTaskId;
      const targetTask = targetTaskId === visibleDirectorTask?.id ? visibleDirectorTask : activeAutoDirectorTask;
      setDirectorTaskId(response.data?.taskId ?? targetTaskId);
      void invalidateAutoDirectorTaskState(response.data?.taskId ?? targetTaskId);
      const feedback = resolveWorkflowContinuationFeedback(response.data, {
        mode: resolveDirectorContinueMode(targetTask),
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      alignToAutoDirectorResumeTarget(targetTask);
      toast.success(feedback.message);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "继续自动导演失败。";
      toast.error(message);
    },
  });
  const calibrateDirectorStepMutation = useMutation({
    mutationFn: async (input: {
      directorTaskId: string;
      stepId: string;
      action: DirectorStepCalibrationAction;
      instruction?: string | null;
    }) => calibrateDirectorStep(input.directorTaskId, {
      stepId: input.stepId,
      action: input.action,
      instruction: input.instruction,
    }),
    onSuccess: async (_response, input) => {
      await invalidateAutoDirectorTaskState(input.directorTaskId);
      toast.success(input.action === "validate" ? "当前步骤检查已完成。" : "当前步骤已更新，请检查结果。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "步骤校准失败。");
    },
  });
  const acceptManualChangesAndContinueMutation = useMutation({
    mutationFn: (directorTaskId: string) => acceptManualChangesAndContinueDirector(directorTaskId),
    onSuccess: async (response, directorTaskId) => {
      setDirectorTaskId(response.data?.taskId ?? directorTaskId);
      await invalidateAutoDirectorTaskState(response.data?.taskId ?? directorTaskId);
      toast.success("已确认当前修改，导演将从下一个未完成步骤继续。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "确认修改并继续失败。");
    },
  });
  const continueAutoExecutionMutation = useMutation({
    mutationFn: async (input?: { directorTaskId?: string; continuationMode?: "auto_execute_range" | "skip_quality_repair" }) => {
      const targetTaskId = input?.directorTaskId || actionTargetDirectorTaskId;
      if (!targetTaskId) {
        throw new Error("当前没有可继续自动执行的自动导演任务。");
      }
      return continueNovelWorkflow(targetTaskId, {
        continuationMode: input?.continuationMode ?? "auto_execute_range",
      });
    },
    onSuccess: async (response, input) => {
      const targetTaskId = input?.directorTaskId || actionTargetDirectorTaskId;
      const targetTask = targetTaskId === visibleDirectorTask?.id ? visibleDirectorTask : activeAutoDirectorTask;
      setDirectorTaskId(response.data?.taskId ?? targetTaskId);
      void invalidateAutoDirectorTaskState(response.data?.taskId ?? targetTaskId);
      const feedback = resolveWorkflowContinuationFeedback(response.data, {
        mode: input?.continuationMode ?? "auto_execute_range",
        scopeLabel: activeAutoExecutionScopeLabel,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      alignToAutoDirectorResumeTarget(targetTask);
      toast.success(feedback.message);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : `继续自动执行${activeAutoExecutionScopeLabel}失败。`;
      toast.error(message);
    },
  });
  const continueProjectedDirectorActionMutation = useMutation({
    mutationFn: async (input: {
      taskId: string;
      mode?: DirectorContinuationMode;
    }) => continueNovelWorkflow(
      input.taskId,
      input.mode ? { continuationMode: input.mode } : undefined,
    ),
    onSuccess: async (response, input) => {
      setDirectorTaskId(response.data?.taskId ?? input.taskId);
      void invalidateAutoDirectorTaskState(response.data?.taskId ?? input.taskId);
      const feedback = resolveWorkflowContinuationFeedback(response.data, {
        mode: input.mode,
        scopeLabel: activeAutoExecutionScopeLabel,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      alignToAutoDirectorResumeTarget(input.taskId === visibleDirectorTask?.id ? visibleDirectorTask : activeAutoDirectorTask);
      toast.success(feedback.message);
    },
    onError: (error, input) => {
      const message = error instanceof Error
        ? error.message
        : input.mode === "auto_execute_range"
          ? `继续自动执行${activeAutoExecutionScopeLabel}失败。`
          : "继续自动导演失败。";
      toast.error(message);
    },
  });
  const executeFollowUpActionMutation = useMutation({
    mutationFn: async (input: {
      directorTaskId?: string;
      actionCode: AutoDirectorMutationActionCode;
    }) => {
      const targetTaskId = input.directorTaskId || actionTargetDirectorTaskId;
      if (!targetTaskId) {
        throw new Error("当前没有可执行的动作。");
      }
      return executeAutoDirectorFollowUpAction(targetTaskId, {
        actionCode: input.actionCode,
        idempotencyKey: `${targetTaskId}:${input.actionCode}:${Date.now()}`,
      });
    },
    onSuccess: async (response, input) => {
      const result = response.data;
      if (result?.task) {
        syncAutoDirectorTaskCache(queryClient, id, result.task);
      }
      setDirectorTaskId(result?.directorTaskId ?? result?.taskId ?? input.directorTaskId ?? actionTargetDirectorTaskId);
      await invalidateAutoDirectorTaskState(result?.directorTaskId ?? result?.taskId ?? input.directorTaskId ?? actionTargetDirectorTaskId);
      if (result?.code === "failed" || result?.code === "forbidden") {
        toast.error(result.message);
        return;
      }
      toast.success(result?.message ?? "已执行动作。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "执行动作失败。");
    },
  });
  const consistencyIssue = useMemo(
    () => resolveDirectorConsistencyIssue({
      checkpointType: activeAutoDirectorTask?.checkpointType,
      characterCount,
      chapterCount,
    }),
    [activeAutoDirectorTask?.checkpointType, chapterCount, characterCount],
  );
  const reviewScope = activeDirectorSession?.reviewScope ?? null;
  const reviewTab = useMemo(() => tabFromScope(reviewScope), [reviewScope]);
  const openReviewStage = () => {
    if (!reviewTab) {
      return;
    }
    setActiveTab(reviewTab);
    setIsTaskDrawerOpen(false);
  };
  const openCandidateSelection = (directorTaskId = actionTargetDirectorTaskId || activeAutoDirectorTask?.id || "") => {
    if (!directorTaskId) {
      return;
    }
    navigate(getCandidateSelectionLink(directorTaskId));
  };
  const openChapterExecution = (task = visibleDirectorTask) => {
    if (task?.resumeTarget?.chapterId) {
      setSelectedChapterId(task.resumeTarget.chapterId);
    }
    setActiveTab("chapter");
    setIsTaskDrawerOpen(false);
  };
  const openQualityRepair = (task = visibleDirectorTask) => {
    if (task?.resumeTarget?.chapterId) {
      setSelectedChapterId(task.resumeTarget.chapterId);
    }
    setActiveTab("pipeline");
    setIsTaskDrawerOpen(false);
  };
  const openChapterTitleRepair = (showToast = false) => {
    const targetVolumeId = activeChapterTitleWarning?.volumeId ?? activeAutoDirectorTask?.resumeTarget?.volumeId ?? "";
    setActiveTab("structured");
    setSelectedVolumeId(targetVolumeId);
    setSelectedChapterId("");
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: targetVolumeId || undefined,
      selectedChapterId: "",
      selectedBeatKey: "all",
    });
    setIsTaskDrawerOpen(false);
    if (!showToast) {
      return;
    }
    toast.success(targetVolumeId ? "已定位到当前卷拆章，可直接修复标题。" : "已切到节奏 / 拆章，可直接修复标题。");
  };
  const handleTaskDrawerProjectionAction = (action: DirectorBookAutomationAction) => {
    if (!bookAutomationProjection) {
      return;
    }
    const taskId = action.commandPayload?.taskId
      ?? action.target.taskId
      ?? bookAutomationProjection.latestTask?.id
      ?? activeAutoDirectorTask?.id;
    if (taskId && isDirectorCockpitContinuationAction(action)) {
      continueProjectedDirectorActionMutation.mutate({
        taskId,
        mode: getDirectorCockpitContinuationMode(action),
      });
      return;
    }
    if (action.type === "confirm_candidate") {
      openCandidateSelection(taskId);
      return;
    }
    if (action.type === "open_chapter") {
      openChapterExecution(taskId === visibleDirectorTask?.id ? visibleDirectorTask : undefined);
      return;
    }
    if (action.type === "open_quality_repair") {
      openQualityRepair(taskId === visibleDirectorTask?.id ? visibleDirectorTask : undefined);
      return;
    }
    if (action.type === "open_details") {
      openAutoDirectorTaskCenter(taskId);
      return;
    }
    setIsTaskDrawerOpen(false);
    navigate(getDirectorCockpitActionHref(bookAutomationProjection, action));
  };
  const handleDrawerFollowUpAction = (action: AutoDirectorAction) => {
    if (action.kind === "navigation") {
      const targetUrl = action.targetUrl?.trim() || visibleDirectorTask?.sourceRoute || activeAutoDirectorTask?.sourceRoute || "";
      const internalTarget = resolveInternalNavigationTarget(targetUrl);
      if (internalTarget) {
        setIsTaskDrawerOpen(false);
        navigate(internalTarget);
        return;
      }
      if (/^https?:\/\//i.test(targetUrl)) {
        window.location.assign(targetUrl);
      }
      return;
    }
    executeFollowUpActionMutation.mutate(
      {
        directorTaskId: activeAutoDirectorFollowUp?.directorTaskId ?? actionTargetDirectorTaskId,
        actionCode: (action.executorActionCode ?? action.code) as AutoDirectorMutationActionCode,
      },
    );
  };
  const chapterTitleRepairMutation = useDirectorChapterTitleRepair({
    navigateOnSuccess: false,
    onAfterStart: () => {
      openChapterTitleRepair(false);
    },
  });
  const retryableAutoDirectorTask = useMemo(() => {
    if (displayAutoDirectorTask && (displayAutoDirectorTask.status === "failed" || displayAutoDirectorTask.status === "cancelled")) {
      return displayAutoDirectorTask;
    }
    if (activeAutoDirectorTask && (activeAutoDirectorTask.status === "failed" || activeAutoDirectorTask.status === "cancelled")) {
      return activeAutoDirectorTask;
    }
    return null;
  }, [activeAutoDirectorTask, displayAutoDirectorTask]);
  const retryAutoDirectorWithCurrentModelMutation = useMutation({
    mutationFn: async () => {
      if (!retryableAutoDirectorTask?.id) {
        throw new Error("当前没有可重试的自动导演任务。");
      }
      return retryTask("novel_workflow", retryableAutoDirectorTask.id, {
        llmOverride: {
          provider: llmProvider,
          model: llmModel,
          temperature: llmTemperature,
        },
        resume: true,
      });
    },
    onSuccess: async (response) => {
      syncAutoDirectorTaskCache(queryClient, id, response.data);
      void invalidateAutoDirectorTaskState(response.data?.id ?? retryableAutoDirectorTask?.id);
      setIsTaskDrawerOpen(true);
      toast.success(`已切换到 ${llmProvider} / ${llmModel} 并重新启动自动导演。`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "切换当前模型重试失败。";
      toast.error(message);
    },
  });
  const retryAutoDirectorWithTaskModelMutation = useMutation({
    mutationFn: async () => {
      if (!retryableAutoDirectorTask?.id) {
        throw new Error("当前没有可重试的自动导演任务。");
      }
      return retryTask("novel_workflow", retryableAutoDirectorTask.id, { resume: true });
    },
    onSuccess: async (response) => {
      syncAutoDirectorTaskCache(queryClient, id, response.data);
      void invalidateAutoDirectorTaskState(response.data?.id ?? retryableAutoDirectorTask?.id);
      setIsTaskDrawerOpen(true);
      toast.success("自动导演已按任务原模型重新启动。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "按原模型重试失败。";
      toast.error(message);
    },
  });
  const cancelAutoDirectorMutation = useMutation({
    mutationFn: async (targetTaskId?: string) => {
      const taskId = targetTaskId || displayAutoDirectorTask?.id || activeAutoDirectorTask?.id;
      if (!taskId) {
        throw new Error("当前没有可取消的自动导演任务。");
      }
      return cancelTask("novel_workflow", taskId);
    },
    onSuccess: async (response, targetTaskId) => {
      setIsDirectorExitActionExpanded(false);
      syncAutoDirectorTaskCache(queryClient, id, response.data);
      void invalidateAutoDirectorTaskState(response.data?.id ?? targetTaskId ?? displayAutoDirectorTask?.id ?? activeAutoDirectorTask?.id);
      toast.success("已取消自动导演任务。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "取消自动导演失败。";
      toast.error(message);
    },
  });
  const archiveCompletedAutoDirectorMutation = useMutation({
    mutationFn: async (targetTaskId?: string) => {
      const taskId = targetTaskId || displayAutoDirectorTask?.id;
      if (!taskId) {
        throw new Error("当前没有可收起的自动导演完成记录。");
      }
      return archiveTask("novel_workflow", taskId);
    },
    onSuccess: async (_response, targetTaskId) => {
      setIsDirectorExitActionExpanded(false);
      await invalidateAutoDirectorTaskState(targetTaskId ?? displayAutoDirectorTask?.id);
      toast.success("已收起这次自动导演完成提醒。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "收起自动导演完成提醒失败。";
      toast.error(message);
    },
  });

  return { acceptManualChangesAndContinueMutation, archiveCompletedAutoDirectorMutation, calibrateDirectorStepMutation, cancelAutoDirectorMutation, chapterTitleRepairMutation, consistencyIssue, continueAutoDirectorMutation, continueAutoExecutionMutation, continueProjectedDirectorActionMutation, executeFollowUpActionMutation, handleDrawerFollowUpAction, handleTaskDrawerProjectionAction, openCandidateSelection, openChapterExecution, openChapterTitleRepair, openQualityRepair, openReviewStage, retryableAutoDirectorTask, retryAutoDirectorWithCurrentModelMutation, retryAutoDirectorWithTaskModelMutation, reviewTab };
}
