import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updateDramaEpisode, type DramaEpisode } from "@/api/drama";
import type { ApiHttpError } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import {
  acknowledgeDraftSave,
  createDraftState,
  isDraftDirty,
  parseStoredDrafts,
  reconcileDraft,
  type EpisodeDraft,
  type EpisodeDraftState,
} from "./draftState";

function readDrafts(projectId: string) {
  try {
    return parseStoredDrafts(sessionStorage.getItem(`drama-drafts:${projectId}`));
  } catch {
    return {};
  }
}

export function useEpisodeDrafts(projectId: string, episodes: DramaEpisode[] | undefined) {
  const queryClient = useQueryClient();
  const [store, setStore] = useState(() => ({ projectId, entries: readDrafts(projectId) }));
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const pendingIds = useRef(new Set<string>());
  const storageWarning = useRef(false);
  const entries = useMemo(
    () => (store.projectId === projectId ? store.entries : {}),
    [store.projectId, store.entries, projectId],
  );

  useEffect(() => {
    setStore((current) => {
      const existing = current.projectId === projectId ? current.entries : readDrafts(projectId);
      let changed = current.projectId !== projectId;
      const next = { ...existing };
      for (const episode of episodes ?? []) {
        next[episode.id] = reconcileDraft(existing[episode.id], episode);
        changed ||= next[episode.id] !== existing[episode.id];
      }
      return changed ? { projectId, entries: next } : current;
    });
  }, [projectId, episodes]);

  useEffect(() => {
    if (store.projectId !== projectId) return;
    const unsaved = Object.fromEntries(
      Object.entries(store.entries).filter(([, state]) => isDraftDirty(state) || state.conflict),
    );
    try {
      sessionStorage.setItem(`drama-drafts:${projectId}`, JSON.stringify(unsaved));
    } catch {
      if (Object.keys(unsaved).length && !storageWarning.current) {
        storageWarning.current = true;
        toast.error("浏览器无法暂存编辑内容，请保存或下载本地稿后再关闭页面。");
      }
    }
  }, [store, projectId]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!Object.values(entries).some(isDraftDirty)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [entries]);

  function updateEntry(
    episode: DramaEpisode,
    transform: (current: EpisodeDraftState) => EpisodeDraftState,
  ) {
    setStore((current) => {
      if (current.projectId !== projectId) return current;
      return {
        ...current,
        entries: {
          ...current.entries,
          [episode.id]: transform(current.entries[episode.id] ?? createDraftState(episode)),
        },
      };
    });
  }

  const get = (episode: DramaEpisode) => reconcileDraft(entries[episode.id], episode);
  const edit = (episode: DramaEpisode, patch: Partial<EpisodeDraft>) =>
    updateEntry(episode, (state) => ({ ...state, draft: { ...state.draft, ...patch } }));
  const reload = (episode: DramaEpisode) => updateEntry(episode, () => createDraftState(episode));

  const save = async (episode: DramaEpisode) => {
    if (pendingIds.current.has(episode.id)) return;
    const state = get(episode);
    if (state.conflict) return;
    const submitted = state.draft;
    const durationSec = submitted.durationSec.trim() ? Number(submitted.durationSec) : null;
    if (!submitted.title.trim()) {
      toast.error("请填写本集标题。");
      return;
    }
    if (durationSec !== null && (!Number.isFinite(durationSec) || durationSec <= 0)) {
      toast.error("预计时长应为大于 0 的秒数，或留空。");
      return;
    }
    pendingIds.current.add(episode.id);
    setSavingIds([...pendingIds.current]);
    try {
      const response = await updateDramaEpisode(projectId, episode.order, {
        expectedRevision: state.baseRevision,
        ...submitted,
        title: submitted.title.trim(),
        hookOpening: submitted.hookOpening.trim() || null,
        cliffhanger: submitted.cliffhanger.trim() || null,
        durationSec,
      });
      if (!response.data) {
        toast.error("保存响应缺少台本，请刷新后核对。本地稿会保留。");
        return;
      }
      updateEntry(episode, (current) => acknowledgeDraftSave(current, submitted, response.data!));
      toast.success(`第 ${episode.order} 集保存成功。`);
    } catch (error) {
      if ((error as ApiHttpError).status === 409) {
        updateEntry(episode, (current) => ({ ...current, conflict: true }));
        toast.error("服务器台本有其他修改。本地稿会保留，请核对版本。");
      }
    } finally {
      pendingIds.current.delete(episode.id);
      setSavingIds([...pendingIds.current]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(projectId) });
      void queryClient.invalidateQueries({
        queryKey: ["drama", "episode-revisions", projectId, episode.order],
      });
    }
  };

  return {
    get,
    edit,
    reload,
    save,
    savingIds,
    hasUnsaved: Object.values(entries).some((state) => isDraftDirty(state) || state.conflict),
  };
}
