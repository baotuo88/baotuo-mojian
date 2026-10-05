import { prisma } from "../../db/prisma";
import { randomUUID } from "node:crypto";
import type { DramaVideoPrompt } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { dramaVideoPromptPrompt } from "../../prompting/prompts/drama/drama.prompts";
import { dramaContextAssembler } from "./DramaContextAssembler";
import { safeJsonParse } from "./utils/json";
import { videoProviderRegistry } from "./video/VideoProviderPort";
import type { DramaLLMOptions } from "./DramaStrategyService";
import type { VideoGenerationRequest, VideoGenerationResult } from "./video/VideoProviderPort";

const ACTIVE_TASK_STATUSES = new Set(["queued", "running", "submitting", "submission_unknown"]);
const SUCCESS_STATUSES = new Set(["succeeded", "done", "completed"]);

function revisionWhere(prompt: DramaVideoPrompt) {
  return { id: prompt.id, status: prompt.status, supersededById: prompt.supersededById,
    provider: prompt.provider, providerTaskId: prompt.providerTaskId, providerResult: prompt.providerResult,
    resultUrl: prompt.resultUrl, updatedAt: prompt.updatedAt, prompt: prompt.prompt,
    negativePrompt: prompt.negativePrompt, aspectRatio: prompt.aspectRatio, durationSec: prompt.durationSec };
}

function assertPromptReplaceable(prompt: DramaVideoPrompt | null) {
  if (prompt && ACTIVE_TASK_STATUSES.has(prompt.status)) {
    throw new AppError("本镜头的视频任务尚未结束，请先查询任务结果再修改视频提示词。", 409);
  }
}

interface PortraitReferenceData {
  status?: string;
  url?: string;
}

interface KeyframeReferenceData {
  status?: string;
  url?: string;
}

interface VideoPromptReferenceSource {
  projectId: string;
  episodeId?: string | null;
  shotId?: string | null;
}

function normalizeReferenceKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(raw, raw ?? []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return [parsed.trim()];
  }
  return [];
}

function normalizeRefImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) {
    return trimmed;
  }
  const baseUrl = process.env.DRAMA_VIDEO_REF_IMAGE_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (!baseUrl) {
    return trimmed;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

async function collectShotReferenceImages(videoPrompt: VideoPromptReferenceSource): Promise<string[]> {
  if (!videoPrompt.shotId) {
    return [];
  }
  const shot = await prisma.dramaShot.findUnique({
    where: { id: videoPrompt.shotId },
    include: { storyboard: { include: { episode: true } } },
  });
  if (!shot || shot.storyboard.projectId !== videoPrompt.projectId
    || shot.storyboard.episode.projectId !== videoPrompt.projectId
    || (videoPrompt.episodeId && shot.storyboard.episodeId !== videoPrompt.episodeId)) {
    throw new AppError("镜头不属于当前短剧项目，请重新选择镜头。", 409);
  }
  const urls: string[] = [];
  const keyframe = safeJsonParse<KeyframeReferenceData>(shot?.keyframeData, {});
  if (keyframe.status === "done" && typeof keyframe.url === "string" && keyframe.url.trim()) {
    urls.push(normalizeRefImageUrl(keyframe.url));
  }
  const refs = parseCharacterRefs(shot?.characterRefs);
  if (!refs.length) {
    return [...new Set(urls)];
  }
  const refKeys = new Set(refs.map(normalizeReferenceKey).filter((key): key is string => Boolean(key)));
  const characters = await prisma.dramaCharacter.findMany({
    where: { projectId: videoPrompt.projectId },
    select: { id: true, name: true, portraitData: true },
  });
  for (const character of characters) {
    const idKey = normalizeReferenceKey(character.id);
    const nameKey = normalizeReferenceKey(character.name);
    if ((!idKey || !refKeys.has(idKey)) && (!nameKey || !refKeys.has(nameKey))) {
      continue;
    }
    const portrait = safeJsonParse<PortraitReferenceData>(character.portraitData, {});
    const url = typeof portrait.url === "string" ? normalizeRefImageUrl(portrait.url) : "";
    if (portrait.status === "done" && url) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

export class DramaVideoPromptService {
  async generateVideoPromptForShot(projectId: string, shotId: string, options: DramaLLMOptions = {}) {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: { storyboard: { include: { episode: true } } },
    });
    if (!shot || shot.storyboard.projectId !== projectId || shot.storyboard.episode.projectId !== projectId) {
      throw new AppError("未找到当前短剧项目的镜头。", 404);
    }
    const latest = await prisma.dramaVideoPrompt.findFirst({ where: { projectId, shotId }, orderBy: [{ version: "desc" }, { createdAt: "desc" }] });
    assertPromptReplaceable(latest);
    const context = await dramaContextAssembler.buildEpisodeContext(projectId, shot.storyboard.episode.order);
    const result = await runStructuredPrompt({
      asset: dramaVideoPromptPrompt,
      promptInput: {
        shotJson: JSON.stringify({
          order: shot.order,
          shotSize: shot.shotSize,
          cameraMove: shot.cameraMove,
          durationSec: shot.durationSec,
          location: shot.location,
          action: shot.action,
          dialogue: shot.dialogue,
          characterRefs: shot.characterRefs,
          visualPrompt: shot.visualPrompt,
        }, null, 2),
        charactersDigest: context.charactersDigest,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
      },
    });
    const output = result.output;
    const version = (latest?.version ?? 0) + 1;
    return prisma.$transaction(async (tx) => {
      const shotClaim = await tx.dramaShot.updateMany({
        where: { id: shotId, storyboardId: shot.storyboardId, updatedAt: shot.updatedAt, action: shot.action, dialogue: shot.dialogue, visualPrompt: shot.visualPrompt },
        data: { updatedAt: shot.updatedAt },
      });
      if (shotClaim.count !== 1) throw new AppError("镜头内容在生成期间发生变化，请重新生成视频提示词。", 409);
      const current = await tx.dramaVideoPrompt.findFirst({ where: { projectId, shotId }, orderBy: [{ version: "desc" }, { createdAt: "desc" }] });
      if (current?.id !== latest?.id) throw new AppError("本镜头有更新的视频提示词，请查看最新版本。", 409);
      assertPromptReplaceable(current);
      if (latest) {
        const claim = await tx.dramaVideoPrompt.updateMany({ where: revisionWhere(latest), data: { updatedAt: latest.updatedAt } });
        if (claim.count !== 1) throw new AppError("视频任务在提示词生成期间发生变化，请查看最新任务。", 409);
      }
      const created = await tx.dramaVideoPrompt.create({
        data: {
          projectId,
          episodeId: shot.storyboard.episodeId,
          shotId,
          provider: "",
          prompt: output.prompt,
          negativePrompt: output.negativePrompt ?? null,
          aspectRatio: output.aspectRatio || "9:16",
          durationSec: output.durationSec ?? shot.durationSec,
          status: "prompted",
          version,
        },
      });
      await tx.dramaVideoPrompt.updateMany({
        where: {
          projectId,
          shotId,
          id: { not: created.id },
          status: { not: "superseded" },
        },
        data: {
          status: "superseded",
          supersededById: created.id,
        },
      });
      return created;
    }, { isolationLevel: "Serializable" });
  }

  async createProviderTask(videoPromptId: string, provider?: string, options: { confirmResubmit?: boolean } = {}) {
    const videoPrompt = await prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
    if (!videoPrompt) {
      throw new AppError("未找到视频提示词。", 404);
    }
    if (videoPrompt.status === "superseded" || videoPrompt.supersededById) {
      throw new AppError("该视频提示词已有新版，请使用当前版本创建视频任务。", 409);
    }
    if (videoPrompt.status === "submitting") throw new AppError("视频任务正在提交，请等待提交结果后查询进度。", 409);
    if (videoPrompt.status === "submission_unknown" && !options.confirmResubmit) {
      throw new AppError("无法确认上次视频提交结果，请先到视频通道核对；确认重新提交可能再次计费。", 409);
    }
    if (SUCCESS_STATUSES.has(videoPrompt.status) || videoPrompt.resultUrl
      || videoPrompt.providerTaskId && (videoPrompt.status === "queued" || videoPrompt.status === "running")) return videoPrompt;
    const selectedProvider = provider?.trim() || (videoPrompt.provider !== "mock" ? videoPrompt.provider.trim() : "");
    if (!selectedProvider || (selectedProvider === "mock" && process.env.NODE_ENV !== "test")) {
      throw new AppError("请选择可用的视频生成通道后再提交。", 400);
    }
    const adapter = videoProviderRegistry.resolve(selectedProvider);
    // Validate ownership even when the selected provider cannot use reference images.
    const references = await collectShotReferenceImages(videoPrompt);
    const refImages = adapter.supportsRefImages ? references : [];
    const request: VideoGenerationRequest = {
      prompt: videoPrompt.prompt,
      negativePrompt: videoPrompt.negativePrompt,
      aspectRatio: videoPrompt.aspectRatio,
      durationSec: videoPrompt.durationSec,
    };
    if (refImages.length) {
      request.refImages = refImages;
    }
    const submissionId = randomUUID();
    const previousAttempt = videoPrompt.providerTaskId || videoPrompt.providerResult ? {
      provider: videoPrompt.provider, providerTaskId: videoPrompt.providerTaskId, status: videoPrompt.status,
      resultUrl: videoPrompt.resultUrl, providerResult: safeJsonParse<unknown>(videoPrompt.providerResult, videoPrompt.providerResult),
    } : undefined;
    const submission = { submissionId, startedAt: new Date().toISOString(), previousAttempt };
    const claimJson = JSON.stringify(submission);
    const claim = await prisma.dramaVideoPrompt.updateMany({
      where: revisionWhere(videoPrompt),
      data: {
        provider: selectedProvider, status: "submitting", providerTaskId: null, providerResult: claimJson, failureReason: null,
      },
    });
    if (claim.count !== 1) {
      const current = await prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
      if (current?.providerTaskId && !current.supersededById && (current.status === "queued" || current.status === "running" || SUCCESS_STATUSES.has(current.status))) return current;
      throw new AppError("视频任务状态有变化，请查看当前提交结果。", 409);
    }
    const claimedWhere = { id: videoPromptId, status: "submitting", provider: selectedProvider, providerResult: claimJson, supersededById: null };
    let result: VideoGenerationResult;
    try {
      result = await adapter.createTask(request);
      if (!result.providerTaskId?.trim()) throw new Error("视频通道未返回任务编号。");
    } catch {
      await prisma.dramaVideoPrompt.updateMany({ where: claimedWhere, data: {
        status: "submission_unknown",
        failureReason: "无法确认视频通道是否接受了上次提交，请核对后再决定是否重新提交。",
      } });
      throw new AppError("无法确认视频提交结果，请先到视频通道核对；重新提交可能再次计费。", 409);
    }
    const saved = await prisma.dramaVideoPrompt.updateMany({ where: claimedWhere, data: {
      providerTaskId: result.providerTaskId, status: result.status, resultUrl: result.resultUrl ?? videoPrompt.resultUrl,
      failureReason: result.failureReason ?? null, providerResult: JSON.stringify({ ...result, ...submission }),
    } });
    if (saved.count !== 1) throw new AppError("视频通道接收了任务，但本地状态有变化，请先查询任务，避免重复提交。", 409);
    return prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
  }

  async refreshProviderTask(videoPromptId: string) {
    const videoPrompt = await prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
    if (videoPrompt?.status === "submitting" || videoPrompt?.status === "submission_unknown") {
      throw new AppError("视频提交结果尚未确认，请先到视频通道核对上次提交结果，避免重复计费。", 409);
    }
    if (!videoPrompt?.providerTaskId) {
      throw new Error(`视频提示词尚未创建 provider 任务：${videoPromptId}`);
    }
    const adapter = videoProviderRegistry.resolve(videoPrompt.provider);
    const result = await adapter.getTask(videoPrompt.providerTaskId);
    if (result.providerTaskId !== videoPrompt.providerTaskId) throw new AppError("视频通道返回了其他任务的结果，请稍后重新查询。", 422);
    const completed = SUCCESS_STATUSES.has(videoPrompt.status);
    const status = videoPrompt.status === "superseded" || videoPrompt.supersededById ? "superseded"
      : completed ? videoPrompt.status
        : videoPrompt.status === "running" && result.status === "queued" ? "running" : result.status;
    const resultUrl = videoPrompt.resultUrl || result.resultUrl || null;
    await prisma.dramaVideoPrompt.updateMany({
      where: revisionWhere(videoPrompt),
      data: {
        status,
        resultUrl,
        failureReason: completed ? videoPrompt.failureReason : result.failureReason ?? null,
        providerResult: JSON.stringify({ ...safeJsonParse<Record<string, unknown>>(videoPrompt.providerResult, {}), ...result, status, resultUrl }),
      },
    });
    return prisma.dramaVideoPrompt.findUnique({ where: { id: videoPromptId } });
  }

  /** Run once before accepting traffic in the supported single-API deployment. Never resubmits upstream. */
  async recoverInterruptedSubmissions(): Promise<number> {
    const recovered = await prisma.dramaVideoPrompt.updateMany({ where: { status: "submitting" }, data: {
      status: "submission_unknown", failureReason: "视频提交因服务重启中断，请先核对视频通道是否接单；重新提交可能再次计费。",
    } });
    return recovered.count;
  }
}

export const dramaVideoPromptService = new DramaVideoPromptService();
