import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { SourceBundle } from "../adaptation/contracts/sourceBundle";
import { archivePlanningRecords, assertPlanningIdle, claimEpisodeRevision, planningFingerprint, readScriptConfig, resolveEpisodeSourceRange } from "./planning";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicPanelScriptPrompt } from "../../prompting/prompts/comic/comic.prompts";
import { adaptationSourceRegistry } from "../adaptation/source/SourceContentPort";
import { comicFactService } from "./ComicFactService";

export interface GeneratePanelScriptInput {
  targetPanelCount?: number;
  densityMode?: "relaxed" | "balanced" | "compact";
  scriptPromptInstruction?: string;
  /** 强制刷新 sourceText 快照（仅 novel_import 有效） */
  refreshSourceText?: boolean;
  replaceExisting?: boolean;
}

export class ComicPanelScriptService {
  async generatePanelScript(
    episodeId: string,
    input: GeneratePanelScriptInput = {},
    provider?: LLMProvider,
  ) {
    const episode = await prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: {
        panels: { orderBy: { order: "asc" } },
        project: {
          include: {
            characters: { orderBy: { createdAt: "asc" } },
            characterAssets: {
              orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
            },
            scenes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            sourceBundle: true,
            facts: { orderBy: { episodeOrder: "asc" } },
          },
        },
      },
    });
    if (!episode) throw new Error(`未找到漫画话数：${episodeId}`);
    if (!episode.outline) {
      throw new Error("请先生成分话大纲再生成分格脚本。");
    }

    const project = episode.project;
    if (episode.panels.length && !input.replaceExisting) {
      throw new AppError("本话已有分镜。请确认备份原稿并重新生成后继续。", 409);
    }
    await assertPlanningIdle(prisma, project.id, [episodeId]);
    const originalPanelsFingerprint = planningFingerprint(episode.panels);
    const previousConfig = readScriptConfig(episode.scriptConfig);

    // Resolve semantic source mapping before loading prose. Legacy episode order is never a chapter fallback.
    let sourceText = episode.sourceText ?? "";
    let sourceRange = previousConfig.sourceRange;
    if (project.sourceType === "novel_import") {
      if (!project.sourceRef || !project.sourceBundle) throw new AppError("请先导入源小说资料。", 400);
      const bundle = JSON.parse(project.sourceBundle.bundleJson) as SourceBundle;
      sourceRange = await resolveEpisodeSourceRange({ episode, projectTitle: project.title, bundle, provider });
      if (!sourceText || input.refreshSourceText || !previousConfig.sourceRange) {
        const adapter = adaptationSourceRegistry.resolve("novel_import");
        if (!adapter.loadChapterText) throw new AppError("小说正文读取服务不可用，请稍后重试。", 503);
        const range = sourceRange as { start: number; end: number };
        sourceText = await adapter.loadChapterText({ type: "novel_import", ref: project.sourceRef }, range.start, range.end);
        if (!sourceText.trim()) throw new AppError("本话对应的小说章节没有正文，请先完成小说章节。", 422);
      }
    } else if (!sourceText && project.sourceBundle) {
      sourceText = (JSON.parse(project.sourceBundle.bundleJson) as SourceBundle).rawText ?? "";
    }

    const stylePresetRaw = project.stylePreset
      ? (JSON.parse(project.stylePreset) as { style?: string; promptKeywords?: string; format?: string })
      : undefined;
    const stylePreset = stylePresetRaw?.style;
    const stylePromptKeywords = stylePresetRaw?.promptKeywords;
    const comicFormat = stylePresetRaw?.format;
    const densityMode = input.densityMode ?? "balanced";
    const targetPanelCount =
      input.targetPanelCount
      ?? (comicFormat === "4koma"
        ? densityMode === "relaxed" ? 10 : densityMode === "compact" ? 16 : 12
        : densityMode === "relaxed" ? 30 : densityMode === "compact" ? 65 : 45);

    // 取本话及之前的跨话事实
    const factDigest =
      project.facts
        .filter((f) => f.episodeOrder == null || f.episodeOrder < episode.order)
        .map((f) => `[${f.category}] ${f.text}`)
        .join("\n") || undefined;

    const result = await runStructuredPrompt({
      asset: comicPanelScriptPrompt,
      promptInput: {
        projectTitle: project.title,
        episodeOrder: episode.order,
        episodeTitle: episode.title ?? `第 ${episode.order} 话`,
        episodeSynopsis: episode.outline,
        sourceText: sourceText || undefined,
        characters: project.characters.map((c) => ({
          name: c.name,
          visualAnchor: c.visualAnchor,
        })),
        characterAssets: project.characterAssets
          .map((a) => {
            const charName = project.characters.find((c) => c.id === a.characterId)?.name;
            if (!charName) return null;
            return {
              characterName: charName,
              assetType: a.assetType,
              name: a.name,
              description: a.description ?? undefined,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null),
        existingScenes: project.scenes.map((s) => {
          let summary = "";
          try {
            const bible = s.bible ? (JSON.parse(s.bible) as { keyElements?: string }) : null;
            summary = bible?.keyElements ?? "";
          } catch { /* ignore */ }
          return { name: s.name, sceneType: s.sceneType, summary: summary || undefined };
        }),
        stylePreset,
        stylePromptKeywords,
        comicFormat,
        factDigest,
        densityMode,
        scriptPromptInstruction: input.scriptPromptInstruction,
        targetPanelCount,
      },
      options: { temperature: 0.55, provider },
    });

    const panels = result.output.panels;
    const scenes = result.output.scenes ?? [];
    const panelOrders = new Set(panels.map((panel) => panel.order));
    if (panels.length === 0 || panelOrders.size !== panels.length || panels.some((panel) => panel.order < 1 || panel.order > panels.length)) {
      throw new AppError("AI 返回的分镜顺序不完整，请重新生成。", 422);
    }
    const scriptConfig = {
      ...previousConfig,
      sourceRange,
      densityMode,
      targetPanelCount,
      comicFormat: comicFormat ?? "webtoon",
      stylePreset,
      stylePromptKeywords,
      scriptPromptInstruction: input.scriptPromptInstruction,
      promptAssetId: comicPanelScriptPrompt.id,
      promptAssetVersion: comicPanelScriptPrompt.version,
      provider,
      generatedAt: new Date().toISOString(),
    };

    // 已存在的场景名集合（跨话/用户编辑过的不覆盖）
    const existingSceneNames = new Set(project.scenes.map((s) => s.name));

    // 事务：upsert 场景（仅新增）+ 清空旧格子重建 + 更新话状态
    await prisma.$transaction(async (tx) => {
      await claimEpisodeRevision(tx, episode);
      await assertPlanningIdle(tx, project.id, [episodeId]);
      const currentPanels = await tx.comicPanel.findMany({ where: { episodeId }, orderBy: { order: "asc" } });
      if (planningFingerprint(currentPanels) !== originalPanelsFingerprint) {
        throw new AppError("分镜在生成期间发生变化，请查看最新内容后重试。", 409);
      }
      const latestProject = await tx.comicProject.findUnique({ where: { id: project.id }, include: { sourceBundle: true } });
      if (latestProject?.sourceBundle?.bundleJson !== project.sourceBundle?.bundleJson || latestProject?.stylePreset !== project.stylePreset) {
        throw new AppError("项目资料在分镜生成期间发生变化，请重试。", 409);
      }
      const currentFacts = await tx.comicFact.findMany({ where: { projectId: project.id, episodeOrder: episode.order } });
      if (episode.panels.length || currentFacts.length) {
        await archivePlanningRecords(tx, { projectId: project.id, reason: "script_replacement", episodes: [episode], facts: currentFacts });
      }
      // 仅创建尚不存在的场景草案，保留用户编辑过的 bible 与跨话场景
      const newScenes = scenes.filter((s) => !existingSceneNames.has(s.name));
      if (newScenes.length > 0) {
        await tx.comicScene.createMany({
          data: newScenes.map((s, i) => ({
            projectId: project.id,
            name: s.name,
            sceneType: s.sceneType,
            bible: JSON.stringify({
              palette: s.palette,
              keyElements: s.keyElements,
              materials: s.materials ?? "",
              ambiance: s.ambiance ?? "",
              layout: s.layout ?? "",
            }),
            sortOrder: project.scenes.length + i,
          })),
        });
      }

      if (episode.panels.length) await tx.comicPanel.deleteMany({ where: { episodeId } });
      if (currentFacts.length) await tx.comicFact.deleteMany({ where: { projectId: project.id, episodeOrder: episode.order } });
      await tx.comicPanel.createMany({
        data: panels.map((panel) => ({
          episodeId,
          order: panel.order,
          panelType: panel.panelType,
          densityLevel: panel.densityLevel,
          focus: panel.focus,
          action: panel.action,
          sceneRef: panel.sceneRef?.trim() || null,
          dialogues: panel.dialogues.length > 0 ? JSON.stringify(panel.dialogues) : null,
          characterRefs:
            panel.characterRefs.length > 0 ? JSON.stringify(panel.characterRefs) : null,
          visualPrompt: panel.visualPrompt,
          layoutData: panel.layoutData ? JSON.stringify(panel.layoutData) : null,
        })),
      });
      await tx.comicEpisode.update({
        where: { id: episodeId },
        data: { status: "scripted", sourceText: sourceText || null, scriptConfig: JSON.stringify(scriptConfig) },
      });
    }, { isolationLevel: "Serializable" });

    // The next episode sees facts from the committed script revision; extraction failure remains non-fatal.
    await comicFactService.extractAndSave(episodeId, provider);

    return prisma.comicEpisode.findUnique({
      where: { id: episodeId },
      include: { panels: { orderBy: { order: "asc" } } },
    });
  }

  async getPanels(episodeId: string) {
    return prisma.comicPanel.findMany({
      where: { episodeId },
      orderBy: { order: "asc" },
    });
  }

  async getPanel(panelId: string) {
    return prisma.comicPanel.findUnique({ where: { id: panelId } });
  }

  private async updatePanelContent(panelId: string, patch: { visualPrompt?: string; dialogues?: string }) {
    return prisma.$transaction(async (tx) => {
      const panel = await tx.comicPanel.findUnique({ where: { id: panelId } });
      if (!panel) throw new AppError("未找到漫画分镜。", 404);
      const episode = await tx.comicEpisode.findUnique({ where: { id: panel.episodeId }, include: { panels: { orderBy: { order: "asc" } } } });
      if (!episode) throw new AppError("未找到漫画分话。", 404);
      await claimEpisodeRevision(tx, episode);
      const facts = await tx.comicFact.findMany({ where: { projectId: episode.projectId, episodeOrder: episode.order } });
      if (facts.length) {
        // Manual edits invalidate the prior interpretation without triggering a paid model call.
        await archivePlanningRecords(tx, { projectId: episode.projectId, reason: "fact_replacement", episodes: [episode], facts });
        await tx.comicFact.deleteMany({ where: { projectId: episode.projectId, episodeOrder: episode.order } });
      }
      const result = await tx.comicPanel.updateMany({
        where: { id: panelId, visualPrompt: panel.visualPrompt, dialogues: panel.dialogues, imageData: panel.imageData, letteredData: panel.letteredData },
        data: { ...patch, imageData: null, letteredData: null },
      });
      if (result.count !== 1) throw new AppError("分镜在保存期间发生变化，请查看最新内容后重试。", 409);
      await tx.comicEpisode.update({ where: { id: panel.episodeId }, data: { updatedAt: new Date() } });
      return tx.comicPanel.findUnique({ where: { id: panelId } });
    }, { isolationLevel: "Serializable" });
  }

  async updatePanelVisualPrompt(panelId: string, visualPrompt: string) {
    return this.updatePanelContent(panelId, { visualPrompt });
  }

  async updatePanelDialogues(panelId: string, dialogues: unknown[]) {
    return this.updatePanelContent(panelId, { dialogues: JSON.stringify(dialogues) });
  }
}

export const comicPanelScriptService = new ComicPanelScriptService();
