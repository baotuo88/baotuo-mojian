import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActiveAutoDirectorTask } from "@/api/novelWorkflow";
import { getDirectorBookAutomationProjection, getDirectorTaskSnapshot } from "@/api/novelDirector";
import { getAutoDirectorFollowUpDetail } from "@/api/autoDirectorFollowUps";
import { getTaskDetail } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import { useDirectorRealtimeStore } from "@/store/directorRealtimeStore";
import { buildDisplayAutoDirectorTask, shouldAutofocusProjectedDirectorTask, shouldPreserveRequestedDirectorTaskId } from "../novelEditAutomationStatus";
import { resolveActiveDirectorSession, resolveActiveStructuredOutlineChapterId } from "../novelEditRuntime.utils";
import { resolveAutoExecutionScopeLabel } from "../novelEditTakeover.shared";
import { tabFromDirectorDisplayStage, tabFromDirectorProgress } from "../novelWorkspaceNavigation";

/** 自动导演任务的只读模型：任务选择、快照、跟进、运行投影与刷新签名。 */
export function useNovelDirectorReadModel<TProposal extends { chapterId?: string | null }>({
  id, directorTaskId, taskPanelOpen, setDirectorTaskId, pendingCharacterResourceProposals, selectedChapterId,
}: {
  id: string; directorTaskId: string; taskPanelOpen: boolean; setDirectorTaskId: (value: string) => void;
  pendingCharacterResourceProposals: TProposal[]; selectedChapterId: string;
}) {
  const activeTaskQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTask(id), queryFn: () => getActiveAutoDirectorTask(id), enabled: Boolean(id),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && ["queued", "running", "waiting_approval"].includes(task.status) ? 4000 : false;
    },
  });
  const automationQuery = useQuery({
    queryKey: queryKeys.novels.directorBookAutomation(id), queryFn: () => getDirectorBookAutomationProjection(id), enabled: Boolean(id), retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.projection.status;
      return status && ["queued", "running", "waiting_approval"].includes(status) ? 4000 : false;
    },
  });
  const latestTask = activeTaskQuery.isFetchedAfterMount ? activeTaskQuery.data?.data ?? null : null;
  const activeAutoDirectorTask = latestTask?.status === "cancelled" ? null : latestTask;
  const bookAutomationProjection = automationQuery.data?.data?.projection ?? null;
  const requestedTaskId = directorTaskId || activeAutoDirectorTask?.id
    || (shouldAutofocusProjectedDirectorTask(bookAutomationProjection) ? bookAutomationProjection?.latestTask?.id : "") || "";
  const requestedTaskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("novel_workflow", requestedTaskId || "none"),
    queryFn: () => getTaskDetail("novel_workflow", requestedTaskId), enabled: Boolean(requestedTaskId), retry: false,
  });
  const requestedTask = requestedTaskQuery.data?.data ?? null;
  const visibleDirectorTask = useMemo(() => {
    const task = requestedTask ?? activeAutoDirectorTask;
    if (!directorTaskId && !taskPanelOpen && task?.status === "cancelled") return null;
    return buildDisplayAutoDirectorTask(task, bookAutomationProjection);
  }, [activeAutoDirectorTask, bookAutomationProjection, directorTaskId, requestedTask, taskPanelOpen]);
  const displayAutoDirectorTask = visibleDirectorTask;
  const actionTargetDirectorTaskId = visibleDirectorTask?.id ?? "";
  const selectedTaskId = visibleDirectorTask?.id ?? requestedTaskId;

  useEffect(() => {
    if (!id || !activeTaskQuery.isSuccess) return;
    const canonicalId = activeAutoDirectorTask?.id ?? "";
    if (!canonicalId && taskPanelOpen && directorTaskId) return;
    if (!canonicalId && directorTaskId && !requestedTaskQuery.isFetched) return;
    if (!canonicalId && shouldPreserveRequestedDirectorTaskId({ directorTaskId, requestedTask })) return;
    if (directorTaskId !== canonicalId) setDirectorTaskId(canonicalId);
  }, [activeAutoDirectorTask?.id, activeTaskQuery.isSuccess, directorTaskId, id, requestedTask, requestedTaskQuery.isFetched, setDirectorTaskId, taskPanelOpen]);
  useEffect(() => {
    if (id && activeTaskQuery.isSuccess) useDirectorRealtimeStore.getState().setFromAutoDirectorTask(id, activeAutoDirectorTask);
  }, [id, activeAutoDirectorTask, activeTaskQuery.isSuccess]);

  const activeDirectorSession = useMemo(() => resolveActiveDirectorSession(activeAutoDirectorTask), [activeAutoDirectorTask]);
  const chapterPendingCharacterResourceProposals = useMemo(
    () => pendingCharacterResourceProposals.filter((proposal) => !selectedChapterId || proposal.chapterId === selectedChapterId),
    [pendingCharacterResourceProposals, selectedChapterId],
  );
  const activeAutoExecutionScopeLabel = resolveAutoExecutionScopeLabel(visibleDirectorTask);
  const activeChapterTitleWarning = useMemo(() => resolveChapterTitleWarning(displayAutoDirectorTask), [displayAutoDirectorTask]);
  const snapshotQuery = useQuery({
    queryKey: queryKeys.tasks.directorTaskSnapshot(selectedTaskId || "none"), queryFn: () => getDirectorTaskSnapshot(selectedTaskId), enabled: Boolean(selectedTaskId), retry: false,
    refetchInterval: () => displayAutoDirectorTask && ["queued", "running", "waiting_approval"].includes(displayAutoDirectorTask.status) ? 4000 : false,
  });
  const activeDirectorSnapshot = snapshotQuery.data?.data?.snapshot ?? null;
  const activeStructuredOutlineChapterId = useMemo(() => resolveActiveStructuredOutlineChapterId(activeDirectorSnapshot), [activeDirectorSnapshot]);
  const activeDirectorRuntimeSnapshot = activeDirectorSnapshot?.runtime ?? null;
  const activeDirectorRuntimeProjection = activeDirectorSnapshot?.projection ?? null;
  const activeDirectorDashboardView = activeDirectorSnapshot?.dashboardView ?? null;
  const activeDirectorRuntimeHardBlocked = activeDirectorDashboardView?.mode === "failed" || activeDirectorDashboardView?.mode === "recovering"
    || (activeDirectorDashboardView?.mode !== "running" && activeDirectorRuntimeProjection?.status === "blocked");
  const activeDirectorRuntimeBlockedReason = activeDirectorDashboardView?.userActionReason?.trim()
    || activeDirectorRuntimeProjection?.blockedReason?.trim() || activeDirectorRuntimeProjection?.detail?.trim() || null;
  const followUpQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.detail(selectedTaskId || "none"), queryFn: () => getAutoDirectorFollowUpDetail(selectedTaskId), enabled: Boolean(selectedTaskId), retry: false,
    refetchInterval: () => displayAutoDirectorTask && ["queued", "running", "waiting_approval"].includes(displayAutoDirectorTask.status) ? 4000 : false,
  });
  const activeAutoDirectorFollowUp = followUpQuery.data?.data ?? null;
  const workflowCurrentTab = useMemo(() => tabFromDirectorDisplayStage(activeDirectorSnapshot?.displayState.stageKey ?? null) || tabFromDirectorProgress({
    currentStage: activeAutoDirectorTask?.currentStage, currentItemKey: activeAutoDirectorTask?.currentItemKey,
    checkpointType: activeAutoDirectorTask?.checkpointType, reviewScope: activeDirectorSession?.reviewScope ?? null, status: activeAutoDirectorTask?.status,
  }), [activeDirectorSnapshot?.displayState.stageKey, activeAutoDirectorTask?.checkpointType, activeAutoDirectorTask?.currentItemKey, activeAutoDirectorTask?.currentStage, activeDirectorSession?.reviewScope, activeAutoDirectorTask?.status]);

  const autoDirectorRefreshSignatureRef = useRef("");
  const autoDirectorArtifactSignatureRef = useRef("");
  const autoDirectorWorkspaceSignatureRef = useRef("");
  const activeAutoDirectorRefreshSignature = useMemo(() => activeAutoDirectorTask ? [activeAutoDirectorTask.id, activeAutoDirectorTask.status, activeAutoDirectorTask.pendingManualRecovery ? "manual_recovery" : "", activeAutoDirectorTask.currentStage ?? "", activeAutoDirectorTask.currentItemKey ?? "", activeAutoDirectorTask.checkpointType ?? ""].join("|") : "", [activeAutoDirectorTask]);
  const activeAutoDirectorArtifactSignature = useMemo(() => {
    if (!activeAutoDirectorTask) return "";
    const milestones = Array.isArray(activeAutoDirectorTask.meta?.milestones) ? activeAutoDirectorTask.meta.milestones.length : 0;
    const phase = activeAutoDirectorTask.meta?.directorSession && typeof activeAutoDirectorTask.meta.directorSession === "object" ? JSON.stringify((activeAutoDirectorTask.meta.directorSession as { phase?: unknown }).phase ?? "") : "";
    return [activeAutoDirectorTask.status, activeAutoDirectorTask.checkpointType ?? "", phase, milestones].join("|");
  }, [activeAutoDirectorTask]);
  const activeAutoDirectorWorkspaceSignature = useMemo(() => {
    if (!activeAutoDirectorTask || !activeDirectorSnapshot) return "";
    const event = activeDirectorSnapshot.recentEvents.at(-1);
    const progress = activeDirectorSnapshot.projection?.progressBreakdown;
    return [activeAutoDirectorTask.id, activeAutoDirectorTask.status, activeDirectorSnapshot.displayState.stageKey, activeDirectorSnapshot.currentFactStepId ?? "", activeDirectorSnapshot.displayState.progressPercent, progress?.planningPercent ?? "", progress?.chapterExecutionPercent ?? "", progress?.qualityRepairPercent ?? "", progress?.activeJobProgress ?? "", event?.eventId ?? "", activeDirectorSnapshot.artifacts.length, activeDirectorSnapshot.task.currentItemKey ?? "", activeDirectorSnapshot.task.checkpointType ?? ""].join("|");
  }, [activeAutoDirectorTask, activeDirectorSnapshot]);

  return { activeAutoDirectorTask, bookAutomationProjection, visibleDirectorTask, displayAutoDirectorTask, actionTargetDirectorTaskId, activeDirectorSession, chapterPendingCharacterResourceProposals, activeAutoExecutionScopeLabel, activeChapterTitleWarning, activeDirectorSnapshot, activeStructuredOutlineChapterId, activeDirectorRuntimeSnapshot, activeDirectorRuntimeProjection, activeDirectorDashboardView, activeDirectorRuntimeHardBlocked, activeDirectorRuntimeBlockedReason, activeAutoDirectorFollowUp, workflowCurrentTab, autoDirectorRefreshSignatureRef, autoDirectorArtifactSignatureRef, autoDirectorWorkspaceSignatureRef, activeAutoDirectorRefreshSignature, activeAutoDirectorArtifactSignature, activeAutoDirectorWorkspaceSignature };
}
