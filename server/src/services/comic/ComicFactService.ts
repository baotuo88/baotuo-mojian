import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { archivePlanningRecords, planningFingerprint } from "./planning";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicFactExtractionPrompt } from "../../prompting/prompts/comic/comic.prompts";

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComicFactService {
  /**
   * 从当前分镜版本提取跨话事实；过期结果不会写入，失败不影响已保存的分镜。
   */
  async extractAndSave(episodeId: string, provider?: LLMProvider): Promise<void> {
    try {
      const episode = await prisma.comicEpisode.findUnique({
        where: { id: episodeId },
        include: {
          panels: { orderBy: { order: "asc" } },
          project: {
            include: { facts: { orderBy: { episodeOrder: "asc" } } },
          },
        },
      });
      if (!episode || episode.panels.length === 0) return;

      const scriptFingerprint = (panels: typeof episode.panels) =>
        planningFingerprint(
          panels.map((p) => ({
            id: p.id,
            order: p.order,
            action: p.action,
            dialogues: p.dialogues,
            characterRefs: p.characterRefs,
            visualPrompt: p.visualPrompt,
          })),
        );
      const sourceFingerprint = scriptFingerprint(episode.panels);
      // Keep every panel's event so the ending cannot disappear from continuity facts.
      const panelSummary = episode.panels
        .map((p) => {
          let line = `格${p.order}[${p.panelType}]: ${p.action}`;
          if (p.visualPrompt) line += `\n画面：${p.visualPrompt}`;
          if (p.dialogues) {
            try {
              const dialogues = JSON.parse(p.dialogues) as Array<{
                speaker?: string;
                text?: string;
              }>;
              if (Array.isArray(dialogues)) {
                const spoken = dialogues
                  .filter((dialogue) => typeof dialogue?.text === "string")
                  .map((dialogue) => `${dialogue.speaker ?? "未标注说话者"}：${dialogue.text}`)
                  .join("\n");
                if (spoken) line += `\n对白：\n${spoken}`;
              }
            } catch {
              /* Invalid legacy dialogue cannot replace valid action and visual evidence. */
            }
          }
          if (p.characterRefs) {
            try {
              const refs = JSON.parse(p.characterRefs) as Array<
                { name?: string; costume?: string; expression?: string } | string
              >;
              const names = refs
                .map((r) => (typeof r === "string" ? r : r.name))
                .filter(Boolean)
                .join("、");
              if (names) line += ` (${names})`;
            } catch {
              /* ignore */
            }
          }
          return line;
        })
        .join("\n");

      const existingFacts = episode.project.facts
        .filter((f) => f.episodeOrder == null || f.episodeOrder < episode.order)
        .map((f) => `[${f.category}] ${f.text}`)
        .join("\n");

      const result = await runStructuredPrompt({
        asset: comicFactExtractionPrompt,
        promptInput: {
          projectTitle: episode.project.title,
          episodeOrder: episode.order,
          episodeTitle: episode.title ?? `第 ${episode.order} 话`,
          panelSummary,
          existingFacts,
        },
        options: { temperature: 0.3, provider },
      });

      const newFacts = result.output.facts;
      const persisted = await prisma.$transaction(
        async (tx) => {
          const current = await tx.comicEpisode.findUnique({
            where: { id: episodeId },
            include: { panels: { orderBy: { order: "asc" } } },
          });
          if (
            !current ||
            current.scriptConfig !== episode.scriptConfig ||
            scriptFingerprint(current.panels) !== sourceFingerprint
          )
            return false;
          const claim = await tx.comicEpisode.updateMany({
            where: {
              id: episodeId,
              updatedAt: current.updatedAt,
              scriptConfig: episode.scriptConfig,
            },
            data: { updatedAt: current.updatedAt },
          });
          if (claim.count !== 1) return false;
          const lockedPanels = await tx.comicPanel.findMany({
            where: { episodeId },
            orderBy: { order: "asc" },
          });
          if (scriptFingerprint(lockedPanels) !== sourceFingerprint) return false;
          const previous = await tx.comicFact.findMany({
            where: { projectId: episode.projectId, episodeOrder: episode.order },
          });
          if (previous.length) {
            await archivePlanningRecords(tx, {
              projectId: episode.projectId,
              reason: "fact_replacement",
              episodes: [current],
              facts: previous,
            });
            await tx.comicFact.deleteMany({
              where: { projectId: episode.projectId, episodeOrder: episode.order },
            });
          }
          if (newFacts.length)
            await tx.comicFact.createMany({
              data: newFacts.map((f) => ({
                projectId: episode.projectId,
                episodeOrder: episode.order,
                text: f.text,
                category: f.category,
              })),
            });
          return true;
        },
        { isolationLevel: "Serializable" },
      );

      if (persisted)
        console.log(
          `[comic.fact] extracted ${newFacts.length} facts for episode=${episodeId} order=${episode.order}`,
        );
    } catch (err) {
      // 事实提取失败不影响主流程
      console.warn(`[comic.fact] extraction failed for episode=${episodeId}:`, err);
    }
  }

  async listFacts(projectId: string) {
    return prisma.comicFact.findMany({
      where: { projectId },
      orderBy: [{ episodeOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async deleteFact(factId: string) {
    return prisma.comicFact.delete({ where: { id: factId } });
  }
}

export const comicFactService = new ComicFactService();
