import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  dramaEpisodeFactsOutputSchema,
  dramaEpisodeFactsPrompt,
} from "../../../prompting/prompts/drama/drama-facts.prompt";
import type { DramaLLMOptions } from "../DramaStrategyService";
import { lockEpisodeRevision, revisionConflict } from "./episodeLock";

// Coalesce concurrent next-episode actions within the single supported API instance.
// The persistent pending state survives restart; no failure is cached as an empty ledger.
const inFlight = new Map<string, Promise<void>>();

async function extractPendingEpisodeFacts(
  episode: { id: string; revision: number },
  options: DramaLLMOptions,
): Promise<void> {
  const current = await prisma.dramaEpisode.findUnique({ where: { id: episode.id } });
  if (!current || current.revision !== episode.revision) throw revisionConflict();
  if (current.factsStatus !== "pending" || !current.content?.trim()) return;

  let output;
  try {
    const result = await runStructuredPrompt({
      asset: dramaEpisodeFactsPrompt,
      promptInput: { episodeOrder: current.order, title: current.title, content: current.content },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.1,
      },
    });
    // Keep the ledger contract explicit even for alternative runner adapters.
    output = dramaEpisodeFactsOutputSchema.parse(result.output);
  } catch (error) {
    console.error(`[drama-facts] E${current.order} fact extraction failed`, error);
    throw new AppError(
      `第 ${current.order} 集台本事实整理失败，请重试后继续创作。台本和已有事实记录会保留。`,
      502,
    );
  }

  await prisma.$transaction(async (tx) => {
    const locked = await lockEpisodeRevision(tx, current.id, current.revision);
    if (locked.factsStatus !== "pending") return;
    const claimed = await tx.dramaEpisode.updateMany({
      where: { id: current.id, revision: current.revision, factsStatus: "pending" },
      data: { factsStatus: "ready" },
    });
    if (!claimed.count) throw revisionConflict();
    await tx.dramaFact.updateMany({
      where: {
        projectId: current.projectId,
        episodeOrder: current.order,
        source: { in: ["script", "repair", "manual"] },
      },
      data: { stale: true },
    });
    if (output.facts.length) {
      await tx.dramaFact.createMany({
        data: output.facts.map((fact) => ({
          ...fact,
          projectId: current.projectId,
          episodeOrder: current.order,
          source: "manual",
          sourceRevision: current.revision,
        })),
      });
    }
  });
}

export async function ensurePendingDramaFacts(
  projectId: string,
  beforeOrder: number,
  options: DramaLLMOptions = {},
): Promise<void> {
  const pending = await prisma.dramaEpisode.findMany({
    where: { projectId, order: { lt: beforeOrder }, factsStatus: "pending" },
    orderBy: { order: "asc" },
    select: { id: true, revision: true, content: true },
  });
  for (const episode of pending) {
    if (!episode.content?.trim()) continue;
    const key = `${episode.id}:${episode.revision}`;
    let task = inFlight.get(key);
    if (!task) {
      task = extractPendingEpisodeFacts(episode, options);
      inFlight.set(key, task);
    }
    try {
      await task;
    } finally {
      if (inFlight.get(key) === task) inFlight.delete(key);
    }
  }
}
