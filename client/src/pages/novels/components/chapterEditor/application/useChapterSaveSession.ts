import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Chapter } from "@ai-novel/shared/types/novel";
import {
  createNovelSnapshot,
  getNovelChapters,
  getNovelDetail,
  updateNovelChapter,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { normalizeChapterContent } from "../chapterEditorUtils";
import { ChapterSaveSession, type ChapterDraftRecord } from "./ChapterSaveSession";

const sessions = new Map<string, ChapterSaveSession>();
const cacheKey = (novelId: string, chapterId: string) =>
  `dsh:chapter-draft:${novelId}:${chapterId}`;

function readCache(key: string): ChapterDraftRecord | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw);
      if (value?.format === "chapter-draft-v1" && typeof value.content === "string") return value;
    } catch {
      /* Historical caches contain plain chapter text. */
    }
    return { content: raw };
  } catch {
    return null;
  }
}

function acquireSession(
  novelId: string,
  chapterId: string,
  content: string | null,
  onSaved: (chapter: Chapter) => void,
): ChapterSaveSession {
  const key = cacheKey(novelId, chapterId);
  const existing = sessions.get(key);
  if (existing) return existing;
  const session: ChapterSaveSession = new ChapterSaveSession({
    content,
    cachedDraft: readCache(key),
    normalize: normalizeChapterContent,
    write: async (nextContent, expectedContent) => {
      try {
        const response = await updateNovelChapter(novelId, chapterId, {
          content: nextContent,
          expectedContent,
        });
        if (!response.data) throw new Error("服务器未确认章节保存，草稿已保留。");
        onSaved(response.data);
        return response.data.content ?? null;
      } catch (error) {
        if ((error as { status?: number }).status === 409) {
          const latest = await getNovelChapters(novelId);
          const chapter = latest.data?.find((item) => item.id === chapterId);
          if (chapter) session.receiveServer(chapter.content ?? null);
        }
        throw error;
      }
    },
    persist: (draft) => {
      try {
        if (draft)
          window.localStorage.setItem(
            key,
            JSON.stringify({ format: "chapter-draft-v1", ...draft }),
          );
        else window.localStorage.removeItem(key);
      } catch {
        /* The live draft remains available when browser storage is unavailable. */
      }
    },
  });
  sessions.set(key, session);
  return session;
}

export function useChapterSaveSession(novelId: string, chapterId: string, content: string | null) {
  const queryClient = useQueryClient();
  const [session] = useState(() =>
    acquireSession(novelId, chapterId, content, (chapter) => {
      queryClient.setQueryData<Awaited<ReturnType<typeof getNovelDetail>>>(
        queryKeys.novels.detail(novelId),
        (current) =>
          current?.data
            ? {
                ...current,
                data: {
                  ...current.data,
                  chapters: current.data.chapters.map((item) =>
                    item.id === chapterId ? chapter : item,
                  ),
                },
              }
            : current,
      );
      void queryClient
        .invalidateQueries({
          queryKey: queryKeys.novels.chapterEditorWorkspace(novelId, chapterId),
        })
        .catch(() => undefined);
    }),
  );
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    session.receiveServer(content);
  }, [session, content]);
  useEffect(() => {
    if (!state.dirty || state.status === "error" || state.remoteContent !== undefined) return;
    const timer = window.setTimeout(() => {
      void session.save().catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [session, state.draft, state.dirty, state.remoteContent, state.status]);
  return {
    ...state,
    setDraft: (value: string) => session.setDraft(value),
    getDraft: () => session.getSnapshot().draft,
    save: () => session.save(),
    keepLocalVersion: async () => {
      const remoteContent = session.getSnapshot().remoteContent;
      if (remoteContent === undefined) return session.save();
      const snapshot = await createNovelSnapshot(novelId, {
        triggerType: "manual",
        label: `before-editor-conflict-${chapterId}`,
      });
      if (!snapshot.data?.id) throw new Error("服务器稿备份尚未确认，请重试。");
      await session.keepLocalVersion(remoteContent);
    },
  };
}
