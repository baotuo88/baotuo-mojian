import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { DramaBatchJob } from "@prisma/client";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { assertCurrentStoryboard, withCurrentShot } from "../revisions";
import { DramaVideoPromptService } from "../DramaVideoPromptService";
import { DramaDialogueAudioService } from "../audio/DramaDialogueAudioService";
import { ttsProviderRegistry } from "../audio/TTSProviderPort";
import { DramaShotKeyframeService } from "../visual/DramaShotKeyframeService";
import { videoProviderRegistry } from "../video/VideoProviderPort";

export type DramaBatchJobType = "keyframes" | "videos" | "tts";
export type DramaBatchJobStatus = "pending" | "running" | "paused" | "done" | "failed";

export interface DramaBatchProgress {
  total: number;
  done: number;
  failed: number;
  skipped: number;
  failedShotIds: string[];
  provider?: string;
  targetShotIds?: string[];
  currentShotId?: string;
  completedShotIds?: string[];
  storyboardId?: string;
  pauseRequested?: boolean;
  interruptionReason?: string;
  errors?: Array<{ shotId: string; message: string }>;
  useCharacterRefImages?: boolean;
  cost?: DramaBatchCostBreakdown;
}

export interface DramaBatchCostUnits {
  images?: number;
  seconds?: number;
  shots?: number;
  lines?: number;
}

export interface DramaBatchCostBreakdown {
  currency: string;
  estimated: number;
  actual: number;
  estimatedUnits: DramaBatchCostUnits;
  actualUnits: DramaBatchCostUnits;
  unit: {
    costPerImage?: number;
    costPerSecond?: number;
  };
}

export interface CreateEpisodeBatchJobInput {
  type: DramaBatchJobType;
  provider?: string;
  failedShotIds?: string[];
  useCharacterRefImages?: boolean;
}

interface CreateEpisodeBatchJobOptions {
  autoStart?: boolean;
}

interface BatchShot {
  id: string;
  durationSec?: number | null;
  dialogue?: string | null;
  keyframeData?: string | null;
  dialogueAudioData?: string | null;
}

interface BatchEpisode {
  id: string;
  storyboards: Array<{ id: string; shots: BatchShot[] }>;
  videoPrompts?: BatchVideoPrompt[];
}

interface BatchVideoPrompt {
  shotId?: string | null;
  providerTaskId?: string | null;
  status: string;
  version?: number | null;
}

type BatchProcessResult = {
  status: "processed" | "skipped";
  costUnits?: DramaBatchCostUnits;
};

const DEFAULT_IMAGE_PROVIDER = "openai";

function normalizeDurationSec(value: number | null | undefined, fallback = 5): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeCostNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function readCostCurrency(): string {
  return process.env.DRAMA_COST_CURRENCY?.trim() || "CNY";
}

function providerEnvKey(provider: string): string {
  return provider.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function readImageCostPerImage(provider: string): number {
  const providerKey = providerEnvKey(provider);
  return normalizeCostNumber(
    process.env[`DRAMA_IMAGE_COST_PER_IMAGE_${providerKey}`]
    ?? process.env.DRAMA_IMAGE_COST_PER_IMAGE,
  );
}

function hasDoneKeyframe(raw: string | null | undefined): boolean {
  const parsed = safeJsonParse<{ status?: string; url?: string }>(raw, {});
  return parsed.status === "done" && typeof parsed.url === "string" && parsed.url.trim().length > 0;
}

function hasDoneDialogueAudio(raw: string | null | undefined): boolean {
  const parsed = safeJsonParse<{ status?: string; items?: unknown[] }>(raw, {});
  return parsed.status === "done" && Array.isArray(parsed.items) && parsed.items.length > 0;
}

function isActiveVideoPrompt(prompt: BatchVideoPrompt): boolean {
  return prompt.status !== "superseded";
}

function addCostUnits(left: DramaBatchCostUnits, right: DramaBatchCostUnits): DramaBatchCostUnits {
  return {
    images: (left.images ?? 0) + (right.images ?? 0) || undefined,
    seconds: (left.seconds ?? 0) + (right.seconds ?? 0) || undefined,
    shots: (left.shots ?? 0) + (right.shots ?? 0) || undefined,
    lines: (left.lines ?? 0) + (right.lines ?? 0) || undefined,
  };
}

function calculateCost(unit: DramaBatchCostBreakdown["unit"], units: DramaBatchCostUnits): number {
  return roundCost(
    (unit.costPerImage ?? 0) * (units.images ?? 0)
    + (unit.costPerSecond ?? 0) * (units.seconds ?? 0),
  );
}

function normalizeCostBreakdown(input: DramaBatchCostBreakdown | undefined): DramaBatchCostBreakdown | undefined {
  if (!input) {
    return undefined;
  }
  const unit = {
    costPerImage: normalizeCostNumber(input.unit?.costPerImage),
    costPerSecond: normalizeCostNumber(input.unit?.costPerSecond),
  };
  const estimatedUnits = input.estimatedUnits ?? {};
  const actualUnits = input.actualUnits ?? {};
  return {
    currency: input.currency || readCostCurrency(),
    estimated: calculateCost(unit, estimatedUnits),
    actual: calculateCost(unit, actualUnits),
    estimatedUnits,
    actualUnits,
    unit,
  };
}

function normalizeProgress(input: Partial<DramaBatchProgress>): DramaBatchProgress {
  return {
    total: input.total ?? 0,
    done: input.done ?? 0,
    failed: input.failed ?? 0,
    skipped: input.skipped ?? 0,
    failedShotIds: input.failedShotIds ?? [],
    provider: input.provider,
    targetShotIds: input.targetShotIds,
    currentShotId: input.currentShotId,
    completedShotIds: input.completedShotIds ?? [],
    storyboardId: input.storyboardId,
    pauseRequested: input.pauseRequested ?? false,
    interruptionReason: input.interruptionReason,
    errors: input.errors ?? [],
    useCharacterRefImages: input.useCharacterRefImages,
    cost: normalizeCostBreakdown(input.cost),
  };
}

function readProgress(raw: string | null | undefined): DramaBatchProgress {
  const parsed = safeJsonParse<Partial<DramaBatchProgress>>(raw, {});
  // Older workers checkpointed a strictly ordered prefix but had no completed IDs.
  if (!parsed.completedShotIds && parsed.targetShotIds) {
    const processed = (parsed.done ?? 0) + (parsed.failed ?? 0);
    parsed.completedShotIds = parsed.targetShotIds.slice(0, processed)
      .filter((id) => !parsed.failedShotIds?.includes(id));
  }
  return normalizeProgress(parsed);
}

export class DramaBatchOrchestrator {
  private readonly runningJobs = new Set<string>();
  private stopping = false;

  constructor(
    private readonly keyframeService = new DramaShotKeyframeService(),
    private readonly videoPromptService = new DramaVideoPromptService(),
    private readonly dialogueAudioService = new DramaDialogueAudioService(),
  ) {}

  /** Run before accepting HTTP requests. Never reissue paid work during startup. */
  async recoverInterruptedJobs() {
    this.stopping = false;
    // This runs only at single-API startup, before requests are accepted. A
    // restarted process cannot still own these synchronous media invocations.
    const shots = await prisma.dramaShot.findMany({
      where: { OR: [{ keyframeData: { contains: '"generating"' } }, { dialogueAudioData: { contains: '"generating"' } }] },
      select: { id: true, keyframeData: true, dialogueAudioData: true },
    });
    for (const shot of shots) {
      for (const field of ["keyframeData", "dialogueAudioData"] as const) {
        const state = safeJsonParse<Record<string, unknown> | null>(shot[field], null);
        if (state?.status !== "generating") continue;
        await prisma.dramaShot.updateMany({
          where: { id: shot.id, [field]: shot[field] },
          data: { [field]: JSON.stringify({ ...state, status: "error", error: "制作因服务中断而停止，请核对通道费用后重新生成。" }) },
        });
      }
    }
    const jobs = await prisma.dramaBatchJob.findMany({ where: { status: { in: ["pending", "running"] } } });
    for (const job of jobs) {
      const progress = readProgress(job.progress);
      progress.pauseRequested = false;
      progress.interruptionReason = "服务中断，已保留完成进度。请先核对媒体通道中的任务，再确认继续；中断的镜头可能产生额外费用。";
      await prisma.dramaBatchJob.updateMany({
        where: { id: job.id, status: job.status, progress: job.progress },
        data: { status: "paused", progress: JSON.stringify(progress) },
      });
    }
    return jobs.length;
  }

  async stop() {
    this.stopping = true;
    for (const id of this.runningJobs) {
      const job = await prisma.dramaBatchJob.findUnique({ where: { id } });
      if (job) await this.pauseBatchJob(job.projectId, id);
    }
  }

  private async ownedJob(projectId: string, jobId: string) {
    const job = await prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
    if (!job || job.projectId !== projectId) throw new AppError("未找到该项目的制作任务。", 404);
    return job;
  }

  async pauseBatchJob(projectId: string, jobId: string): Promise<DramaBatchJob> {
    const job = await this.ownedJob(projectId, jobId);
    if (!["pending", "running"].includes(job.status)) return job;
    const progress = readProgress(job.progress);
    progress.pauseRequested = true;
    // CAS avoids replacing a worker checkpoint that advanced while this request read it.
    const updated = await prisma.dramaBatchJob.updateMany({
      where: { id: jobId, status: job.status, progress: job.progress },
      data: { status: job.status === "pending" ? "paused" : "running", progress: JSON.stringify(progress) },
    });
    if (!updated.count) return this.pauseBatchJob(projectId, jobId);
    return this.ownedJob(projectId, jobId);
  }

  async resumeBatchJob(projectId: string, jobId: string, confirmAdditionalCost: boolean, options: CreateEpisodeBatchJobOptions = {}) {
    if (!confirmAdditionalCost) throw new AppError("请确认继续制作可能产生额外费用。", 400);
    if (this.stopping) throw new AppError("服务正在停止，请稍后继续制作。", 503);
    const job = await this.ownedJob(projectId, jobId);
    if (!["paused", "failed"].includes(job.status)) return job;
    const progress = readProgress(job.progress);
    await this.loadTargetShots(job.episodeId, progress);
    progress.failed = 0;
    progress.failedShotIds = [];
    progress.errors = [];
    progress.pauseRequested = false;
    progress.interruptionReason = undefined;
    const updated = await withCurrentShot(progress.targetShotIds![0], async (tx) => {
      const candidates = await tx.dramaBatchJob.findMany({
        where: { projectId, episodeId: job.episodeId, type: job.type, id: { not: jobId }, status: { in: ["pending", "running", "paused"] } },
      });
      const active = candidates.find((candidate) => {
        if (candidate.status !== "paused") return true;
        const other = readProgress(candidate.progress);
        return other.storyboardId ? other.storyboardId === progress.storyboardId
          : Boolean(other.targetShotIds?.length && other.targetShotIds.every((id) => progress.targetShotIds?.includes(id)));
      });
      if (active) throw new AppError("该集已有同类制作任务，请先处理该任务。", 409);
      return tx.dramaBatchJob.updateMany({
        where: { id: jobId, status: job.status, progress: job.progress },
        data: { status: "pending", progress: JSON.stringify(progress) },
      });
    });
    if (updated.count && (options.autoStart ?? true)) this.startJob(jobId);
    return this.ownedJob(projectId, jobId);
  }

  private startJob(jobId: string) {
    void this.runBatchJob(jobId).catch((error) => {
      console.error("[drama.batch] failed to checkpoint production task", { jobId, error });
    });
  }

  async createEpisodeBatchJob(
    projectId: string,
    order: number,
    input: CreateEpisodeBatchJobInput,
    options: CreateEpisodeBatchJobOptions = {},
  ) {
    if (this.stopping) throw new AppError("服务正在停止，请稍后创建任务。", 503);
    const prepared = await this.prepareEpisodeBatchJob(projectId, order, input);
    const progress = normalizeProgress({
      total: prepared.targetShotIds.length,
      done: 0,
      failed: 0,
      skipped: 0,
      failedShotIds: [],
      provider: prepared.provider,
      targetShotIds: prepared.targetShotIds,
      storyboardId: prepared.episode.storyboards[0].id,
      errors: [],
      useCharacterRefImages: input.useCharacterRefImages ?? false,
      cost: prepared.cost,
    });
    // The episode lock serializes creation across requests and media types. Do not
    // acquire a project lock here: planning takes project then episode locks.
    const job = await withCurrentShot(prepared.targetShotIds[0], async (tx) => {
      const existing = await tx.dramaBatchJob.findFirst({
        where: { projectId, episodeId: prepared.episode.id, type: input.type, status: { in: ["pending", "running", "paused"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const previous = readProgress(existing.progress);
        // Old paused work must not prevent starting production for a new storyboard.
        if (previous.storyboardId === progress.storyboardId
          || (!previous.storyboardId && previous.targetShotIds?.every((id) => progress.targetShotIds?.includes(id)))) return existing;
        if (existing.status !== "paused") throw new AppError("上一版分镜仍有制作任务，请先暂停。", 409);
      }
      return tx.dramaBatchJob.create({
        data: { projectId, episodeId: prepared.episode.id, type: input.type, status: "pending", progress: JSON.stringify(progress) },
      });
    });
    if ((options.autoStart ?? true) && job.status === "pending") this.startJob(job.id);
    return job;
  }

  async estimateEpisodeBatchJob(
    projectId: string,
    order: number,
    input: CreateEpisodeBatchJobInput,
  ) {
    const prepared = await this.prepareEpisodeBatchJob(projectId, order, input);
    return {
      type: input.type,
      provider: prepared.provider,
      total: prepared.targetShotIds.length,
      targetShotIds: prepared.targetShotIds,
      cost: prepared.cost,
    };
  }

  private async loadTargetShots(episodeId: string | null, progress: DramaBatchProgress) {
    if (!episodeId) throw new AppError("制作任务关联的集数不存在。", 409);
    const episode = await prisma.dramaEpisode.findUnique({
      where: { id: episodeId },
      include: { storyboards: { orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1, include: { shots: { orderBy: { order: "asc" } } } } },
    });
    const storyboard = episode?.storyboards[0];
    const targetIds = progress.targetShotIds;
    if (!storyboard || !targetIds?.length
      || (progress.storyboardId && progress.storyboardId !== storyboard.id)
      || targetIds.some((id) => !storyboard.shots.some((shot) => shot.id === id))) {
      throw new AppError("分镜已变化或镜头缺失，请为当前分镜新建制作任务。", 409);
    }
    await assertCurrentStoryboard(storyboard.id);
    return { episodeId, shots: storyboard.shots.filter((shot) => targetIds.includes(shot.id)) };
  }

  async runBatchJob(jobId: string) {
    if (this.stopping || this.runningJobs.has(jobId)) return prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
    this.runningJobs.add(jobId);
    let progress: DramaBatchProgress | undefined;
    let claimed = false;
    try {
      const job = await prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
      if (!job) throw new AppError("未找到制作任务。", 404);
      if (job.status !== "pending") return job;
      const claim = await prisma.dramaBatchJob.updateMany({
        where: { id: jobId, status: "pending", progress: job.progress }, data: { status: "running" },
      });
      if (!claim.count) return prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
      claimed = true;
      progress = readProgress(job.progress);
      if (!["keyframes", "videos", "tts"].includes(job.type)) throw new AppError("该制作任务类型暂不支持继续。", 400);
      if (!progress.provider || (progress.provider === "mock" && process.env.NODE_ENV !== "test")) {
        throw new AppError("任务缺少可用生成通道，请选择已配置通道创建新任务。", 400);
      }
      const target = await this.loadTargetShots(job.episodeId, progress);
      const completed = new Set(progress.completedShotIds);
      const failed = new Set(progress.failedShotIds);
      for (const originalShot of target.shots) {
        if (completed.has(originalShot.id) || failed.has(originalShot.id)) continue;
        const checkpoint = await prisma.dramaBatchJob.findUnique({ where: { id: jobId } });
        if (!checkpoint || checkpoint.status !== "running") return checkpoint;
        if (this.stopping || readProgress(checkpoint.progress).pauseRequested) {
          progress.pauseRequested = false;
          return this.updateJob(jobId, "paused", progress);
        }
        // Check the pinned storyboard between external calls and read fresh assets.
        const current = await this.loadTargetShots(job.episodeId, progress);
        const shot = current.shots.find((item) => item.id === originalShot.id)!;
        progress.currentShotId = shot.id;
        await this.updateJob(jobId, "running", progress);
        try {
          const result = await this.processShot(job.type as DramaBatchJobType, job.projectId, target.episodeId, shot, progress.provider, progress.useCharacterRefImages ?? false);
          if (result.status === "skipped") progress.skipped += 1;
          if (result.status === "processed" && result.costUnits && progress.cost) {
            progress.cost = this.addActualCost(progress.cost, result.costUnits);
          }
          completed.add(shot.id);
          progress.completedShotIds = [...completed];
          progress.done += 1;
        } catch (error) {
          progress.failed += 1;
          progress.failedShotIds.push(shot.id);
          progress.errors = (progress.errors ?? []).concat({ shotId: shot.id, message: error instanceof Error ? error.message : String(error) });
        }
        progress.currentShotId = undefined;
        await this.updateJob(jobId, "running", progress);
      }
      // A final external call may have crossed a script edit. Never finish the
      // whole job successfully against a storyboard that is no longer current.
      await this.loadTargetShots(job.episodeId, progress);
      progress.pauseRequested = false;
      const finishedProgress = progress;
      return await withCurrentShot(target.shots[0].id, async (tx) =>
        this.updateJob(jobId, finishedProgress.failed > 0 ? "failed" : "done", finishedProgress, tx));
    } catch (error) {
      if (!claimed || !progress) throw error;
      progress.interruptionReason = error instanceof Error ? error.message : String(error);
      return this.updateJob(jobId, "failed", progress);
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  private async processKeyframeShot(shot: BatchShot, provider?: string, useCharacterRefImages = false): Promise<"processed" | "skipped"> {
    if (hasDoneKeyframe(shot.keyframeData)) {
      return "skipped";
    }
    await this.keyframeService.generateKeyframe(shot.id, (provider || DEFAULT_IMAGE_PROVIDER) as LLMProvider, useCharacterRefImages);
    return "processed";
  }

  private async processTtsShot(shot: BatchShot, provider?: string): Promise<BatchProcessResult> {
    if (hasDoneDialogueAudio(shot.dialogueAudioData)) {
      return { status: "skipped" };
    }
    const data = await this.dialogueAudioService.synthesizeShotDialogue(shot.id, provider);
    const seconds = (data.items ?? []).reduce((sum, item) => {
      return sum + normalizeDurationSec(item.durationSec, Math.max(1, Math.ceil(item.text.length / 5)));
    }, 0);
    return {
      status: "processed",
      costUnits: {
        seconds,
        lines: data.items?.length ?? 0,
        shots: 1,
      },
    };
  }

  private async processVideoShot(
    projectId: string,
    episodeId: string,
    shotId: string,
    provider?: string,
  ): Promise<"processed" | "skipped"> {
    let prompt = await prisma.dramaVideoPrompt.findFirst({
      where: { projectId, episodeId, shotId, status: { not: "superseded" } },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    if (prompt?.providerTaskId && prompt.status !== "failed") {
      return "skipped";
    }
    if (!prompt) {
      prompt = await this.videoPromptService.generateVideoPromptForShot(projectId, shotId);
    }
    await this.videoPromptService.createProviderTask(prompt.id, provider);
    return "processed";
  }

  private async processShot(
    type: DramaBatchJobType,
    projectId: string,
    episodeId: string,
    shot: BatchShot,
    provider?: string,
    useCharacterRefImages = false,
  ): Promise<BatchProcessResult> {
    if (type === "keyframes") {
      const status = await this.processKeyframeShot(shot, provider, useCharacterRefImages);
      return status === "processed"
        ? { status, costUnits: { images: 1, shots: 1 } }
        : { status };
    }
    if (type === "tts") {
      return this.processTtsShot(shot, provider);
    }
    const status = await this.processVideoShot(projectId, episodeId, shot.id, provider);
    return status === "processed"
      ? { status, costUnits: { seconds: normalizeDurationSec(shot.durationSec), shots: 1 } }
      : { status };
  }

  private defaultProviderForType(type: DramaBatchJobType): string {
    if (type === "keyframes") {
      return DEFAULT_IMAGE_PROVIDER;
    }
    const providers = type === "tts" ? ttsProviderRegistry.listProviders() : videoProviderRegistry.listProviders();
    const provider = providers.find((item) => item.provider !== "mock");
    if (!provider) throw new AppError("请先在设置的媒体通道中配置配音或视频服务。", 400);
    return provider.provider;
  }

  private async prepareEpisodeBatchJob(
    projectId: string,
    order: number,
    input: CreateEpisodeBatchJobInput,
  ): Promise<{
    episode: BatchEpisode;
    provider: string;
    targetShotIds: string[];
    cost: DramaBatchCostBreakdown;
  }> {
    const episode = await prisma.dramaEpisode.findUnique({
      where: { projectId_order: { projectId, order } },
      include: {
        storyboards: {
          orderBy: [{ version: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          include: { shots: { orderBy: { order: "asc" } } },
        },
        videoPrompts: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
      },
    });
    if (!episode) {
      throw new AppError(`未找到短剧第 ${order} 集。`, 404);
    }
    const shots = episode.storyboards[0]?.shots ?? [];
    if (!shots.length) {
      throw new AppError(`第 ${order} 集还没有分镜，不能创建批量任务。`, 400);
    }
    await assertCurrentStoryboard(episode.storyboards[0].id);
    const allowedShotIds = new Set(shots.map((shot) => shot.id));
    const targetShots = (input.failedShotIds?.length
      ? shots.filter((shot) => input.failedShotIds?.includes(shot.id))
      : shots)
      .filter((shot) => allowedShotIds.has(shot.id));
    if (!targetShots.length) {
      throw new AppError("没有可处理的镜头。", 400);
    }

    const provider = input.provider?.trim() || this.defaultProviderForType(input.type);
    if (provider === "mock" && process.env.NODE_ENV !== "test") {
      throw new AppError("请选择已配置的媒体通道，模拟通道仅用于测试。", 400);
    }
    return {
      episode,
      provider,
      targetShotIds: targetShots.map((shot) => shot.id),
      cost: this.estimateCost(input.type, provider, targetShots, episode.videoPrompts ?? []),
    };
  }

  private estimateCost(
    type: DramaBatchJobType,
    provider: string,
    shots: BatchShot[],
    videoPrompts: BatchVideoPrompt[],
  ): DramaBatchCostBreakdown {
    const unit = this.resolveCostUnit(type, provider);
    const latestPromptByShot = new Map<string, BatchVideoPrompt>();
    for (const prompt of videoPrompts) {
      if (prompt.shotId && isActiveVideoPrompt(prompt) && !latestPromptByShot.has(prompt.shotId)) {
        latestPromptByShot.set(prompt.shotId, prompt);
      }
    }

    let estimatedUnits: DramaBatchCostUnits = {};
    if (type === "keyframes") {
      const billableShots = shots.filter((shot) => !hasDoneKeyframe(shot.keyframeData));
      estimatedUnits = { images: billableShots.length, shots: billableShots.length };
    } else if (type === "videos") {
      const billableShots = shots.filter((shot) => {
        const prompt = latestPromptByShot.get(shot.id);
        return !(prompt?.providerTaskId && prompt.status !== "failed");
      });
      estimatedUnits = {
        seconds: billableShots.reduce((sum, shot) => sum + normalizeDurationSec(shot.durationSec), 0),
        shots: billableShots.length,
      };
    } else {
      const billableShots = shots.filter((shot) => !hasDoneDialogueAudio(shot.dialogueAudioData));
      estimatedUnits = {
        seconds: billableShots.reduce((sum, shot) => sum + normalizeDurationSec(shot.durationSec), 0),
        shots: billableShots.length,
      };
    }

    return normalizeCostBreakdown({
      currency: unit.currency,
      estimated: 0,
      actual: 0,
      estimatedUnits,
      actualUnits: {},
      unit: unit.unit,
    })!;
  }

  private resolveCostUnit(type: DramaBatchJobType, provider: string): {
    currency: string;
    unit: DramaBatchCostBreakdown["unit"];
  } {
    if (type === "keyframes") {
      return {
        currency: readCostCurrency(),
        unit: { costPerImage: readImageCostPerImage(provider) },
      };
    }
    if (type === "tts") {
      const resolved = ttsProviderRegistry.resolve(provider);
      return {
        currency: resolved.currency ?? readCostCurrency(),
        unit: { costPerSecond: resolved.costPerSecond ?? 0 },
      };
    }
    const resolved = videoProviderRegistry.resolve(provider);
    return {
      currency: resolved.currency ?? readCostCurrency(),
      unit: { costPerSecond: resolved.costPerSecond ?? 0 },
    };
  }

  private addActualCost(cost: DramaBatchCostBreakdown, units: DramaBatchCostUnits): DramaBatchCostBreakdown {
    return normalizeCostBreakdown({
      ...cost,
      actualUnits: addCostUnits(cost.actualUnits, units),
    })!;
  }

  private async updateJob(
    jobId: string,
    status: DramaBatchJobStatus,
    progress: DramaBatchProgress,
    db: Pick<typeof prisma, "dramaBatchJob"> = prisma,
  ): Promise<DramaBatchJob | null> {
    const current = await db.dramaBatchJob.findUnique({ where: { id: jobId } });
    if (!current || current.status !== "running") return current;
    const saved = readProgress(current.progress);
    const next = { ...progress, pauseRequested: status === "running" && (saved.pauseRequested || progress.pauseRequested) };
    const updated = await db.dramaBatchJob.updateMany({
      where: { id: jobId, status: "running", progress: current.progress },
      data: { status, progress: JSON.stringify(next) },
    });
    if (!updated.count) return this.updateJob(jobId, status, progress, db);
    return db.dramaBatchJob.findUnique({ where: { id: jobId } });
  }
}

export const dramaBatchOrchestrator = new DramaBatchOrchestrator();
