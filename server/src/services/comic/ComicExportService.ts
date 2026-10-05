/**
 * 漫画导出服务
 *
 * 1. 以话为单位，垂直拼接全话已排版格子图（lettered > raw 优先）
 * 2. 按平台规格逐片渲染，长图超出安全尺寸时自动分片
 * 3. 产物落盘 + ComicExportJob 记录
 *
 * 依赖：sharp（已安装）
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { resolveLetteredImageFile, resolvePanelImageFile } from "./assets";
import { ExportJobLease, recoverInterruptedExports, renderEpisodeArtifacts, resolveExportSpec } from "./export";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = "long_image" | "sliced";

export interface ExportSpec {
  /** 切片目标宽度（像素，默认 800） */
  sliceWidth?: number;
  /** 单切片最大高度（像素，0 = 自动选择安全高度） */
  sliceMaxHeight?: number;
  /** 输出格式 */
  outputFormat?: "png" | "jpg" | "webp";
  /** jpg/webp 质量（1-100） */
  quality?: number;
}

export interface ExportArtifact {
  index?: number;
  filePath: string;
  url: string;
  width: number;
  height: number;
}

export interface ExportJobResult {
  jobId: string;
  artifacts: ExportArtifact[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXPORT_DIR = "comic-exports";

function exportJobDir(jobId: string): string {
  return path.join(resolveGeneratedImagesRoot(), EXPORT_DIR, jobId);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComicExportService {
  /**
   * 导出一话为长图（optionally 切片）。
   * 全部格子必须有有效的已确认图片；导出冻结输入文件及元数据。
   */
  async exportEpisode(
    episodeId: string,
    format: ExportFormat = "long_image",
    spec: ExportSpec = {},
  ): Promise<ExportJobResult> {
    const resolvedSpec = resolveExportSpec(format, spec);
    const episode = await prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: {
        panels: { orderBy: { order: "asc" } },
        project: { select: { id: true } },
      },
    });
    if (!episode) throw new AppError(`未找到漫画话数：${episodeId}`, 404);
    if (episode.panels.length === 0) {
      throw new AppError("该话尚无格子，请先生成分格脚本和图像。", 400);
    }

    // 创建导出任务记录
    const job = await prisma.comicExportJob.create({
      data: {
        projectId: episode.projectId,
        episodeId,
        format,
        spec: JSON.stringify({ ...resolvedSpec, inputSnapshot: {
          episodeId, episodeOrder: episode.order, capturedAt: new Date().toISOString(),
          panels: episode.panels.map(({ id, order, visualPrompt, dialogues, characterRefs, sceneRef, imageData, letteredData }) =>
            ({ id, order, visualPrompt, dialogues, characterRefs, sceneRef, imageData, letteredData })),
        } }),
        status: "processing",
      },
    });

    const lease = new ExportJobLease(job.id);
    const jobDir = exportJobDir(job.id);
    try {
      await fs.mkdir(jobDir, { recursive: true });
      const inputDir = path.join(jobDir, "inputs");
      await fs.mkdir(inputDir, { recursive: true });
      const files: string[] = [];
      const missing: number[] = [];
      for (const panel of episode.panels) {
        const rawFile = await resolvePanelImageFile(panel);
        const file = rawFile ? await resolveLetteredImageFile(panel) ?? rawFile : null;
        if (!file) { missing.push(panel.order); continue; }
        try {
          const buffer = await fs.readFile(file.filePath);
          const metadata = await sharp(buffer).metadata();
          if (!metadata.width || !metadata.height) { missing.push(panel.order); continue; }
          const frozen = path.join(inputDir, `panel-${panel.order}.${file.ext}`);
          await fs.writeFile(frozen, buffer, { flag: "wx" });
          files.push(frozen);
        } catch (error) {
          // Missing/corrupt image is an incomplete episode, never a silently omitted panel.
          if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") throw error;
          missing.push(panel.order);
        }
      }
      if (missing.length > 0) throw new AppError(`第 ${missing.join("、")} 格缺少有效图片，请补齐后导出整话。`, 400);
      const artifacts = await renderEpisodeArtifacts({ files, jobDir, jobId: job.id,
        episodeOrder: episode.order, spec: resolvedSpec });

      await lease.complete(artifacts);

      return { jobId: job.id, artifacts };
    } catch (err) {
      await lease.fail(err);
      throw err;
    }
  }

  async getExportJob(jobId: string) {
    await recoverInterruptedExports({ id: jobId });
    return prisma.comicExportJob.findUnique({ where: { id: jobId } });
  }

  async listExportJobs(projectId: string) {
    await recoverInterruptedExports({ projectId });
    return prisma.comicExportJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /** 读取导出产物文件供 HTTP 流式响应 */
  async getArtifactFile(jobId: string, filename: string): Promise<{ buffer: Buffer; ext: string } | null> {
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename) return null;
    const job = await prisma.comicExportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "done") return null;
    let artifacts: ExportArtifact[];
    try { artifacts = JSON.parse(job.artifacts ?? "[]") as ExportArtifact[]; } catch { return null; }
    if (!Array.isArray(artifacts) || !artifacts.some((item) => item && typeof item.filePath === "string" && path.basename(item.filePath) === safeFilename)) return null;
    const filePath = path.join(exportJobDir(jobId), safeFilename);
    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(safeFilename).replace(".", "").toLowerCase();
      return { buffer, ext };
    } catch {
      return null;
    }
  }
}

export const comicExportService = new ComicExportService();
