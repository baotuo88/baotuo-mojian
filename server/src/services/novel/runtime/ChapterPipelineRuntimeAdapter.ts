import { prisma } from "../../../db/prisma";
import { ExecutionStoppedError, runWithExecutionScope } from "../../../platform/execution";
import { mergeChapterPatchForGenerationStateBump } from "../chapterLifecycleState";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import {
  runPipelineChapterWithRuntime,
  type PipelineRuntimeHooks,
  type PipelineRuntimeInput,
  type PipelineRuntimeResult,
} from "./chapterRuntimePipeline";
import {
  isChapterEmptyContentError,
} from "./chapterEmptyContentError";
import type { ChapterContentFinalizationService } from "./ChapterContentFinalizationService";
import type { ChapterStreamGenerationOrchestrator } from "./ChapterStreamGenerationOrchestrator";

export interface ChapterPipelineRuntimeAdapterDeps {
  streamOrchestrator: Pick<
    ChapterStreamGenerationOrchestrator,
    "prepareRuntimeChapter" | "generateDraftFromWriter" | "markChapterStatus"
  >;
  artifactSyncService: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts" | "syncChapterArtifacts">;
  contentFinalizationService: Pick<ChapterContentFinalizationService, "finalizeChapterContent">;
  ensureNovelCharacters: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
}

export class ChapterPipelineRuntimeAdapter {
  private readonly deps: ChapterPipelineRuntimeAdapterDeps;

  constructor(deps: ChapterPipelineRuntimeAdapterDeps) {
    this.deps = deps;
  }

  async runPipelineChapter(
    novelId: string,
    chapterId: string,
    options: PipelineRuntimeInput = {},
    hooks: PipelineRuntimeHooks = {},
  ): Promise<PipelineRuntimeResult> {
    const { request, assembled } = await this.deps.streamOrchestrator.prepareRuntimeChapter(novelId, chapterId, options);
    const source = { novelId, content: assembled.chapter.content };
    await this.deps.streamOrchestrator.markChapterStatus(chapterId, "generating", source);
    try {
      return await runPipelineChapterWithRuntime(
        {
          validateRequest: () => request,
          ensureNovelCharacters: this.deps.ensureNovelCharacters,
          assemble: async () => assembled,
          generateDraftFromWriter: (input) => this.deps.streamOrchestrator.generateDraftFromWriter(input),
          saveDraftAndArtifacts: (targetNovelId, targetChapterId, content, generationState, saveOptions) =>
            this.deps.artifactSyncService.saveDraftAndArtifacts(
              targetNovelId,
              targetChapterId,
              content,
              generationState,
              saveOptions,
            ),
          syncFinalChapterArtifacts: (targetNovelId, targetChapterId, content, syncOptions) =>
            this.deps.artifactSyncService.syncChapterArtifacts(
              targetNovelId,
              targetChapterId,
              content,
              {
                scheduleBackgroundSync: true,
                artifactSyncMode: syncOptions?.artifactSyncMode ?? options.artifactSyncMode,
                contentProvenance: syncOptions?.contentProvenance,
                awaitArtifactDelta: true,
                skipLegacySummaryAndFacts: true,
                provider: request.provider,
                model: request.model,
              },
            ),
          finalizeChapterContent: async (input) => {
            const finalized = await this.deps.contentFinalizationService.finalizeChapterContent({
              ...input,
              deferArtifactBackgroundSync: true,
              scheduleDeferredArtifactBackgroundSync: false,
            });
            return {
              finalContent: finalized.finalContent,
              runtimePackage: finalized.runtimePackage,
            };
          },
          markChapterGenerationState: (targetChapterId, generationState, content) =>
            this.markChapterGenerationState(novelId, targetChapterId, generationState, content),
          markChapterNeedsRepair: (targetChapterId, content) =>
            this.deps.streamOrchestrator.markChapterStatus(targetChapterId, "needs_repair", { novelId, content }),
        },
        novelId,
        chapterId,
        options,
        hooks,
      );
    } catch (error) {
      if (isChapterEmptyContentError(error)) {
        await this.deps.streamOrchestrator.markChapterStatus(chapterId, "pending_generation", source);
      }
      throw error;
    }
  }

  private async markChapterGenerationState(
    novelId: string,
    chapterId: string,
    generationState: "reviewed" | "approved",
    content: string,
  ): Promise<void> {
    await runWithExecutionScope({ fence: { kind: "chapter_content", novelId, chapterId, content } }, async () => {
      const result = await prisma.chapter.updateMany({
        where: { id: chapterId, novelId, content },
        data: mergeChapterPatchForGenerationStateBump({}, generationState),
      });
      if (result.count !== 1) throw new ExecutionStoppedError("章节正文发生了变化，旧稿审校状态未应用。");
    });
  }
}
