import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { DirectorTaskSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { useStructuredOutlineWorkspaceStore } from "../stores/useStructuredOutlineWorkspaceStore";
import { syncNovelWorkflowStageSilently, workflowStageFromTab } from "../novelWorkflow.client";
import {
  isNovelWorkspaceFlowTab,
  tabFromDirectorDisplayStage,
  type NovelWorkspaceFlowTab,
} from "../novelWorkspaceNavigation";

interface VolumeWithChapters {
  id: string;
  chapters: Array<{ id?: string | null; chapterId?: string | null }>;
}

interface UseNovelDirectorWorkspaceSyncArgs {
  id: string;
  activeTab: string;
  selectedChapterId: string;
  selectedVolumeId: string;
  selectedChapterOrder?: number;
  normalizedVolumeDraft: VolumeWithChapters[];
  activeStructuredOutlineChapterId: string;
  activeAutoDirectorTask: UnifiedTaskDetail | null;
  activeDirectorSnapshot: DirectorTaskSnapshot | null;
  workflowCurrentTab: NovelWorkspaceFlowTab | null;
  activeAutoDirectorRefreshSignature: string;
  activeAutoDirectorWorkspaceSignature: string;
  activeAutoDirectorArtifactSignature: string;
  refreshSignatureRef: MutableRefObject<string>;
  workspaceSignatureRef: MutableRefObject<string>;
  artifactSignatureRef: MutableRefObject<string>;
  invalidateAutoDirectorTaskState: (taskId?: string) => Promise<void>;
  invalidateWorkspaceDataForTabs: (tabs: Array<NovelWorkspaceFlowTab | null | undefined>) => Promise<void>;
  invalidateVisibleWorkspaceData: () => Promise<void>;
}

/** 同步导演运行投影、结构化拆章选中项和用户当前工作阶段。 */
export function useNovelDirectorWorkspaceSync({
  id,
  activeTab,
  selectedChapterId,
  selectedVolumeId,
  selectedChapterOrder,
  normalizedVolumeDraft,
  activeStructuredOutlineChapterId,
  activeAutoDirectorTask,
  activeDirectorSnapshot,
  workflowCurrentTab,
  activeAutoDirectorRefreshSignature,
  activeAutoDirectorWorkspaceSignature,
  activeAutoDirectorArtifactSignature,
  refreshSignatureRef,
  workspaceSignatureRef,
  artifactSignatureRef,
  invalidateAutoDirectorTaskState,
  invalidateWorkspaceDataForTabs,
  invalidateVisibleWorkspaceData,
}: UseNovelDirectorWorkspaceSyncArgs): void {
  useEffect(() => {
    if (!id) return;
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: selectedVolumeId || undefined,
      selectedChapterId: selectedChapterId || undefined,
    });
  }, [id, selectedChapterId, selectedVolumeId]);

  useEffect(() => {
    if (!id || activeTab !== "structured" || !activeStructuredOutlineChapterId) return;
    const targetVolume = normalizedVolumeDraft.find((volume) => volume.chapters.some((chapter) => (
      chapter.id === activeStructuredOutlineChapterId || chapter.chapterId === activeStructuredOutlineChapterId
    )));
    if (!targetVolume) return;
    const current = useStructuredOutlineWorkspaceStore.getState().workspaces[id];
    if (current?.selectedChapterId === activeStructuredOutlineChapterId && current.selectedVolumeId === targetVolume.id && current.selectedBeatKey === "all") return;
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: targetVolume.id,
      selectedChapterId: activeStructuredOutlineChapterId,
      selectedBeatKey: "all",
    });
  }, [activeStructuredOutlineChapterId, activeTab, id, normalizedVolumeDraft]);

  useEffect(() => {
    if (!id) return;
    if (activeAutoDirectorTask && ["queued", "running", "waiting_approval"].includes(activeAutoDirectorTask.status)) return;
    const labels: Record<string, string> = {
      basic: "项目设定已打开", story_macro: "故事宏观规划已打开", character: "角色准备已打开",
      outline: "卷战略 / 卷骨架已打开", structured: "节奏 / 拆章已打开",
      chapter: selectedChapterOrder ? `正在查看第${selectedChapterOrder}章执行面板` : "章节执行已打开",
      pipeline: "质量修复 / 流水线已打开",
    };
    void syncNovelWorkflowStageSilently({
      novelId: id,
      stage: workflowStageFromTab(activeTab),
      itemLabel: labels[activeTab] ?? "小说主流程已打开",
      chapterId: activeTab === "chapter" ? selectedChapterId || undefined : undefined,
      volumeId: activeTab === "structured" || activeTab === "outline" ? selectedVolumeId || undefined : undefined,
      status: "waiting_approval",
    });
  }, [activeAutoDirectorTask, activeTab, id, selectedChapterId, selectedChapterOrder, selectedVolumeId]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask || !activeAutoDirectorRefreshSignature) {
      refreshSignatureRef.current = activeAutoDirectorRefreshSignature;
      return;
    }
    if (!refreshSignatureRef.current) { refreshSignatureRef.current = activeAutoDirectorRefreshSignature; return; }
    if (refreshSignatureRef.current === activeAutoDirectorRefreshSignature) return;
    refreshSignatureRef.current = activeAutoDirectorRefreshSignature;
    void invalidateAutoDirectorTaskState(activeAutoDirectorTask.id);
  }, [activeAutoDirectorRefreshSignature, activeAutoDirectorTask, id]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask || !activeAutoDirectorWorkspaceSignature) {
      workspaceSignatureRef.current = activeAutoDirectorWorkspaceSignature;
      return;
    }
    if (!workspaceSignatureRef.current) { workspaceSignatureRef.current = activeAutoDirectorWorkspaceSignature; return; }
    if (workspaceSignatureRef.current === activeAutoDirectorWorkspaceSignature) return;
    workspaceSignatureRef.current = activeAutoDirectorWorkspaceSignature;
    const recommendedTab = tabFromDirectorDisplayStage(activeDirectorSnapshot?.displayState.stageKey ?? null);
    void invalidateWorkspaceDataForTabs([isNovelWorkspaceFlowTab(activeTab) ? activeTab : null, recommendedTab, workflowCurrentTab]);
  }, [activeAutoDirectorTask, activeAutoDirectorWorkspaceSignature, activeDirectorSnapshot?.displayState.stageKey, activeTab, id, workflowCurrentTab]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask || !activeAutoDirectorArtifactSignature) {
      artifactSignatureRef.current = activeAutoDirectorArtifactSignature;
      return;
    }
    if (!artifactSignatureRef.current) { artifactSignatureRef.current = activeAutoDirectorArtifactSignature; return; }
    if (artifactSignatureRef.current === activeAutoDirectorArtifactSignature) return;
    artifactSignatureRef.current = activeAutoDirectorArtifactSignature;
    void invalidateVisibleWorkspaceData();
  }, [activeAutoDirectorArtifactSignature, activeAutoDirectorTask, id, selectedChapterId]);
}
