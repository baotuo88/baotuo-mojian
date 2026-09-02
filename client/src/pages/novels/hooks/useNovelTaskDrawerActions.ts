import { useMemo } from "react";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { toast } from "@/components/ui/toast";
import { canCancelDirectorTask } from "@/lib/novelWorkflowTaskUi";
import type { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import type { NovelTaskDrawerState } from "../components/workspace/NovelEditView.types.ts";
import {
  buildContinueAutoExecutionActionLabel,
  buildReplanAndContinueActionLabel,
  resolveAutoExecutionScopeLabel,
} from "../novelEditTakeover.shared";

/**
 * 任务抽屉（执行详情）中的操作按钮组装。
 * 从 NovelEdit 拆出：按导演任务状态、检查点与一致性问题生成抽屉底部的动作列表。
 */

interface PendingFlagMutation<TVars> {
  isPending: boolean;
  mutate: (variables: TVars) => void;
}

export interface UseNovelTaskDrawerActionsArgs {
  displayAutoDirectorTask: UnifiedTaskDetail | null;
  activeChapterTitleWarning: { label: string } | null;
  consistencyIssue: string | null;
  reviewTab: string | null;
  hasUnsavedVolumeDraft: boolean;
  chapterTitleRepairMutation: ReturnType<typeof useDirectorChapterTitleRepair>;
  continueAutoDirectorMutation: PendingFlagMutation<{ directorTaskId?: string } | undefined>;
  continueAutoExecutionMutation: PendingFlagMutation<{ directorTaskId?: string; continuationMode?: "auto_execute_range" | "skip_quality_repair" } | undefined>;
  cancelAutoDirectorMutation: PendingFlagMutation<string | undefined>;
  openCandidateSelection: (directorTaskId?: string) => void;
  openChapterExecution: (task: UnifiedTaskDetail | null) => void;
  openQualityRepair: (task: UnifiedTaskDetail) => void;
  openReviewStage: () => void;
  setActiveTab: (tab: string) => void;
  setIsTaskDrawerOpen: (open: boolean) => void;
}

export function useNovelTaskDrawerActions({
  activeChapterTitleWarning,
  cancelAutoDirectorMutation,
  chapterTitleRepairMutation,
  consistencyIssue,
  continueAutoDirectorMutation,
  continueAutoExecutionMutation,
  displayAutoDirectorTask,
  hasUnsavedVolumeDraft,
  openCandidateSelection,
  openChapterExecution,
  openQualityRepair,
  openReviewStage,
  reviewTab,
  setActiveTab,
  setIsTaskDrawerOpen,
}: UseNovelTaskDrawerActionsArgs): NovelTaskDrawerState["actions"] {
  return useMemo<NovelTaskDrawerState["actions"]>(() => {
    const task = displayAutoDirectorTask;
    if (!task) {
      return [];
    }
    const actions: NovelTaskDrawerState["actions"] = [];
    if (activeChapterTitleWarning) {
      actions.push({
        label: chapterTitleRepairMutation.isPending && chapterTitleRepairMutation.pendingTaskId === task.id
          ? "AI 修复中..."
          : activeChapterTitleWarning.label,
        onClick: () => {
          if (hasUnsavedVolumeDraft) {
            toast.error("当前拆章工作区还有未保存修改，请先保存工作区，再发起 AI 修复标题。");
            return;
          }
          chapterTitleRepairMutation.startRepair(task);
        },
        variant: "default",
        disabled: chapterTitleRepairMutation.isPending,
      });
    }
    if (consistencyIssue) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "补齐中..." : "补齐导演产物",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
      if (consistencyIssue === "missing_characters") {
        actions.push({
          label: "去角色准备",
          onClick: () => {
            setActiveTab("character");
            setIsTaskDrawerOpen(false);
          },
          variant: "outline",
        });
      }
    } else if (
      task.checkpointType === "replan_required"
      && (task.status === "waiting_approval" || task.status === "failed" || task.status === "cancelled")
    ) {
      actions.push({
        label: buildReplanAndContinueActionLabel(continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({
          directorTaskId: task.id,
          continuationMode: "auto_execute_range",
        }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: () => openQualityRepair(task),
        variant: "outline",
      });
    } else if (task.pendingManualRecovery) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
    } else if (
      task.status === "waiting_approval"
      && task.checkpointType === "chapter_batch_ready"
    ) {
      const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "进入章节执行",
        onClick: () => openChapterExecution(task),
        variant: "outline",
      });
    } else if (task.status === "waiting_approval" && task.checkpointType === "candidate_selection_required") {
      actions.push({
        label: "去确认书级方向",
        onClick: () => openCandidateSelection(task.id),
        variant: "default",
      });
    } else if (
      task.status === "waiting_approval"
      && reviewTab
      && task.checkpointType !== "chapter_batch_ready"
    ) {
      actions.push({
        label: "去当前审核阶段",
        onClick: openReviewStage,
        variant: "default",
      });
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "outline",
        disabled: continueAutoDirectorMutation.isPending,
      });
    } else if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
      const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: () => openQualityRepair(task),
        variant: "outline",
      });
    } else if (task.checkpointType === "chapter_batch_ready" || task.checkpointType === "workflow_completed") {
      actions.push({
        label: "进入章节执行",
        onClick: () => openChapterExecution(task),
        variant: "default",
      });
    }



    if (canCancelDirectorTask(task)) {
      actions.push({
        label: cancelAutoDirectorMutation.isPending ? "取消中..." : "取消任务",
        onClick: () => cancelAutoDirectorMutation.mutate(task.id),
        variant: "destructive",
        disabled: cancelAutoDirectorMutation.isPending,
      });
    }
    return actions;
  }, [
    activeChapterTitleWarning,
    cancelAutoDirectorMutation,
    chapterTitleRepairMutation,
    consistencyIssue,
    continueAutoDirectorMutation,
    continueAutoExecutionMutation,
    displayAutoDirectorTask,
    hasUnsavedVolumeDraft,
    openCandidateSelection,
    openReviewStage,
    openChapterExecution,
    openQualityRepair,
    reviewTab,
    setActiveTab,
  ]);
}
