import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";
import { isLiveBatch } from "../production";

export function planningFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function assertPlanningIdle(tx: Prisma.TransactionClient, projectId: string, episodeIds?: string[]): Promise<void> {
  const jobs = await tx.comicBatchJob.findMany({
    where: {
      projectId,
      type: { not: "planning_backup" },
      status: { in: ["pending", "running", "processing"] },
      ...(episodeIds?.length ? { OR: [{ episodeId: { in: episodeIds } }, { episodeId: null }] } : {}),
    },
  });
  const active = jobs.some((job) => job.type === "episode_image_batch" ? isLiveBatch(job) : true);
  if (active) throw new AppError("本话有生成任务正在执行，请等待任务结束后再修改规划。", 409);
}

/** Keeps complete database records and their image URLs; production images are never removed here. */
export async function archivePlanningRecords(tx: Prisma.TransactionClient, input: {
  projectId: string;
  reason: "outline_replacement" | "script_replacement" | "fact_replacement";
  episodes: unknown[];
  facts: unknown[];
}): Promise<string> {
  const progress = JSON.stringify({ schemaVersion: 1, kind: "comic_planning_backup", ...input, createdAt: new Date().toISOString() });
  const backup = await tx.comicBatchJob.create({
    data: { projectId: input.projectId, type: "planning_backup", status: "completed", progress },
  });
  const verified = await tx.comicBatchJob.findUnique({ where: { id: backup.id }, select: { id: true, progress: true } });
  if (!verified || verified.progress !== progress) throw new AppError("原稿备份未能验证，已保留现有分话和分镜。", 500);
  return backup.id;
}

export async function claimEpisodeRevision(tx: Prisma.TransactionClient, episode: {
  id: string; updatedAt: Date; scriptConfig: string | null; outline: string | null; sourceText: string | null;
}): Promise<void> {
  const claim = await tx.comicEpisode.updateMany({
    where: { id: episode.id, updatedAt: episode.updatedAt, scriptConfig: episode.scriptConfig, outline: episode.outline, sourceText: episode.sourceText },
    // A no-op write holds the row lock without changing the revision fingerprint.
    data: { updatedAt: episode.updatedAt },
  });
  if (claim.count !== 1) throw new AppError("本话内容在生成期间发生变化，请查看最新内容后重试。", 409);
}
