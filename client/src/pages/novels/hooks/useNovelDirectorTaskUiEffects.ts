import { useEffect } from "react";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { takeoverDismissStorageKey } from "../novelEditRuntime.utils";

interface LlmSelection {
  provider: string;
  model: string;
  temperature: number;
}

interface UseNovelDirectorTaskUiEffectsArgs {
  id: string;
  llmProvider: string;
  llmModel: string;
  llmTemperature: number;
  activeAutoDirectorTask: UnifiedTaskDetail | null;
  displayAutoDirectorTask: UnifiedTaskDetail | null;
  taskPanelOpen: boolean;
  autoOpenedFailedTaskId: string;
  setAutoOpenedFailedTaskId: (value: string) => void;
  setRetryOverride: (value: LlmSelection) => void;
  setIsTaskDrawerOpen: (value: boolean) => void;
  setIsDirectorExitActionExpanded: (value: boolean) => void;
  setDismissedTakeoverSignature: (value: string) => void;
  activeAutoDirectorRefreshSignature: string;
}

/**
 * 自动导演提醒的 UI 副作用：失败任务自动打开抽屉、任务结束时收起退出动作、
 * 以及按任务签名读取提醒收起状态。它不负责任务数据请求或业务 mutation。
 */
export function useNovelDirectorTaskUiEffects({
  id,
  llmProvider,
  llmModel,
  llmTemperature,
  activeAutoDirectorTask,
  displayAutoDirectorTask,
  taskPanelOpen,
  autoOpenedFailedTaskId,
  setAutoOpenedFailedTaskId,
  setRetryOverride,
  setIsTaskDrawerOpen,
  setIsDirectorExitActionExpanded,
  setDismissedTakeoverSignature,
  activeAutoDirectorRefreshSignature,
}: UseNovelDirectorTaskUiEffectsArgs): void {
  useEffect(() => {
    setRetryOverride({ provider: llmProvider, model: llmModel, temperature: llmTemperature });
  }, [activeAutoDirectorTask?.id, llmModel, llmProvider, llmTemperature, setRetryOverride]);

  useEffect(() => {
    if (activeAutoDirectorTask?.status !== "failed") {
      if (autoOpenedFailedTaskId) setAutoOpenedFailedTaskId("");
      return;
    }
    if (!activeAutoDirectorTask.id || activeAutoDirectorTask.id === autoOpenedFailedTaskId) return;
    setIsTaskDrawerOpen(true);
    setAutoOpenedFailedTaskId(activeAutoDirectorTask.id);
  }, [activeAutoDirectorTask?.id, activeAutoDirectorTask?.status, autoOpenedFailedTaskId, setAutoOpenedFailedTaskId, setIsTaskDrawerOpen]);

  useEffect(() => {
    if (!taskPanelOpen || !displayAutoDirectorTask?.id) return;
    setIsTaskDrawerOpen(true);
  }, [displayAutoDirectorTask?.id, taskPanelOpen, setIsTaskDrawerOpen]);

  useEffect(() => {
    if (!activeAutoDirectorTask) {
      setIsDirectorExitActionExpanded(false);
      setDismissedTakeoverSignature("");
      window.sessionStorage.removeItem(takeoverDismissStorageKey(id));
      return;
    }
    if (!["queued", "running", "waiting_approval"].includes(activeAutoDirectorTask.status)) {
      setIsDirectorExitActionExpanded(false);
    }
  }, [activeAutoDirectorTask, id, setDismissedTakeoverSignature, setIsDirectorExitActionExpanded]);

  useEffect(() => {
    if (!id || !activeAutoDirectorRefreshSignature) return;
    const storedDismissedSignature = window.sessionStorage.getItem(takeoverDismissStorageKey(id)) ?? "";
    setDismissedTakeoverSignature(storedDismissedSignature);
  }, [activeAutoDirectorRefreshSignature, id, setDismissedTakeoverSignature]);
}
