export { ensurePendingDramaFacts } from "./factLedger";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { lockEpisodeRevision, revisionConflict } from "./episodeLock";
export { lockEpisodeRevision, revisionConflict } from "./episodeLock";

type Database = Prisma.TransactionClient;
export type EpisodeEdit = {
  title?: string;
  content?: string;
  hookOpening?: string | null;
  cliffhanger?: string | null;
  durationSec?: number | null;
};

export async function commitEpisodeEdit(input: {
  episodeId: string;
  expectedRevision: number;
  changes: EpisodeEdit;
  source: "manual" | "script" | "repair";
  facts?: Array<{ text: string; category: string }>;
}) {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw revisionConflict();
  return prisma.$transaction(async (tx) => {
    const before = await lockEpisodeRevision(tx, input.episodeId, input.expectedRevision);
    const changes = Object.fromEntries(Object.entries(input.changes).filter(([, value]) => value !== undefined)) as EpisodeEdit;
    const bodyChanged = changes.content !== undefined && changes.content !== before.content;
    const changed = Object.entries(changes).some(([key, value]) => before[key as keyof EpisodeEdit] !== value);
    if (!changed) return before;
    // Archive the legacy/current version before its first overwrite; all subsequent
    // snapshots are inserted with the new revision in this same transaction.
    const snapshot = (episode: typeof before, source: string) => ({
      episodeId: episode.id, revision: episode.revision, title: episode.title,
      content: episode.content, hookOpening: episode.hookOpening,
      cliffhanger: episode.cliffhanger, durationSec: episode.durationSec, source,
    });
    await tx.dramaEpisodeRevision.upsert({
      where: { episodeId_revision: { episodeId: before.id, revision: before.revision } },
      update: {}, create: snapshot(before, "baseline"),
    });
    const episode = await tx.dramaEpisode.update({
      where: { id: before.id },
      data: { ...changes, revision: { increment: 1 }, qualityFlags: null,
        factsStatus: bodyChanged ? (input.facts ? "ready" : "pending") : before.factsStatus,
        status: (changes.content ?? before.content)?.trim() ? "scripted" : "planned" },
    });
    await tx.dramaEpisodeRevision.create({ data: snapshot(episode, input.source) });
    await tx.dramaStoryboard.updateMany({ where: { episodeId: before.id }, data: { status: "stale" } });
    if (bodyChanged) {
      await tx.dramaFact.updateMany({
        where: { projectId: before.projectId, episodeOrder: before.order, source: { in: ["script", "repair", "manual"] } },
        data: { stale: true },
      });
      if (input.facts?.length) {
        await tx.dramaFact.createMany({ data: input.facts.map((fact) => ({
          ...fact, projectId: before.projectId, episodeOrder: before.order,
          source: input.source, sourceRevision: episode.revision,
        })) });
      }
    } else {
      await tx.dramaFact.updateMany({
        where: { projectId: before.projectId, episodeOrder: before.order, stale: false },
        data: { sourceRevision: episode.revision },
      });
    }
    return episode;
  });
}

export async function assertCurrentStoryboard(storyboardId: string, tx?: Database) {
  const db = tx ?? prisma;
  let storyboard = await db.dramaStoryboard.findUnique({ where: { id: storyboardId }, include: { episode: true } });
  if (!storyboard) throw new AppError("未找到分镜，请重新生成分镜。", 404);
  if (tx) {
    await lockEpisodeRevision(tx, storyboard.episodeId, storyboard.sourceRevision);
    storyboard = await tx.dramaStoryboard.findUniqueOrThrow({ where: { id: storyboardId }, include: { episode: true } });
  }
  const latest = await db.dramaStoryboard.findFirst({
    where: { episodeId: storyboard.episodeId }, orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true },
  });
  if (storyboard.sourceRevision !== storyboard.episode.revision
    || ["stale", "superseded"].includes(storyboard.status) || latest?.id !== storyboard.id) {
    throw new AppError("此分镜对应的台本或镜头有新的版本，请重新生成分镜并制作素材。历史素材会保留。", 409);
  }
  return storyboard;
}

type Shot = Prisma.DramaShotGetPayload<{ include: { storyboard: { include: { episode: true } } } }>;
export async function withCurrentShot<T>(shotId: string, action: (tx: Database, shot: Shot) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const shot = await tx.dramaShot.findUnique({ where: { id: shotId }, include: { storyboard: { include: { episode: true } } } });
    if (!shot) throw new AppError("未找到镜头。", 404);
    await assertCurrentStoryboard(shot.storyboardId, tx);
    const current = await tx.dramaShot.findUniqueOrThrow({ where: { id: shotId }, include: { storyboard: { include: { episode: true } } } });
    return action(tx, current);
  });
}

export async function saveEpisodeAssessment(episodeId: string, expectedRevision: number,
  expectedQualityFlags: string | null, data: { status: string; qualityFlags: string }) {
  return prisma.$transaction(async (tx) => {
    await lockEpisodeRevision(tx, episodeId, expectedRevision);
    const saved = await tx.dramaEpisode.updateMany({
      where: { id: episodeId, revision: expectedRevision, qualityFlags: expectedQualityFlags }, data,
    });
    if (!saved.count) throw new AppError("台本审校结果有更新，请查看最新结果后重试。", 409);
  });
}
