import { randomUUID } from "node:crypto";
import {
  runWithExecutionScope,
  withoutExecutionScope,
  ExecutionStoppedError,
} from "../../../../platform/execution";
import { assertChapterArtifactSource } from "../../runtime/persistence";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { enqueueRagOwnerJob } from "../../../rag";
import { batchContextCache } from "../../runtime/BatchContextCache";
import { chapterArtifactDeltaService } from "../../runtime/ChapterArtifactDeltaService";
import { ChapterArtifactSyncService } from "../../runtime/ChapterArtifactSyncService";
import { NovelVolumeService } from "../../volume/NovelVolumeService";
import { payoffLedgerSyncService } from "../../../payoff/PayoffLedgerSyncService";
import {
  applyNovelRuntimeArchive,
  clearNovelRuntime,
  parseRuntimeArchive,
} from "../infrastructure/NovelRuntimeArchive";

interface SnapshotChapter {
  id: string;
  title?: string;
  order?: number;
  content?: string | null;
}
interface SnapshotPayload {
  outline?: string | null;
  structuredOutline?: string | null;
  chapters?: SnapshotChapter[];
  volumes?: unknown;
  runtimeArchive?: unknown;
}
interface RestoreMetadata {
  snapshotId: string;
  backupId: string;
  mode: "archive" | "rebuild";
  expectedChapters: Array<{ id: string; content: string | null }>;
  lease?: string;
  error?: string;
  ragBarrierJobIds?: string[];
}
const RESTORE_TYPE = "snapshot_restore";
const STALE_MS = 90_000;
const active = new Map<string, Promise<void>>();

function readPayload(raw: string): SnapshotPayload {
  const data = JSON.parse(raw) as SnapshotPayload;
  if (!data || typeof data !== "object" || !Array.isArray(data.chapters))
    throw new Error("版本快照缺少有效章节数据。");
  for (const chapter of data.chapters) {
    if (
      !chapter ||
      typeof chapter.id !== "string" ||
      (chapter.content != null && typeof chapter.content !== "string")
    ) {
      throw new Error("版本快照中的章节格式无效。");
    }
  }
  return data;
}

export class NovelSnapshotRestoreService {
  async restore(
    novelId: string,
    snapshotId: string,
    createBackup: () => Promise<{ id: string }>,
  ): Promise<void> {
    if (active.has(novelId)) throw new Error("小说资料正在恢复，请等待恢复完成。");
    const snapshot = await prisma.novelSnapshot.findFirst({ where: { id: snapshotId, novelId } });
    if (!snapshot) throw new Error("Snapshot not found.");
    const payload = readPayload(snapshot.snapshotData);
    const chapters = await prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
    });
    const running = await prisma.chapterArtifactSyncCheckpoint.count({
      where: { novelId, status: "running", updatedAt: { gte: new Date(Date.now() - STALE_MS) } },
    });
    const runningPipeline = await prisma.generationJob.count({
      where: { novelId, status: { in: ["running", "queued"] } },
    });
    if (running || runningPipeline) throw new Error("请等待章节生成和资料同步结束后再恢复版本。");
    const backup = await createBackup();
    const verified = await prisma.novelSnapshot.findFirst({ where: { id: backup.id, novelId } });
    if (!verified || !parseRuntimeArchive(readPayload(verified.snapshotData).runtimeArchive)) {
      throw new Error("恢复前的资料备份未通过校验，正文未修改。");
    }
    const target = new Map((payload.chapters ?? []).map((chapter) => [chapter.id, chapter]));
    const expectedChapters = chapters.map((chapter) => ({
      id: chapter.id,
      content:
        target.has(chapter.id) && Object.hasOwn(target.get(chapter.id)!, "content")
          ? (target.get(chapter.id)!.content ?? null)
          : chapter.content,
    }));
    const archive = parseRuntimeArchive(payload.runtimeArchive);
    const hasSameChapterSet =
      target.size === chapters.length && chapters.every((chapter) => target.has(chapter.id));
    const currentCharacters = await prisma.character.findMany({
      where: { novelId },
      select: { id: true },
    });
    const currentVolumes = await prisma.volumePlan.findMany({
      where: { novelId },
      select: { id: true },
    });
    const hasCompatibleDefinitions =
      archive &&
      archive.characters.every((row) =>
        currentCharacters.some((current) => current.id === row.id),
      ) &&
      currentCharacters.length === archive.characters.length &&
      (archive.volumeOutcomes ?? []).every((row) =>
        currentVolumes.some((current) => current.id === row.id),
      );
    const metadata: RestoreMetadata = {
      snapshotId,
      backupId: backup.id,
      mode: archive && hasSameChapterSet && hasCompatibleDefinitions ? "archive" : "rebuild",
      expectedChapters,
    };
    await withSqliteRetry(
      () =>
        prisma.$transaction(
          async (tx) => {
            // Compare every source row, not just the ones present in an older snapshot.
            // A concurrent save must abort the entire restore instead of losing text.
            for (const chapter of chapters) {
              const restored = target.get(chapter.id);
              const content = expectedChapters.find((row) => row.id === chapter.id)!.content;
              const changed = await tx.chapter.updateMany({
                where: {
                  id: chapter.id,
                  novelId,
                  content: chapter.content,
                  updatedAt: chapter.updatedAt,
                },
                data: {
                  ...(restored?.title != null ? { title: restored.title } : {}),
                  ...(restored?.order != null ? { order: restored.order } : {}),
                  content,
                  generationState: content?.trim() ? "drafted" : "planned",
                  chapterStatus: content?.trim() ? "pending_review" : "unplanned",
                  repairHistory: null,
                  qualityScore: null,
                  continuityScore: null,
                  characterScore: null,
                  pacingScore: null,
                  riskFlags: null,
                  hook: null,
                },
              });
              if (changed.count !== 1)
                throw new Error("章节在恢复期间被修改，恢复已取消，请重新选择版本。");
            }
            await tx.novel.update({
              where: { id: novelId },
              data: {
                ...(Object.hasOwn(payload, "outline") ? { outline: payload.outline ?? null } : {}),
                ...(Object.hasOwn(payload, "structuredOutline")
                  ? { structuredOutline: payload.structuredOutline ?? null }
                  : {}),
              },
            });
            await clearNovelRuntime(novelId, tx);
            // These are runtime projections, not character identity/personality/background.
            // Their pre-restore values are preserved in the verified runtime archive.
            await tx.character.updateMany({
              where: { novelId },
              data: { currentState: null, currentGoal: null, lastEvolvedAt: null },
            });
            if (metadata.mode === "archive" && archive)
              await applyNovelRuntimeArchive(novelId, archive, tx);
            if (chapters[0]) {
              await tx.chapterArtifactSyncCheckpoint.create({
                data: {
                  novelId,
                  chapterId: chapters[0].id,
                  contentHash: randomUUID(),
                  artifactType: RESTORE_TYPE,
                  syncMode: "strict",
                  status: "pending",
                  sourceType: "snapshot_restore",
                  metadataJson: JSON.stringify(metadata),
                },
              });
            }
            for (const chapter of chapters) {
              await enqueueRagOwnerJob(
                { jobType: "upsert", ownerType: "chapter", ownerId: chapter.id },
                tx,
              );
              await enqueueRagOwnerJob(
                { jobType: "upsert", ownerType: "chapter_summary", ownerId: chapter.id },
                tx,
              );
            }
            await enqueueRagOwnerJob(
              { jobType: "upsert", ownerType: "novel", ownerId: novelId },
              tx,
            );
          },
          { isolationLevel: "Serializable", timeout: 30_000 },
        ),
      { label: "novel.snapshot.restore" },
    );
    batchContextCache.invalidate(novelId);
    if (chapters.length === 0) {
      const volumes = new NovelVolumeService();
      if (Array.isArray(payload.volumes) && payload.volumes.length > 0)
        await volumes.updateVolumesWithOptions(
          novelId,
          { volumes: payload.volumes },
          { emitEvent: false, syncPayoffLedger: false },
        );
      else await volumes.migrateLegacyVolumes(novelId);
      return;
    }
    await this.ensureReady(novelId);
  }

  async ensureReady(novelId: string): Promise<void> {
    const existing = active.get(novelId);
    if (existing) return existing;
    const run = this.finishPendingRestore(novelId).finally(() => {
      active.delete(novelId);
    });
    active.set(novelId, run);
    return run;
  }

  private async finishPendingRestore(novelId: string): Promise<void> {
    const checkpoint = await prisma.chapterArtifactSyncCheckpoint.findFirst({
      where: { novelId, artifactType: RESTORE_TYPE },
      orderBy: { createdAt: "desc" },
    });
    if (!checkpoint || checkpoint.status === "succeeded") return;
    const metadata = JSON.parse(checkpoint.metadataJson ?? "{}") as RestoreMetadata;
    if (!metadata.snapshotId || !metadata.backupId || !Array.isArray(metadata.expectedChapters)) {
      throw new Error("版本恢复记录不完整，无法继续生成章节。");
    }
    const lease = randomUUID();
    const claimedMetadata = JSON.stringify({ ...metadata, lease, error: undefined });
    const claim = await prisma.chapterArtifactSyncCheckpoint.updateMany({
      where: {
        id: checkpoint.id,
        metadataJson: checkpoint.metadataJson,
        OR: [
          { status: { in: ["pending", "failed"] } },
          { status: "running", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
        ],
      },
      data: { status: "running", metadataJson: claimedMetadata },
    });
    if (claim.count !== 1) throw new Error("小说资料正在另一任务中恢复，请稍后继续。");
    const controller = new AbortController();
    const heartbeat = setInterval(() => {
      void prisma.chapterArtifactSyncCheckpoint
        .updateMany({
          where: { id: checkpoint.id, status: "running", metadataJson: claimedMetadata },
          data: { updatedAt: new Date() },
        })
        .then((result) => {
          if (result.count !== 1)
            controller.abort(new ExecutionStoppedError("恢复任务已失去执行权，停止旧资料写入。"));
        })
        .catch((error) => controller.abort(error));
    }, 15_000);
    heartbeat.unref?.();
    try {
      const indexJobs = await runWithExecutionScope(
        {
          signal: controller.signal,
          fence: {
            kind: "snapshot_restore",
            checkpointId: checkpoint.id,
            metadataJson: claimedMetadata,
          },
        },
        async () => {
          const snapshot = await prisma.novelSnapshot.findFirst({
            where: { id: metadata.snapshotId, novelId },
          });
          const backup = await prisma.novelSnapshot.findFirst({
            where: { id: metadata.backupId, novelId },
          });
          if (
            !snapshot ||
            !backup ||
            !parseRuntimeArchive(readPayload(backup.snapshotData).runtimeArchive)
          ) {
            throw new Error("恢复所需的快照或备份缺失，请先找回备份。");
          }
          const payload = readPayload(snapshot.snapshotData);
          const volumeService = new NovelVolumeService();
          if (Array.isArray(payload.volumes) && payload.volumes.length > 0)
            await volumeService.updateVolumesWithOptions(
              novelId,
              { volumes: payload.volumes },
              { emitEvent: false, syncPayoffLedger: false },
            );
          else await volumeService.migrateLegacyVolumes(novelId);
          if (metadata.mode === "rebuild") {
            // A failed replay is restarted from a clean derived layer; never append
            // a second set of facts/proposals on top of a half-completed attempt.
            await withSqliteRetry(
              () =>
                prisma.$transaction(
                  async (tx) => {
                    for (const expected of metadata.expectedChapters) {
                      await assertChapterArtifactSource(
                        tx,
                        novelId,
                        expected.id,
                        expected.content ?? "",
                      );
                    }
                    await clearNovelRuntime(novelId, tx);
                    await tx.character.updateMany({
                      where: { novelId },
                      data: { currentState: null, currentGoal: null, lastEvolvedAt: null },
                    });
                  },
                  { isolationLevel: "Serializable", timeout: 30_000 },
                ),
              { label: "novel.snapshot.rebuild" },
            );
            const chapters = await prisma.chapter.findMany({
              where: { novelId },
              orderBy: { order: "asc" },
            });
            const artifacts = new ChapterArtifactSyncService();
            for (const chapter of chapters) {
              const expected = metadata.expectedChapters.find((row) => row.id === chapter.id);
              if (!expected || expected.content !== chapter.content)
                throw new Error("恢复期间正文被修改，请重新恢复版本后继续。");
              if (!chapter.content?.trim()) continue;
              const result = await chapterArtifactDeltaService.syncChapterArtifacts({
                novelId,
                chapterId: chapter.id,
                content: chapter.content,
                sourceType: "snapshot_restore",
                sourceStage: "snapshot_rebuild",
                contentProvenance: "confirmed",
              });
              await artifacts.syncChapterArtifacts(novelId, chapter.id, chapter.content, {
                skipLegacySummaryAndFacts: true,
                scheduleBackgroundSync: false,
              });
              if (result.requiresFullReconcile) await payoffLedgerSyncService.syncLedger(novelId);
            }
          }
          const current = await prisma.chapter.findMany({
            where: { novelId },
            select: { id: true, content: true },
          });
          if (
            current.length !== metadata.expectedChapters.length ||
            current.some(
              (chapter) =>
                metadata.expectedChapters.find((expected) => expected.id === chapter.id)
                  ?.content !== chapter.content,
            )
          ) {
            throw new Error("恢复期间正文被修改，请重新恢复版本后继续。");
          }
          const characters = await prisma.character.findMany({
            where: { novelId },
            select: { id: true },
          });
          for (const character of characters)
            await enqueueRagOwnerJob({
              jobType: "upsert",
              ownerType: "character",
              ownerId: character.id,
            });
          const backupArchive = parseRuntimeArchive(
            readPayload(backup.snapshotData).runtimeArchive,
          )!;
          const [facts, timelines] = await Promise.all([
            prisma.consistencyFact.findMany({ where: { novelId }, select: { id: true } }),
            prisma.characterTimeline.findMany({ where: { novelId }, select: { id: true } }),
          ]);
          const ownerIds = [
            ...new Set([
              novelId,
              ...current.map((row) => row.id),
              ...characters.map((row) => row.id),
              ...facts.map((row) => row.id),
              ...timelines.map((row) => row.id),
              ...backupArchive.tables.consistencyFact.map((row) => String(row.id)),
              ...backupArchive.tables.characterTimeline.map((row) => String(row.id)),
            ]),
          ];
          const indexJobs = await prisma.ragIndexJob.findMany({
            where: {
              ownerId: { in: ownerIds },
              status: { in: ["queued", "running", "failed"] },
            },
            select: { id: true },
          });
          return indexJobs;
        },
      );
      controller.signal.throwIfAborted();
      const completed = await prisma.chapterArtifactSyncCheckpoint.updateMany({
        where: { id: checkpoint.id, status: "running", metadataJson: claimedMetadata },
        data: {
          status: "succeeded",
          metadataJson: JSON.stringify({
            ...metadata,
            ragBarrierJobIds: indexJobs.map((job) => job.id),
          }),
        },
      });
      if (completed.count !== 1) throw new Error("恢复任务的执行权已变化，请重新检查恢复状态。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withoutExecutionScope(() =>
        prisma.chapterArtifactSyncCheckpoint.updateMany({
          where: { id: checkpoint.id, status: "running", metadataJson: claimedMetadata },
          data: { status: "failed", metadataJson: JSON.stringify({ ...metadata, error: message }) },
        }),
      );
      throw new Error(`正文版本已恢复，写作资料尚未恢复完成；继续生成时会重试资料重建。${message}`);
    } finally {
      clearInterval(heartbeat);
      batchContextCache.invalidate(novelId);
    }
  }
}
export const novelSnapshotRestoreService = new NovelSnapshotRestoreService();
export const ensureSnapshotRestoreReady = (novelId: string) =>
  novelSnapshotRestoreService.ensureReady(novelId);
