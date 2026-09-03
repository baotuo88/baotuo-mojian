import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  volumeOutcomeSummaryPrompt,
  type VolumeOutcomeSummaryPromptInput,
} from "../../../prompting/prompts/novel/volume/volumeOutcomeSummary.prompts";

interface VolumeOutcomeSummaryResult {
  narrativeProgress: string;
  characterStateChanges: string[];
  unresolvedThreads: string[];
  irreversibleFacts: string[];
  continuityMusts: string[];
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * 卷末结果摘要服务
 *
 * 在一卷内容完成后，收集该卷「实际发生了什么」（章节摘要、时间线事件、开放钩子、
 * 已完成的不可逆事实），经 LLM 压缩为滚动摘要，写入 VolumePlan.completedSummaryJson。
 * 后续卷的写章上下文据此承接前卷，避免超长篇写作遗忘前卷剧情、重复已发生事件、
 * 或遗漏未解线索。
 *
 * 读取方：GenerationContextAssembler（注入 volumeWindow.previousVolumeOutcome）
 */
export class VolumeOutcomeSummaryService {
  /** 在途去重：同一卷并发生成时复用同一 Promise，避免重复调用 LLM。 */
  private inFlight = new Map<string, Promise<string>>();

  async summarizeVolume(
    novelId: string,
    volumeId: string,
    options?: { force?: boolean },
  ): Promise<string> {
    if (!options?.force) {
      const existing = await prisma.volumePlan.findUnique({
        where: { id: volumeId },
        select: { completedSummaryJson: true },
      });
      if (existing?.completedSummaryJson) {
        return existing.completedSummaryJson;
      }
    }
    const running = this.inFlight.get(volumeId);
    if (running) {
      return running;
    }
    const promise = this.generateAndStore(novelId, volumeId).finally(() => {
      this.inFlight.delete(volumeId);
    });
    this.inFlight.set(volumeId, promise);
    return promise;
  }

  /** 读取指定卷之前、已生成结果摘要的卷，用于写章上下文的滚动承接。 */
  async listPriorVolumeSummaries(
    novelId: string,
    beforeSortOrder: number,
    limit = 3,
  ): Promise<string[]> {
    const rows = await prisma.volumePlan.findMany({
      where: {
        novelId,
        sortOrder: { lt: beforeSortOrder },
        completedSummaryJson: { not: null },
      },
      orderBy: { sortOrder: "desc" },
      take: limit,
      select: { completedSummaryJson: true },
    });
    return rows
      .map((row) => row.completedSummaryJson)
      .filter((value): value is string => Boolean(value?.trim()))
      .reverse();
  }

  private async generateAndStore(novelId: string, volumeId: string): Promise<string> {
    const volume = await prisma.volumePlan.findUnique({
      where: { id: volumeId },
      select: {
        id: true,
        novelId: true,
        title: true,
        summary: true,
        mainPromise: true,
        completedSummaryJson: true,
      },
    });
    if (volume?.completedSummaryJson) {
      return volume.completedSummaryJson;
    }
    // 卷在仓库查询中已被删除或无归属，不生成。
    if (!volume || volume.novelId !== novelId) {
      return "";
    }

    const chapterPlans = await prisma.volumeChapterPlan.findMany({
      where: { volumeId },
      orderBy: { chapterOrder: "asc" },
      select: { chapterOrder: true, title: true, summary: true },
    });
    const chapterOrders = chapterPlans.map((chapter) => chapter.chapterOrder);
    const minOrder = chapterOrders.length > 0 ? Math.min(...chapterOrders) : 0;
    const maxOrder = chapterOrders.length > 0 ? Math.max(...chapterOrders) : 0;

    const [novelTitleRow, events, hooks, facts] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: { title: true },
      }),
      prisma.storyTimelineEvent.findMany({
        where: {
          novelId,
          chapterIndex: { gte: minOrder, lte: maxOrder },
          status: { in: ["occurred", "resolved", "foreshadowed"] },
        },
        orderBy: { eventOrder: "asc" },
        select: { title: true, summary: true },
      }),
      prisma.timelineHook.findMany({
        where: {
          novelId,
          status: "open",
          createdInChapterIndex: { lte: maxOrder },
        },
        orderBy: { createdInChapterIndex: "asc" },
        select: { title: true, description: true },
      }),
      prisma.novelFactEntry.findMany({
        where: {
          novelId,
          chapterOrder: { gte: minOrder, lte: maxOrder },
          category: { in: ["completed", "revealed"] },
        },
        orderBy: { chapterOrder: "asc" },
        select: { chapterOrder: true, text: true },
      }),
    ]);

    const input: VolumeOutcomeSummaryPromptInput = {
      novelTitle: compactText(novelTitleRow?.title),
      volumeTitle: compactText(volume.title),
      volumeMission: compactText(volume.mainPromise || volume.summary),
      chapterDigest: chapterPlans.map((chapter) =>
        `第${chapter.chapterOrder}章 ${compactText(chapter.title)}：${compactText(chapter.summary)}`,
      ),
      keyTimelineEvents: events.map((event) => `${compactText(event.title)}——${compactText(event.summary)}`),
      openHooks: hooks.map((hook) => `${compactText(hook.title)}：${compactText(hook.description)}`),
      completedFacts: facts.map((fact) => `第${fact.chapterOrder}章：${compactText(fact.text)}`),
      characterStateNotes: [],
    };
    if (input.chapterDigest.length === 0 && input.keyTimelineEvents.length === 0 && input.completedFacts.length === 0) {
      return "";
    }

    const generated = await runStructuredPrompt<VolumeOutcomeSummaryPromptInput, VolumeOutcomeSummaryResult>({
      asset: volumeOutcomeSummaryPrompt,
      promptInput: input,
      options: {
        temperature: 0.3,
        maxTokens: 1200,
        novelId,
        volumeId,
        stage: "volume_outcome_summary",
        itemKey: `volume_outcome_summary:${volumeId}`,
        entrypoint: "volume-outcome-summary",
      },
    });

    const summaryJson = JSON.stringify(generated.output);
    await prisma.volumePlan.update({
      where: { id: volumeId },
      data: { completedSummaryJson: summaryJson },
    });
    return summaryJson;
  }
}

export const volumeOutcomeSummaryService = new VolumeOutcomeSummaryService();