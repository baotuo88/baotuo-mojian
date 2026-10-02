import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "../../../db/prisma";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import {
  parsePipelinePayload,
  stringifyPipelinePayload,
} from "../pipelineJobState";
import type {
  ArtifactSyncMode,
  PipelineBackgroundSyncActivity,
  PipelineBackgroundSyncKind,
  PipelinePayload,
} from "../novelCoreShared";
import type { ContentProvenance } from "@ai-novel/shared/types/canonicalState";
import { buildContentHash, ChapterArtifactDeltaService } from "./ChapterArtifactDeltaService";

interface ChapterBackgroundSyncContext {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
}

interface ChapterArtifactBackgroundSyncOptions {
  artifactSyncMode?: ArtifactSyncMode;
  provider?: string;
  model?: string;
  temperature?: number;
  contentProvenance?: ContentProvenance;
}

type ArtifactSyncClaim =
  | { status: "claimed"; leaseMetadataJson: string }
  | { status: "already_done"; metadata: Record<string, unknown> }
  | { status: "running" };

interface ArtifactSyncCheckpointInput {
  novelId: string;
  chapterId: string;
  contentHash: string;
  artifactType: string;
  syncMode: ArtifactSyncMode;
  sourceType?: string | null;
  sourceStage?: string | null;
  metadata?: Record<string, unknown>;
}

interface ArtifactSyncTiming {
  pollIntervalMs: number;
  waitTimeoutMs: number;
  heartbeatIntervalMs: number;
  runningStaleMs: number;
}

export type ChapterArtifactBackgroundSyncResult =
  | { status: "succeeded" }
  | { status: "failed"; error: string };

const DEFAULT_ARTIFACT_SYNC_MODE: ArtifactSyncMode = "adaptive";
const DEFERRED_SYNC_DELAY_MS = 5000;
const DEFAULT_SYNC_TIMING: ArtifactSyncTiming = {
  pollIntervalMs: 500,
  waitTimeoutMs: 60_000,
  heartbeatIntervalMs: 15_000,
  runningStaleMs: 60_000,
};

function readCheckpointMetadata(metadataJson: string | null): Record<string, unknown> {
  if (!metadataJson?.trim()) return {};
  const metadata: unknown = JSON.parse(metadataJson);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("章节资产同步检查点元数据无效，无法确认剩余同步步骤。");
  }
  return metadata as Record<string, unknown>;
}

function requiresFullReconcile(metadata: Record<string, unknown>): boolean {
  const syncPlan = metadata.syncPlan;
  return metadata.requiresFullReconcile === true
    || Boolean(syncPlan && typeof syncPlan === "object"
      && (syncPlan as Record<string, unknown>).payoffLedger === "full_reconcile");
}

export class ChapterArtifactBackgroundSyncService {
  private artifactDeltaService: ChapterArtifactDeltaService | null = null;
  private readonly activeSyncs = new Map<string, Promise<ChapterArtifactBackgroundSyncResult>>();
  private readonly latestSyncedContentHashByChapter = new Map<string, string>();
  private readonly timing: ArtifactSyncTiming;

  constructor(timing: Partial<ArtifactSyncTiming> = {}) {
    this.timing = { ...DEFAULT_SYNC_TIMING, ...timing };
  }

  scheduleChapterSync(
    novelId: string,
    chapterId: string,
    content: string,
    options: ChapterArtifactBackgroundSyncOptions = {},
  ): void {
    const artifactSyncMode = options.artifactSyncMode ?? DEFAULT_ARTIFACT_SYNC_MODE;
    const delayMs = artifactSyncMode === "deferred" ? DEFERRED_SYNC_DELAY_MS : 0;
    const runOptions: ChapterArtifactBackgroundSyncOptions = {
      ...options,
      artifactSyncMode,
    };
    const run = () => {
      void this.runChapterSyncNow(novelId, chapterId, content, runOptions);
    };
    if (delayMs > 0) {
      setTimeout(run, delayMs).unref?.();
      return;
    }
    run();
  }

  async runChapterSyncNow(
    novelId: string,
    chapterId: string,
    content: string,
    options: ChapterArtifactBackgroundSyncOptions = {},
  ): Promise<ChapterArtifactBackgroundSyncResult> {
    const artifactSyncMode = options.artifactSyncMode ?? DEFAULT_ARTIFACT_SYNC_MODE;
    const contentHash = buildContentHash(content);
    const chapterKey = `${novelId}:${chapterId}:${artifactSyncMode}`;
    const syncKey = `${chapterKey}:${contentHash}`;
    const activeSync = this.activeSyncs.get(syncKey);
    if (activeSync) return activeSync;
    if (this.latestSyncedContentHashByChapter.get(chapterKey) === contentHash) {
      return { status: "succeeded" };
    }
    const sync = this.runChapterSync(novelId, chapterId, content, artifactSyncMode, contentHash, options)
      .then((): ChapterArtifactBackgroundSyncResult => {
        this.latestSyncedContentHashByChapter.set(chapterKey, contentHash);
        return { status: "succeeded" };
      })
      .catch((error): ChapterArtifactBackgroundSyncResult => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[chapter-artifact-background-sync] background sync failed", {
          novelId,
          chapterId,
          artifactSyncMode,
          error: message,
        });
        // Asset failures remain chapter diagnostics. They must not turn usable
        // chapter content into a global auto-director failure or a success cache.
        return { status: "failed", error: message };
      });
    this.activeSyncs.set(syncKey, sync);
    try {
      return await sync;
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  private async runChapterSync(
    novelId: string,
    chapterId: string,
    content: string,
    artifactSyncMode: ArtifactSyncMode,
    contentHash: string,
    options: ChapterArtifactBackgroundSyncOptions,
  ): Promise<void> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true, order: true, title: true },
    });
    if (!chapter) {
      throw new Error("章节不存在，无法完成章节资产同步。");
    }
    const checkpointScope = {
      novelId,
      chapterId,
      contentHash,
      syncMode: artifactSyncMode,
      sourceType: "chapter_background_sync",
      sourceStage: "chapter_execution",
    };
    const context: ChapterBackgroundSyncContext = {
      chapterId,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
    };

    const deltaMetadata = await this.runCheckpointedActivity({
      ...checkpointScope,
      artifactType: "artifact_delta",
      metadata: {
        reason: "artifact_delta_started",
        contentProvenance: options.contentProvenance ?? "confirmed",
      },
    }, context, "artifact_delta", async () => {
      const result = await this.getArtifactDeltaService().syncChapterArtifacts({
        novelId,
        chapterId,
        content,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        contentProvenance: options.contentProvenance,
      });
      return {
        stateSnapshotId: result.stateSnapshotId,
        characterResourceProposalCount: result.characterResourceProposalCount,
        characterDynamicsCount: result.characterDynamicsCount,
        characterKnowledgeStateCount: result.characterKnowledgeStateCount,
        payoffDeltaCount: result.payoffDeltaCount,
        canonicalCommittedCount: result.canonicalCommittedCount,
        concreteFactCount: result.concreteFactCount,
        syncPlan: result.output.syncPlan,
        requiresFullReconcile: result.requiresFullReconcile,
        confidence: result.output.confidence,
        contentProvenance: options.contentProvenance ?? "confirmed",
      };
    });

    const requiresFullReconcileFromDelta = requiresFullReconcile(deltaMetadata);
    const shouldReconcile = await this.shouldRunPayoffFullReconcile({
      novelId,
      chapterOrder: chapter.order,
      artifactSyncMode,
      requiresFullReconcileFromDelta,
    });
    if (shouldReconcile) {
      await this.runCheckpointedActivity({
        ...checkpointScope,
        artifactType: "payoff_ledger_full_reconcile",
        metadata: { reason: "payoff_full_reconcile_started" },
      }, context, "payoff_ledger", async () => {
        await payoffLedgerSyncService.syncLedger(novelId, {
          chapterOrder: chapter.order,
          sourceChapterId: chapterId,
        });
        return {
          trigger: this.describePayoffReconcileTrigger({
            chapterOrder: chapter.order,
            artifactSyncMode,
            requiresFullReconcileFromDelta,
            isVolumeTail: await this.isVolumeTail(novelId, chapter.order),
          }),
        };
      });
    }
  }

  private async runCheckpointedActivity(
    input: ArtifactSyncCheckpointInput,
    chapter: ChapterBackgroundSyncContext,
    kind: PipelineBackgroundSyncKind,
    runner: () => Promise<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const claim = await this.waitForCheckpoint(input);
    if (claim.status === "already_done") return claim.metadata;
    const heartbeat = this.startCheckpointHeartbeat(input, claim.leaseMetadataJson);
    let metadata: Record<string, unknown> = {};
    try {
      await this.runTrackedActivity(input.novelId, chapter, kind, async () => {
        metadata = await runner();
      });
      await heartbeat.stop();
      await this.markCheckpoint({ ...input, metadata }, claim.leaseMetadataJson);
      return metadata;
    } catch (error) {
      await heartbeat.stop().catch(() => {});
      await this.markCheckpointFailed({
        ...input,
        metadata: { ...input.metadata, reason: error instanceof Error ? error.message : String(error) },
      }, claim.leaseMetadataJson);
      throw error;
    }
  }

  private getArtifactDeltaService(): ChapterArtifactDeltaService {
    this.artifactDeltaService ??= new ChapterArtifactDeltaService();
    return this.artifactDeltaService;
  }

  private async shouldRunPayoffFullReconcile(input: {
    novelId: string;
    chapterOrder: number;
    artifactSyncMode: ArtifactSyncMode;
    requiresFullReconcileFromDelta: boolean;
  }): Promise<boolean> {
    if (input.artifactSyncMode === "strict") {
      return true;
    }
    if (input.requiresFullReconcileFromDelta) {
      return true;
    }
    if (input.artifactSyncMode === "deferred") {
      return false;
    }
    if (input.chapterOrder > 0 && input.chapterOrder % 3 === 0) {
      return true;
    }
    return this.isVolumeTail(input.novelId, input.chapterOrder);
  }

  private describePayoffReconcileTrigger(input: {
    chapterOrder: number;
    artifactSyncMode: ArtifactSyncMode;
    requiresFullReconcileFromDelta: boolean;
    isVolumeTail: boolean;
  }): string {
    if (input.artifactSyncMode === "strict") {
      return "strict_mode";
    }
    if (input.requiresFullReconcileFromDelta) {
      return "artifact_delta_risk";
    }
    if (input.chapterOrder > 0 && input.chapterOrder % 3 === 0) {
      return "adaptive_three_chapter_checkpoint";
    }
    if (input.isVolumeTail) {
      return "adaptive_volume_tail";
    }
    return "manual";
  }

  private async isVolumeTail(novelId: string, chapterOrder: number): Promise<boolean> {
    const volume = await prisma.volumePlan.findFirst({
      where: {
        novelId,
        chapters: {
          some: { chapterOrder },
        },
      },
      include: {
        chapters: {
          select: { chapterOrder: true },
        },
      },
    });
    if (!volume || volume.chapters.length === 0) {
      return false;
    }
    const maxChapterOrder = Math.max(...volume.chapters.map((item) => item.chapterOrder));
    return chapterOrder === maxChapterOrder;
  }

  private async waitForCheckpoint(
    input: ArtifactSyncCheckpointInput,
  ): Promise<Exclude<ArtifactSyncClaim, { status: "running" }>> {
    const deadline = Date.now() + this.timing.waitTimeoutMs;
    while (true) {
      const claim = await this.claimCheckpoint(input);
      if (claim.status !== "running") return claim;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error("等待章节资产同步超时，正文已保留，资产同步可重试。");
      }
      await delay(Math.min(this.timing.pollIntervalMs, remaining));
    }
  }

  private startCheckpointHeartbeat(input: ArtifactSyncCheckpointInput, leaseMetadataJson: string) {
    let heartbeat: Promise<void> | null = null;
    let failure: unknown = null;
    const timer = setInterval(() => {
      if (heartbeat || failure) return;
      heartbeat = prisma.chapterArtifactSyncCheckpoint.updateMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: input.artifactType,
          syncMode: input.syncMode,
          status: "running",
          metadataJson: leaseMetadataJson,
        },
        data: { updatedAt: new Date() },
      }).then((updated) => {
        if (updated.count !== 1) throw new Error("章节资产同步租约已失效，需要重新确认同步结果。");
      }).catch((error) => {
        failure = error;
      }).finally(() => { heartbeat = null; });
    }, this.timing.heartbeatIntervalMs);
    timer.unref?.();
    return {
      stop: async () => {
        clearInterval(timer);
        await heartbeat;
        if (failure) throw failure;
      },
    };
  }

  private async claimCheckpoint(input: ArtifactSyncCheckpointInput): Promise<ArtifactSyncClaim> {
    const where = {
      novelId_chapterId_contentHash_artifactType_syncMode: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: input.artifactType,
        syncMode: input.syncMode,
      },
    };
    const metadataJson = JSON.stringify({ ...input.metadata, leaseToken: randomUUID() });
    try {
      await prisma.chapterArtifactSyncCheckpoint.create({
        data: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: input.artifactType,
          syncMode: input.syncMode,
          status: "running",
          sourceType: input.sourceType ?? null,
          sourceStage: input.sourceStage ?? null,
          metadataJson,
        },
      });
      return { status: "claimed", leaseMetadataJson: metadataJson };
    } catch (error) {
      const existing = await prisma.chapterArtifactSyncCheckpoint.findUnique({
        where,
        select: { status: true, updatedAt: true, metadataJson: true },
      });
      if (!existing) throw error;
      if (existing.status === "succeeded") {
        return { status: "already_done", metadata: readCheckpointMetadata(existing.metadataJson) };
      }
      const staleBefore = new Date(Date.now() - this.timing.runningStaleMs);
      if (existing.status === "running" && existing.updatedAt > staleBefore) {
        return { status: "running" };
      }
      const claimed = await prisma.chapterArtifactSyncCheckpoint.updateMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: input.artifactType,
          syncMode: input.syncMode,
          status: existing.status,
          updatedAt: existing.updatedAt,
          metadataJson: existing.metadataJson,
        },
        data: {
          status: "running",
          sourceType: input.sourceType ?? null,
          sourceStage: input.sourceStage ?? null,
          metadataJson,
          updatedAt: new Date(),
        },
      });
      return claimed.count === 1
        ? { status: "claimed", leaseMetadataJson: metadataJson }
        : { status: "running" };
    }
  }

  private async markCheckpoint(input: ArtifactSyncCheckpointInput, leaseMetadataJson: string): Promise<void> {
    const updated = await prisma.chapterArtifactSyncCheckpoint.updateMany({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: input.artifactType,
        syncMode: input.syncMode,
        status: "running",
        metadataJson: leaseMetadataJson,
      },
      data: {
        status: "succeeded",
        metadataJson: JSON.stringify(input.metadata ?? {}),
        updatedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("章节资产同步租约已失效，不能确认本次同步完成。");
  }

  private async runTrackedActivity(
    novelId: string,
    chapter: ChapterBackgroundSyncContext,
    kind: PipelineBackgroundSyncKind,
    runner: () => Promise<void>,
  ): Promise<void> {
    await this.updateBackgroundActivity(novelId, chapter, kind, "running");
    try {
      await runner();
      await this.clearBackgroundActivity(novelId, chapter.chapterId, kind);
    } catch (error) {
      await this.clearBackgroundActivity(novelId, chapter.chapterId, kind);
      throw error;
    }
  }

  private async markCheckpointFailed(input: ArtifactSyncCheckpointInput, leaseMetadataJson: string): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.updateMany({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: input.artifactType,
        syncMode: input.syncMode,
        status: "running",
        metadataJson: leaseMetadataJson,
      },
      data: {
        status: "failed",
        sourceType: input.sourceType ?? null,
        sourceStage: input.sourceStage ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
        updatedAt: new Date(),
      },
    }).catch(() => null);
  }

  private async updateBackgroundActivity(
    novelId: string,
    chapter: ChapterBackgroundSyncContext,
    kind: PipelineBackgroundSyncKind,
    status: PipelineBackgroundSyncActivity["status"],
  ): Promise<void> {
    const jobRows = await this.findActiveJobsForChapter(novelId, chapter.chapterOrder);
    if (jobRows.length === 0) {
      return;
    }

    await Promise.all(jobRows.map((job) => this.mutateJobActivities(job.id, (payload) =>
      (payload.backgroundSync?.activities ?? [])
        .filter((item) => item.kind !== kind)
        .concat({
          kind,
          status,
          chapterId: chapter.chapterId,
          chapterOrder: chapter.chapterOrder,
          chapterTitle: chapter.chapterTitle,
          updatedAt: new Date().toISOString(),
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    )));
  }

  private async clearBackgroundActivity(
    novelId: string,
    chapterId: string,
    kind: PipelineBackgroundSyncKind,
  ): Promise<void> {
    const jobRows = await prisma.generationJob.findMany({
      where: {
        novelId,
        status: { in: ["queued", "running"] },
      },
      select: {
        id: true,
      },
    });
    if (jobRows.length === 0) {
      return;
    }

    await Promise.all(jobRows.map((job) => this.mutateJobActivities(job.id, (payload) => {
      const current = payload.backgroundSync?.activities ?? [];
      const next = current.filter((item) => !(item.kind === kind && item.chapterId === chapterId));
      // filter only removes; equal length ⇒ nothing matched ⇒ no-op (skip the write).
      return next.length === current.length ? null : next;
    })));
  }

  // Read-modify-write of generationJob.payload: two concurrent activity updates for the
  // same job (different kinds, or an update racing a clear) each read the same base
  // payload and write back, so the later writer drops the other's entry. Re-read the
  // payload and CAS on its exact prior value (updateMany where payload=<read value>);
  // on a miss a concurrent writer won, so re-read and retry. Best-effort throughout —
  // this only drives the background-sync progress indicator, so it must never throw.
  private async mutateJobActivities(
    jobId: string,
    deriveActivities: (payload: PipelinePayload) => PipelineBackgroundSyncActivity[] | null,
    attempts = 4,
  ): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const job = await prisma.generationJob.findUnique({
        where: { id: jobId },
        select: { payload: true, status: true },
      }).catch(() => null);
      if (!job || (job.status !== "queued" && job.status !== "running")) {
        return;
      }
      const payload = parsePipelinePayload(job.payload);
      const activities = deriveActivities(payload);
      if (activities === null) {
        return;
      }
      const nextPayload: PipelinePayload = {
        ...payload,
        backgroundSync: activities.length > 0 ? { activities } : undefined,
      };
      const nextPayloadString = stringifyPipelinePayload(nextPayload);
      if ((job.payload ?? "") === nextPayloadString) {
        return;
      }
      const updated = await prisma.generationJob.updateMany({
        where: { id: jobId, payload: job.payload },
        data: {
          payload: nextPayloadString,
          heartbeatAt: new Date(),
        },
      }).catch(() => null);
      if (updated && updated.count === 1) {
        return;
      }
      // CAS miss: a concurrent writer changed the payload — re-read and retry.
    }
  }

  private async findActiveJobsForChapter(novelId: string, chapterOrder: number) {
    return prisma.generationJob.findMany({
      where: {
        novelId,
        status: { in: ["queued", "running"] },
        startOrder: { lte: chapterOrder },
        endOrder: { gte: chapterOrder },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
      },
    });
  }
}

export const chapterArtifactBackgroundSyncService = new ChapterArtifactBackgroundSyncService();
