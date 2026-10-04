import type { BatchProgress, ComicBatchJob } from "@/api/comic";

const STATUSES = new Set(["running", "completed", "partial", "interrupted", "waiting_recovery", "cancelled"]);

// Persisted JSON is external data. An unreadable/legacy record must never be
// guessed into the currently selected episode.
export function parseBatchProgress(raw: string): BatchProgress | null {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || !STATUSES.has(value.status)) return null;
    if (![value.total, value.done, value.failed].every((n) => Number.isInteger(n) && n >= 0)) return null;
    if (!Array.isArray(value.failedPanelIds) || !value.failedPanelIds.every((id: unknown) => typeof id === "string")) return null;
    if (value.episodeId != null && typeof value.episodeId !== "string") return null;
    if (value.provider != null && typeof value.provider !== "string") return null;
    if (value.imageModel != null && typeof value.imageModel !== "string") return null;
    if (value.recoverable != null && typeof value.recoverable !== "boolean") return null;
    for (const key of ["targetPanelIds", "completedPanelIds"]) {
      if (value[key] != null && (!Array.isArray(value[key]) || !value[key].every((id: unknown) => typeof id === "string"))) return null;
    }
    if (value.errors != null && (typeof value.errors !== "object" || Array.isArray(value.errors) || !Object.values(value.errors).every((error) => typeof error === "string"))) return null;
    return value as BatchProgress;
  } catch {
    return null;
  }
}

export function selectEpisodeBatchJob(jobs: ComicBatchJob[], episodeId: string): ComicBatchJob | null {
  const candidates = jobs.filter((job) => parseBatchProgress(job.progress)?.episodeId === episodeId);
  candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return candidates.find((job) => job.status === "running") ?? candidates[0] ?? null;
}

export function remainingBatchPanels(progress: BatchProgress): number {
  return Math.max(0, progress.total - progress.done);
}

export function batchPercent(progress: BatchProgress): number {
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((progress.done + progress.failed) / progress.total) * 100)));
}
