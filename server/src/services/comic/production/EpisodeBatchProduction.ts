import { createHash, randomUUID } from "node:crypto";
import { setImmediate, setInterval, clearInterval } from "node:timers";
import { Prisma, type PrismaClient, type ComicPanel } from "@prisma/client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { ExecutionStoppedError, runWithExecutionScope, withoutExecutionScope } from "../../../platform/execution";
import { comicPanelImageService } from "../ComicPanelImageService";
import { resolveImageModel } from "../../image/provider";
import { confirmedPanelImage, panelSourceFingerprint, resolvePanelImageFile } from "../assets";
import { BATCH_TYPE, LEASE_MS, isLiveBatch, projectBatchJob, readBatchProgress,
  type BatchProgress, type StartBatchOptions } from "./BatchContract";

interface BatchDependencies {
  db: PrismaClient;
  generate: (panelId: string, provider: LLMProvider, imageModel: string) => Promise<unknown>;
  resolveModel: (provider: LLMProvider) => Promise<string>;
  hasImage: (panel: ComicPanel) => Promise<boolean>;
  launch: (work: () => Promise<void>) => void;
  now: () => number;
}

const defaults: BatchDependencies = {
  db: prisma,
  generate: (id, provider, imageModel) => comicPanelImageService.generatePanelImage(id, provider, undefined, { expectedModel: imageModel }),
  resolveModel: resolveImageModel,
  hasImage: async (panel) => Boolean(await resolvePanelImageFile(panel)),
  launch: (work) => { setImmediate(() => { void work(); }); },
  now: () => Date.now(),
};

function imageRevision(panel: ComicPanel): string | null {
  const image = confirmedPanelImage(panel);
  return image ? image.revision ?? JSON.stringify(image) : null;
}

function scopeFingerprint(panels: ComicPanel[], provider: string, imageModel: string): string {
  return createHash("sha256").update(JSON.stringify({ provider, imageModel, panels: panels.map((panel) => ({
    id: panel.id, source: panelSourceFingerprint(panel), image: imageRevision(panel),
  })) })).digest("hex");
}

/** Persistence owns scope, progress and leases; workers only spend against that saved scope. */
export class ComicBatchOrchestrator {
  private readonly deps: BatchDependencies;
  private readonly controllers = new Map<string, AbortController>();
  constructor(deps: Partial<BatchDependencies> = {}) { this.deps = { ...defaults, ...deps }; }

  private async lockEpisode(tx: Prisma.TransactionClient, episodeId: string): Promise<void> {
    const count = await tx.$executeRaw(Prisma.sql`
      UPDATE "ComicEpisode" SET "id" = "id" WHERE "id" = ${episodeId}
    `);
    if (count !== 1) throw new AppError("漫画话数不存在。", 404);
  }

  private async ensureNoLiveBatch(tx: Prisma.TransactionClient, episodeId: string): Promise<void> {
    const jobs = await tx.comicBatchJob.findMany({ where: { episodeId, type: BATCH_TYPE, status: "running" } });
    if (jobs.some((job) => isLiveBatch(job, this.deps.now()))) {
      throw new AppError("这一话正在生成图片，请查看当前任务进度。", 409);
    }
  }

  private launch(jobId: string, progress: BatchProgress): void {
    // A batch outlives its HTTP response; do not inherit request cancellation or another run's identity.
    withoutExecutionScope(() => this.deps.launch(async () => {
      try { await this.runBatch(jobId, progress); }
      catch (error) { console.error(`[comic.batch] ${jobId} stopped`, error); }
    }));
  }

  async startEpisodeBatch(episodeId: string, opts: StartBatchOptions = {}): Promise<{ jobId: string }> {
    const provider = opts.provider ?? "openai";
    const imageModel = await this.deps.resolveModel(provider);
    const concurrency = opts.concurrency ?? 3;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
      throw new AppError("同时生成的格数需要在 1 到 10 之间。", 400);
    }
    const job = await this.deps.db.$transaction(async (tx) => {
      await this.lockEpisode(tx, episodeId);
      await this.ensureNoLiveBatch(tx, episodeId);
      const episode = await tx.comicEpisode.findUnique({ where: { id: episodeId }, include: { panels: { orderBy: { order: "asc" } } } });
      if (!episode) throw new AppError("漫画话数不存在。", 404);
      if (!episode.panels.length) throw new AppError("请先生成这一话的分镜。", 400);
      if (opts.expectedScopeFingerprint && opts.expectedScopeFingerprint !== scopeFingerprint(episode.panels, provider, imageModel)) {
        throw new AppError("这一话的分镜或图片有变化，请刷新并重新确认生成范围。", 409);
      }
      const targets: ComicPanel[] = [];
      for (const panel of episode.panels) {
        if (opts.skipDone === false || !await this.deps.hasImage(panel)) targets.push(panel);
      }
      if (!targets.length) throw new AppError("这一话的图片已齐全，可以导出漫画。", 400);
      const progress: BatchProgress = {
        version: 1, episodeId, provider, imageModel, concurrency,
        targetPanelIds: targets.map((panel) => panel.id), completedPanelIds: [], failedPanelIds: [], errors: {},
        sourceFingerprints: Object.fromEntries(targets.map((p) => [p.id, panelSourceFingerprint(p)])),
        initialImageRevisions: Object.fromEntries(targets.map((p) => [p.id, imageRevision(p)])),
        total: targets.length, done: 0, failed: 0, status: "running",
        leaseOwner: randomUUID(), leaseExpiresAt: this.deps.now() + LEASE_MS,
      };
      return tx.comicBatchJob.create({ data: { projectId: episode.projectId, episodeId,
        type: BATCH_TYPE, status: "running", progress: JSON.stringify(progress) } });
    });
    this.launch(job.id, readBatchProgress(job.progress)!);
    return { jobId: job.id };
  }

  async retryFailed(jobId: string, opts: { provider?: LLMProvider } = {}): Promise<{ jobId: string }> {
    const initial = await this.deps.db.comicBatchJob.findUnique({ where: { id: jobId } });
    if (!initial || initial.type !== BATCH_TYPE) throw new AppError("批量任务不存在。", 404);
    if (!initial.episodeId) throw new AppError("这个任务缺少话数记录，请进入对应话数重新确认生成范围。", 409);
    const confirmed = readBatchProgress(initial.progress);
    if (confirmed && await this.deps.resolveModel(confirmed.provider) !== confirmed.imageModel) {
      throw new AppError("图片模型配置有变化，请重新确认模型和生成范围后开始。", 409);
    }
    const progress = await this.deps.db.$transaction(async (tx) => {
      await this.lockEpisode(tx, initial.episodeId!);
      await this.ensureNoLiveBatch(tx, initial.episodeId!);
      const job = await tx.comicBatchJob.findUnique({ where: { id: jobId } });
      const prev = job && readBatchProgress(job.progress);
      if (!job || !prev || prev.episodeId !== job.episodeId) {
        throw new AppError("这个任务缺少可恢复的生成范围，请重新确认并开始生成。", 409);
      }
      if (opts.provider && opts.provider !== prev.provider) {
        throw new AppError("继续任务会使用原先确认的模型平台；更换平台请重新开始生成。", 409);
      }
      const panels = await tx.comicPanel.findMany({ where: { episodeId: prev.episodeId, id: { in: prev.targetPanelIds } } });
      if (panels.length !== prev.targetPanelIds.length
        || panels.some((p) => panelSourceFingerprint(p) !== prev.sourceFingerprints[p.id])) {
        throw new AppError("这一话的分镜有修改，请重新确认生成范围后开始。", 409);
      }
      const completed: string[] = [];
      for (const panel of panels) {
        // A crash after image publication but before progress persistence must not charge twice.
        if (await this.deps.hasImage(panel) && (prev.completedPanelIds.includes(panel.id)
          || imageRevision(panel) !== prev.initialImageRevisions[panel.id])) completed.push(panel.id);
      }
      const next: BatchProgress = { ...prev, completedPanelIds: completed, failedPanelIds: [], errors: {},
        done: completed.length, failed: 0, status: completed.length === prev.total ? "completed" : "running",
        leaseOwner: randomUUID(), leaseExpiresAt: this.deps.now() + LEASE_MS };
      const saved = await tx.comicBatchJob.updateMany({ where: { id: jobId, progress: job.progress, status: job.status },
        data: { status: next.status, progress: JSON.stringify(next) } });
      if (saved.count !== 1) throw new AppError("任务状态有变化，请刷新后继续。", 409);
      return next;
    });
    if (progress.status === "running") this.launch(jobId, progress);
    return { jobId };
  }

  private async runBatch(jobId: string, initial: BatchProgress): Promise<void> {
    let current = initial;
    let serialized = JSON.stringify(initial);
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    let writes: Promise<unknown> = Promise.resolve();
    // Serialize heartbeats and completions: no stale JSON snapshot may erase another worker's count.
    const persist = (change: (p: BatchProgress) => BatchProgress) => {
      const operation = writes.then(async () => {
        if (controller.signal.aborted || current.leaseExpiresAt <= this.deps.now()) throw new ExecutionStoppedError();
        const next = change(structuredClone(current));
        next.done = next.completedPanelIds.length;
        next.failed = next.failedPanelIds.length;
        next.leaseExpiresAt = this.deps.now() + LEASE_MS;
        const raw = JSON.stringify(next);
        const result = await this.deps.db.comicBatchJob.updateMany({
          where: { id: jobId, status: "running", progress: serialized }, data: { status: next.status, progress: raw },
        });
        if (result.count !== 1) throw new ExecutionStoppedError();
        current = next;
        serialized = raw;
      });
      writes = operation.catch((error) => { controller.abort(error); });
      return operation;
    };
    const heartbeat = setInterval(() => { void persist((p) => p).catch(() => {}); }, 20_000);
    heartbeat.unref();
    try {
      const queue = initial.targetPanelIds.filter((id) => !initial.completedPanelIds.includes(id));
      await Promise.all(Array.from({ length: Math.min(initial.concurrency, queue.length) }, async () => {
        while (queue.length && !controller.signal.aborted) {
          const panelId = queue.shift()!;
          let failure: string | undefined;
          try {
            await runWithExecutionScope({ signal: controller.signal,
              fence: { kind: "comic_batch", jobId, leaseOwner: initial.leaseOwner } }, async () => {
              const panel = await this.deps.db.comicPanel.findUnique({ where: { id: panelId } });
              if (!panel || panel.episodeId !== initial.episodeId
                || panelSourceFingerprint(panel) !== initial.sourceFingerprints[panelId]) {
                throw new AppError("这一格的分镜有修改，请重新确认后生成。", 409);
              }
              await this.deps.generate(panelId, initial.provider, initial.imageModel);
            });
          } catch (error) { failure = error instanceof Error ? error.message : "图片生成失败，请重试。"; }
          await persist((p) => {
            if (failure) { p.failedPanelIds.push(panelId); p.errors[panelId] = failure; }
            else p.completedPanelIds.push(panelId);
            return p;
          });
        }
      }));
      await persist((p) => ({ ...p, status: p.failedPanelIds.length ? "partial" : "completed" }));
    } catch (error) {
      controller.abort(error);
      await writes;
      // Only our exact progress snapshot can be marked interrupted; a successor/cancel always wins.
      const interrupted = { ...current, status: "interrupted", leaseExpiresAt: 0 };
      try {
        await this.deps.db.comicBatchJob.updateMany({ where: { id: jobId, status: "running", progress: serialized },
          data: { status: "interrupted", progress: JSON.stringify(interrupted) } });
      } catch (saveError) {
        // If storage is unavailable, the persisted lease still expires and GET projects recovery.
        console.error(`[comic.batch] ${jobId} recovery persistence failed`, saveError);
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      if (this.controllers.get(jobId) === controller) this.controllers.delete(jobId);
    }
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.deps.db.comicBatchJob.findUnique({ where: { id: jobId } });
    if (!job || job.type !== BATCH_TYPE) throw new AppError("批量任务不存在。", 404);
    if (job.status === "completed" || job.status === "cancelled") return;
    const progress = readBatchProgress(job.progress);
    if (!progress) throw new AppError("这个任务缺少可恢复的记录，请重新开始。", 409);
    const result = await this.deps.db.comicBatchJob.updateMany({
      where: { id: jobId, status: job.status, progress: job.progress },
      data: { status: "cancelled", progress: JSON.stringify({ ...progress, status: "cancelled", leaseExpiresAt: 0 }) },
    });
    if (result.count !== 1) throw new AppError("任务进度有变化，请重试停止操作。", 409);
    this.controllers.get(jobId)?.abort(new ExecutionStoppedError("用户停止了后续生成。"));
  }

  async estimateCost(episodeId: string, provider = "openai") {
    const imageModel = await this.deps.resolveModel(provider as LLMProvider);
    const episode = await this.deps.db.comicEpisode.findUnique({ where: { id: episodeId }, include: { panels: { orderBy: { order: "asc" } } } });
    if (!episode) throw new AppError("漫画话数不存在。", 404);
    const ready = await Promise.all(episode.panels.map((panel) => this.deps.hasImage(panel)));
    return { totalPanels: ready.length, pendingPanels: ready.filter((value) => !value).length,
      imageModel, scopeFingerprint: scopeFingerprint(episode.panels, provider, imageModel),
      estimatedCentsCost: null, providerNote: `${provider} 的费用取决于所选模型、尺寸和平台计费规则，请以平台账单为准。` };
  }

  async getBatchJob(jobId: string) {
    const job = await this.deps.db.comicBatchJob.findUnique({ where: { id: jobId } });
    return job?.type === BATCH_TYPE ? projectBatchJob(job, this.deps.now()) : null;
  }

  async listBatchJobs(projectId: string) {
    const jobs = await this.deps.db.comicBatchJob.findMany({ where: { projectId, type: BATCH_TYPE }, orderBy: { createdAt: "desc" } });
    return jobs.map((job) => projectBatchJob(job, this.deps.now()));
  }
}

export const comicBatchOrchestrator = new ComicBatchOrchestrator();
