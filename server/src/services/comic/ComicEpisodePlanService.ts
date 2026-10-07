/**
 * 漫画分话规划服务
 *
 * 复用 drama 已验证的 rhythmEngine + paywallPlanPolicy，
 * 生成每话大纲（hookType / cliffhanger / 卡点）并落库 ComicEpisode。
 */
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { SourceBundle } from "../adaptation/contracts/sourceBundle";
import {
  archivePlanningRecords,
  assertPlanningIdle,
  claimEpisodeRevision,
  planningFingerprint,
  readScriptConfig,
  sourceBeatsDigest,
  validateSourceRange,
} from "./planning";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicEpisodeOutlinePrompt } from "../../prompting/prompts/comic/comic.prompts";
// rhythmEngine 是纯领域知识（零外部依赖），可直接 import
import { rhythmEngine, type TrackId } from "../drama/engine/rhythmEngine";
import {
  describeDramaPaywallPlan,
  resolveDramaPaywallPlan,
} from "../drama/engine/paywallPlanPolicy";

export interface GenerateComicOutlineInput {
  startOrder?: number;
  count?: number;
  replaceExisting?: boolean;
}

export class ComicEpisodePlanService {
  async generateOutline(
    projectId: string,
    input: GenerateComicOutlineInput = {},
    provider?: LLMProvider,
  ) {
    const project = await prisma.comicProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true },
    });
    if (!project) throw new Error(`未找到漫画项目：${projectId}`);
    if (!project.sourceBundle) {
      throw new Error("请先导入内容源（importSourceBundle）再生成分话大纲。");
    }

    const bundle = JSON.parse(project.sourceBundle.bundleJson) as SourceBundle;
    const synopsis: string = bundle.synopsis ?? "";
    const beats: Array<{ order: number; summary: string }> = bundle.beats ?? [];

    const trackId = project.trackId as TrackId | undefined;
    const track = trackId ? rhythmEngine.getTrack(trackId) : null;

    // 目标集数：参考节拍数折算，默认 20 话
    const targetEpisodes = Math.max(10, Math.min(100, Math.ceil(beats.length / 3)));

    const startOrder = Math.max(1, input.startOrder ?? 1);
    const count = Math.min(40, Math.max(1, input.count ?? 12));
    const endOrder = startOrder + count - 1;
    const previousEpisodes = await prisma.comicEpisode.findMany({
      where: { projectId, order: { gte: startOrder, lte: endOrder } },
      orderBy: { order: "asc" },
      include: { panels: { orderBy: { order: "asc" } } },
    });
    if (previousEpisodes.length && !input.replaceExisting) {
      throw new AppError("这些分话已有内容。请确认备份并重新规划后继续。", 409);
    }
    await assertPlanningIdle(
      prisma,
      projectId,
      previousEpisodes.map((ep) => ep.id),
    );

    // Existing story decisions constrain continuations and replacements alike.
    // Exclude only the range being replanned; keep future boundaries to prevent contradictions.
    const readContinuity = async (db: Pick<typeof prisma, "comicEpisode">) => {
      const rows = await db.comicEpisode.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          outline: true,
          cliffhanger: true,
          scriptConfig: true,
        },
      });
      return rows
        .filter((row) => row.order < startOrder || row.order > endOrder)
        .map((row) => ({
          id: row.id,
          order: row.order,
          title: row.title,
          outline: row.outline,
          cliffhanger: row.cliffhanger,
          sourceRange: readScriptConfig(row.scriptConfig).sourceRange,
        }));
    };
    const continuity = await readContinuity(prisma);

    const beatsDigest = sourceBeatsDigest(bundle) || "（无结构化节拍，按梗概分话）";

    // 付费卡点（有赛道策略时才计算）
    const paywallOrders: number[] = [];
    if (track) {
      const paywallPlan = resolveDramaPaywallPlan(
        JSON.stringify({ paywallDensity: "medium" }),
        targetEpisodes,
      );
      for (let order = startOrder; order <= endOrder; order += 1) {
        if (rhythmEngine.isPaywallEpisode(order, targetEpisodes, paywallPlan)) {
          paywallOrders.push(order);
        }
      }
    }

    const hookLibrary = rhythmEngine
      .listHooks()
      .map((hook) => `${hook.id}：${hook.label} — ${hook.description}`)
      .join("\n");

    const result = await runStructuredPrompt({
      asset: comicEpisodeOutlinePrompt,
      promptInput: {
        title: project.title,
        synopsis,
        beatsDigest,
        startOrder,
        endOrder,
        paywallOrders,
        hookLibrary,
        existingEpisodes: continuity,
        requireSourceRange: project.sourceType === "novel_import",
        stylePreset: project.stylePreset ? JSON.parse(project.stylePreset).style : undefined,
      },
      options: { temperature: 0.6, provider },
    });

    const episodes = result.output.episodes;
    const orders = new Set(episodes.map((ep) => ep.order));
    if (
      orders.size !== count ||
      episodes.length !== count ||
      episodes.some((ep) => ep.order < startOrder || ep.order > endOrder)
    ) {
      throw new AppError("AI 返回的分话数量或话序与请求不一致，请重新生成。", 422);
    }
    const ranges = new Map(
      episodes.map((ep) => [
        ep.order,
        project.sourceType === "novel_import"
          ? validateSourceRange({ start: ep.sourceChapterStart, end: ep.sourceChapterEnd }, bundle)
          : undefined,
      ]),
    );

    // 事务：落库 ComicEpisode（幂等，order 已存在则更新）
    await prisma.$transaction(
      async (tx) => {
        for (const previous of [...previousEpisodes].sort((a, b) => a.id.localeCompare(b.id)))
          await claimEpisodeRevision(tx, previous);
        await assertPlanningIdle(
          tx,
          projectId,
          previousEpisodes.map((ep) => ep.id),
        );
        const latestSource = await tx.comicProject.findUnique({
          where: { id: projectId },
          include: { sourceBundle: true },
        });
        if (latestSource?.sourceBundle?.bundleJson !== project.sourceBundle!.bundleJson) {
          throw new AppError("源小说资料在规划期间发生变化，请重试。", 409);
        }
        const currentEpisodes = await tx.comicEpisode.findMany({
          where: { projectId, order: { gte: startOrder, lte: endOrder } },
          orderBy: { order: "asc" },
          include: { panels: { orderBy: { order: "asc" } } },
        });
        if (planningFingerprint(currentEpisodes) !== planningFingerprint(previousEpisodes)) {
          throw new AppError("分话内容在规划期间发生变化，请查看最新内容后重试。", 409);
        }
        if (planningFingerprint(await readContinuity(tx)) !== planningFingerprint(continuity)) {
          throw new AppError("相邻分话情节在规划期间发生变化，请查看最新大纲后重试。", 409);
        }
        if (previousEpisodes.length) {
          const facts = await tx.comicFact.findMany({
            where: { projectId, episodeOrder: { gte: startOrder, lte: endOrder } },
          });
          await archivePlanningRecords(tx, {
            projectId,
            reason: "outline_replacement",
            episodes: previousEpisodes,
            facts,
          });
          await tx.comicPanel.deleteMany({
            where: { episodeId: { in: previousEpisodes.map((ep) => ep.id) } },
          });
          await tx.comicFact.deleteMany({
            where: { projectId, episodeOrder: { gte: startOrder, lte: endOrder } },
          });
        }
        for (const ep of episodes) {
          const scriptConfig = JSON.stringify({ sourceRange: ranges.get(ep.order) });
          await tx.comicEpisode.upsert({
            where: { projectId_order: { projectId, order: ep.order } },
            create: {
              projectId,
              order: ep.order,
              title: ep.title,
              outline: ep.synopsis,
              hookType: ep.hookType ?? null,
              cliffhanger: ep.cliffhanger ?? null,
              isPaywalled: ep.isPaywalled,
              status: "draft",
              scriptConfig,
            },
            update: {
              status: "draft",
              sourceText: null,
              scriptConfig,
              title: ep.title,
              outline: ep.synopsis,
              hookType: ep.hookType ?? null,
              cliffhanger: ep.cliffhanger ?? null,
              isPaywalled: ep.isPaywalled,
            },
          });
        }
        await tx.comicProject.update({
          where: { id: projectId },
          data: { status: "outlined" },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return prisma.comicEpisode.findMany({
      where: { projectId, order: { gte: startOrder, lte: endOrder } },
      orderBy: { order: "asc" },
    });
  }

  async listEpisodes(projectId: string) {
    return prisma.comicEpisode.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: { _count: { select: { panels: true } } },
    });
  }

  async getEpisode(episodeId: string) {
    return prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: { panels: { orderBy: { order: "asc" } } },
    });
  }

  async updateEpisodeSourceText(episodeId: string, sourceText: string) {
    return prisma.comicEpisode.update({
      where: { id: episodeId },
      data: { sourceText },
    });
  }

  async updateEpisode(
    episodeId: string,
    patch: { title?: string; outline?: string; cliffhanger?: string; isPaywalled?: boolean },
  ) {
    const data: Record<string, unknown> = {};
    if (patch.title !== undefined) data.title = patch.title.trim() || null;
    if (patch.outline !== undefined) data.outline = patch.outline.trim() || null;
    if (patch.cliffhanger !== undefined) data.cliffhanger = patch.cliffhanger.trim() || null;
    if (patch.isPaywalled !== undefined) data.isPaywalled = patch.isPaywalled;
    return prisma.comicEpisode.update({
      where: { id: episodeId },
      data,
      include: { _count: { select: { panels: true } } },
    });
  }
}
