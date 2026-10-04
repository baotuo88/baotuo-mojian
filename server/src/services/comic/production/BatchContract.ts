import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ComicBatchJob } from "@prisma/client";

export const BATCH_TYPE = "episode_image_batch";
export const LEASE_MS = 90_000;
export type BatchStatus = "running" | "completed" | "partial" | "interrupted" | "cancelled";
export interface BatchProgress {
  version: 1;
  episodeId: string;
  provider: LLMProvider;
  imageModel: string;
  concurrency: number;
  targetPanelIds: string[];
  completedPanelIds: string[];
  failedPanelIds: string[];
  sourceFingerprints: Record<string, string>;
  initialImageRevisions: Record<string, string | null>;
  errors: Record<string, string>;
  total: number;
  done: number;
  failed: number;
  status: BatchStatus;
  leaseOwner: string;
  leaseExpiresAt: number;
}
export interface StartBatchOptions {
  provider?: LLMProvider;
  concurrency?: number;
  skipDone?: boolean;
  expectedScopeFingerprint?: string;
}

export function readBatchProgress(raw: string): BatchProgress | null {
  try {
    const p = JSON.parse(raw) as BatchProgress;
    const ids = (value: unknown): value is string[] => Array.isArray(value)
      && value.every((id) => typeof id === "string");
    if (!p || p.version !== 1 || typeof p.episodeId !== "string" || !p.episodeId
      || typeof p.provider !== "string" || !p.provider || typeof p.leaseOwner !== "string" || !p.leaseOwner
      || typeof p.imageModel !== "string" || !p.imageModel
      || !Number.isFinite(p.leaseExpiresAt) || !Number.isInteger(p.concurrency)
      || p.concurrency < 1 || p.concurrency > 10
      || !ids(p.targetPanelIds) || !ids(p.completedPanelIds) || !ids(p.failedPanelIds)
      || !p.sourceFingerprints || !p.initialImageRevisions || !p.errors) return null;
    const targets = new Set(p.targetPanelIds);
    if (!targets.size || targets.size !== p.targetPanelIds.length || p.total !== targets.size
      || new Set(p.completedPanelIds).size !== p.completedPanelIds.length
      || new Set(p.failedPanelIds).size !== p.failedPanelIds.length
      || p.completedPanelIds.some((id) => !targets.has(id))
      || p.failedPanelIds.some((id) => !targets.has(id) || p.completedPanelIds.includes(id))
      || p.targetPanelIds.some((id) => typeof p.sourceFingerprints[id] !== "string"
        || !Object.hasOwn(p.initialImageRevisions, id))) return null;
    return p;
  } catch { return null; }
}

export function isLiveBatch(job: ComicBatchJob, now = Date.now()): boolean {
  const p = readBatchProgress(job.progress);
  return job.status === "running" && p !== null && p.leaseExpiresAt > now;
}

/** Read-only projection; a restarted server never starts a billable request on a GET. */
export function projectBatchJob(job: ComicBatchJob, now = Date.now()): ComicBatchJob {
  const p = readBatchProgress(job.progress);
  const status = job.status === "running" && !isLiveBatch(job, now) ? "interrupted" : job.status;
  let progress: Record<string, unknown>;
  try { progress = JSON.parse(job.progress); } catch { progress = {}; }
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) progress = {};
  // Do not expose persisted input fingerprints/leases; retain the UI progress contract.
  const { leaseOwner: _owner, sourceFingerprints: _sources, initialImageRevisions: _images, ...visible } = progress;
  return { ...job, status, progress: JSON.stringify({ ...visible,
    ...(job.episodeId ? { episodeId: job.episodeId } : {}), status, recoverable: p !== null }) };
}
