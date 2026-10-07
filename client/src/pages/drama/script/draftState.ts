import type { DramaEpisode } from "@/api/drama";

export interface EpisodeDraft {
  title: string;
  hookOpening: string;
  cliffhanger: string;
  content: string;
  durationSec: string;
}

export interface EpisodeDraftState {
  baseRevision: number;
  base: EpisodeDraft;
  draft: EpisodeDraft;
  conflict: boolean;
}

export function episodeDraft(episode: DramaEpisode): EpisodeDraft {
  return {
    title: episode.title,
    hookOpening: episode.hookOpening ?? "",
    cliffhanger: episode.cliffhanger ?? "",
    content: episode.content ?? "",
    durationSec: episode.durationSec == null ? "" : String(episode.durationSec),
  };
}

export function createDraftState(episode: DramaEpisode): EpisodeDraftState {
  const draft = episodeDraft(episode);
  return { baseRevision: episode.revision, base: draft, draft, conflict: false };
}

function sameDraft(left: EpisodeDraft, right: EpisodeDraft): boolean {
  return (Object.keys(left) as Array<keyof EpisodeDraft>).every((key) => left[key] === right[key]);
}

export function isDraftDirty(state: EpisodeDraftState): boolean {
  return !sameDraft(state.base, state.draft);
}

/** Refetch may update a clean draft, but never replace an unsaved local edit. */
export function reconcileDraft(
  state: EpisodeDraftState | undefined,
  episode: DramaEpisode,
): EpisodeDraftState {
  if (!state) return createDraftState(episode);
  if (episode.revision <= state.baseRevision) return state;
  if (isDraftDirty(state) || state.conflict)
    return state.conflict ? state : { ...state, conflict: true };
  return createDraftState(episode);
}

/** A save acknowledges the submitted draft, preserving typing that happened during the request. */
export function acknowledgeDraftSave(
  state: EpisodeDraftState,
  submitted: EpisodeDraft,
  saved: DramaEpisode,
): EpisodeDraftState {
  const next = createDraftState(saved);
  if (!sameDraft(state.draft, submitted)) next.draft = state.draft;
  return next;
}

export function draftAsText(draft: EpisodeDraft): string {
  return [
    draft.title,
    `预计时长：${draft.durationSec || "未填写"} 秒`,
    `开场钩子：${draft.hookOpening}`,
    `结尾卡点：${draft.cliffhanger}`,
    "",
    draft.content,
  ].join("\n\n");
}

export function parseStoredDrafts(raw: string | null): Record<string, EpisodeDraftState> {
  try {
    const data: unknown = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => {
        if (!value || typeof value !== "object") return false;
        const state = value as EpisodeDraftState;
        const validDraft = (draft: EpisodeDraft) =>
          draft &&
          ["title", "hookOpening", "cliffhanger", "content", "durationSec"].every(
            (key) => typeof draft[key as keyof EpisodeDraft] === "string",
          );
        return (
          Number.isInteger(state.baseRevision) &&
          state.baseRevision >= 0 &&
          typeof state.conflict === "boolean" &&
          validDraft(state.base) &&
          validDraft(state.draft)
        );
      }),
    );
  } catch {
    return {};
  }
}
