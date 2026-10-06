import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { publishMediaAssetFile } from "../../../../modules/media";
import { resolveGeneratedMediaRoot } from "../../../../runtime/appPaths";
import { dramaExportService } from "../../DramaExportService";
import { assertCurrentStoryboard } from "../../revisions";
import { readRenderLimits, validateRenderTimeline } from "../domain/renderContract";
import { ensureRenderTools, renderTimelineToMp4 } from "../infrastructure/ffmpegRenderer";

type RenderJob = Awaited<ReturnType<typeof prisma.dramaRenderJob.findFirst>> & {};
type BoundTimeline = { storyboardId?: string; sourceRevision?: number; episode?: { id?: string } };

function publicJob<T extends { snapshotJson: string }>(job: T): Omit<T, "snapshotJson"> {
  const { snapshotJson: _snapshot, ...view } = job;
  return view;
}

function fingerprint(snapshot: string): string {
  return createHash("sha256").update(snapshot).digest("hex");
}

/** One worker per API instance. Rendering never submits model/provider requests. */
export class DramaRenderService {
  private pumping = false;
  private wakeRequested = false;
  private stopping = false;
  private active?: { jobId: string; controller: AbortController };
  private worker?: Promise<void>;

  async start(projectId: string, episodeOrder: number) {
    if (this.stopping) throw new AppError("服务正在重启，请稍后合成。", 503);
    const limits = readRenderLimits();
    const exported = await dramaExportService.exportEpisode(projectId, episodeOrder, "timeline-json");
    const parsed = JSON.parse(exported.body) as BoundTimeline;
    validateRenderTimeline(parsed, limits);
    if (!parsed.storyboardId || !Number.isInteger(parsed.sourceRevision)) {
      throw new AppError("分镜未绑定台本版本，请重新生成分镜后合成。", 409);
    }
    await ensureRenderTools(limits, AbortSignal.timeout(10000));
    const created = await prisma.$transaction(async tx => {
      const storyboard = await assertCurrentStoryboard(parsed.storyboardId!, tx);
      if (storyboard.projectId !== projectId || storyboard.episode.order !== episodeOrder
        || storyboard.episodeId !== parsed.episode?.id || storyboard.sourceRevision !== parsed.sourceRevision) {
        throw new AppError("本集台本或分镜有新版本，请刷新后重试合成。", 409);
      }
      const existing = await tx.dramaRenderJob.findFirst({
        where: { projectId, episodeId: storyboard.episodeId, status: { in: ["queued", "running"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;
      const pending = await tx.dramaRenderJob.count({ where: { status: { in: ["queued", "running"] } } });
      if (pending >= 20) throw new AppError("合成队列已满，请等待部分成片完成后重试。", 429);
      return tx.dramaRenderJob.create({ data: {
        projectId, episodeId: storyboard.episodeId, storyboardId: storyboard.id,
        sourceRevision: storyboard.sourceRevision, snapshotJson: exported.body, status: "queued",
      } });
    });
    this.kick();
    return { ...publicJob(created), isCurrent: fingerprint(created.snapshotJson) === fingerprint(exported.body) };
  }

  async list(projectId: string, episodeOrder: number) {
    const episode = await prisma.dramaEpisode.findUnique({ where: { projectId_order: { projectId, order: episodeOrder } } });
    if (!episode) throw new AppError("未找到本集。", 404);
    const jobs = await prisma.dramaRenderJob.findMany({
      where: { projectId, episodeId: episode.id }, orderBy: { createdAt: "desc" }, take: 30,
    });
    let currentFingerprint: string | null = null;
    if (jobs.length) {
      try { currentFingerprint = fingerprint((await dramaExportService.exportEpisode(projectId, episodeOrder, "timeline-json")).body); }
      catch { /* A removed or outdated storyboard invalidates the previous finished output. */ }
    }
    return jobs.map(job => {
      const isCurrent = job.sourceRevision === episode.revision && fingerprint(job.snapshotJson) === currentFingerprint;
      return { ...publicJob(job), isCurrent };
    });
  }

  async cancel(projectId: string, jobId: string) {
    const job = await prisma.dramaRenderJob.findFirst({ where: { id: jobId, projectId } });
    if (!job) throw new AppError("未找到成片任务。", 404);
    await prisma.dramaRenderJob.updateMany({
      where: { id: jobId, projectId, status: { in: ["queued", "running"] } },
      data: { status: "cancelled", failureReason: "合成已取消；镜头和配音素材仍保留。" },
    });
    if (this.active?.jobId === jobId) this.active.controller.abort();
    return publicJob((await prisma.dramaRenderJob.findUniqueOrThrow({ where: { id: jobId } })));
  }

  async recoverInterruptedJobs() {
    const interrupted = await prisma.dramaRenderJob.findMany({ where: { status: { in: ["queued", "running"] } }, select: { id: true } });
    const result = await prisma.dramaRenderJob.updateMany({
      where: { status: { in: ["queued", "running"] } },
      data: { status: "failed", failureReason: "服务重启中断了合成，素材已保留，请重新合成。" },
    });
    for (const job of interrupted) await this.cleanupDirectory(job.id);
    return result;
  }

  async shutdown() {
    this.stopping = true;
    this.active?.controller.abort();
    await this.worker;
    await prisma.dramaRenderJob.updateMany({
      where: { status: { in: ["queued", "running"] } },
      data: { status: "failed", failureReason: "服务重启中断了合成，素材已保留，请重新合成。" },
    });
  }

  private kick() {
    if (this.stopping) return;
    if (this.pumping) { this.wakeRequested = true; return; }
    this.pumping = true;
    this.worker = this.drain().catch(error => console.error("[drama-render] worker failed", error))
      .finally(() => {
        this.pumping = false;
        this.worker = undefined;
        if (this.wakeRequested) { this.wakeRequested = false; this.kick(); }
      });
  }

  private async drain() {
    while (!this.stopping) {
      const next = await prisma.dramaRenderJob.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
      if (!next) return;
      const claimed = await prisma.dramaRenderJob.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", progress: 1 } });
      if (!claimed.count) continue;
      await this.execute(next);
    }
  }

  private directory(jobId: string) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(jobId)) throw new Error("Invalid render job id");
    return path.join(resolveGeneratedMediaRoot(), ".render-work", jobId);
  }

  private async cleanupDirectory(jobId: string) {
    await fs.rm(this.directory(jobId), { recursive: true, force: true }).catch(error => console.warn("[drama-render] temporary file cleanup failed", error));
  }

  private async execute(job: RenderJob) {
    const controller = new AbortController();
    this.active = { jobId: job.id, controller };
    const limits = readRenderLimits();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(limits.timeoutMs)]);
    const directory = this.directory(job.id);
    let publishedUrl: string | undefined;
    try {
      const currentJob = await prisma.dramaRenderJob.findUnique({ where: { id: job.id } });
      if (currentJob?.status !== "running") return;
      const storyboard = await assertCurrentStoryboard(job.storyboardId);
      if (storyboard.sourceRevision !== job.sourceRevision || storyboard.episodeId !== job.episodeId) {
        throw new AppError("本集台本或分镜有新版本，请重新合成。", 409);
      }
      const timeline = validateRenderTimeline(JSON.parse(job.snapshotJson), limits);
      await fs.mkdir(directory, { recursive: true });
      const disk = await fs.statfs(directory);
      if (disk.bavail * disk.bsize < limits.maxTotalBytes + 3 * limits.maxOutputBytes + 50 * 1024 * 1024) {
        throw new AppError("媒体存储空间不足，请释放空间或降低合成大小上限后重试。", 422);
      }
      const output = await renderTimelineToMp4({
        timeline, directory, limits, signal,
        onProgress: async progress => {
          const updated = await prisma.dramaRenderJob.updateMany({ where: { id: job.id, status: "running" }, data: { progress } });
          if (!updated.count) { controller.abort(); signal.throwIfAborted(); }
        },
      });
      signal.throwIfAborted();
      publishedUrl = (await publishMediaAssetFile({ kind: "video", filePath: output, contentType: "video/mp4" })).url;
      await prisma.$transaction(async tx => {
        const current = await assertCurrentStoryboard(job.storyboardId, tx);
        if (current.sourceRevision !== job.sourceRevision) throw new AppError("台本有新版本，请重新合成。", 409);
        const latest = await dramaExportService.exportEpisode(job.projectId, storyboard.episode.order, "timeline-json", tx);
        if (fingerprint(latest.body) !== fingerprint(job.snapshotJson)) {
          throw new AppError("合成期间台本、分镜或素材有新版本；本次成片已保留，请重新合成最新版本。", 409);
        }
        signal.throwIfAborted();
        const result = await tx.dramaRenderJob.updateMany({
          where: { id: job.id, status: "running" }, data: { status: "succeeded", progress: 100, resultUrl: publishedUrl, failureReason: null },
        });
        if (!result.count) {
          // The user may cancel during publication. Keep the generated file as historical output.
          await tx.dramaRenderJob.updateMany({ where: { id: job.id, status: "cancelled" }, data: { resultUrl: publishedUrl } });
        }
      });
    } catch (error) {
      const message = this.stopping ? "服务重启中断了合成，素材已保留，请重新合成。"
        : signal.aborted && !controller.signal.aborted ? "合成超时，素材已保留；请缩短本集时长后重试。"
          : error instanceof AppError ? error.message : "成片处理失败，请检查素材是否可读取后重试。";
      await prisma.dramaRenderJob.updateMany({
        where: { id: job.id, status: "running" }, data: { status: "failed", failureReason: message, ...(publishedUrl ? { resultUrl: publishedUrl } : {}) },
      });
      if (publishedUrl) await prisma.dramaRenderJob.updateMany({ where: { id: job.id, status: "cancelled" }, data: { resultUrl: publishedUrl } });
    } finally {
      await this.cleanupDirectory(job.id);
      this.active = undefined;
    }
  }
}

export const dramaRenderService = new DramaRenderService();
