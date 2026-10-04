import { useState } from "react";
import type { PipelineRepairMode, PipelineRunMode } from "@ai-novel/shared/types/novel";
import type { ChapterExecutionStrategy } from "../../chapterExecution.utils";
import type { BoundChapterReview } from "../../chapterProduction";
import { DEFAULT_ESTIMATED_CHAPTER_COUNT } from "../../novelBasicInfo.shared";

/** Workspace-local chapter production drafts; server task state remains in query projections. */
export function useChapterProductionState() {
  const [currentJobId, setCurrentJobId] = useState("");
  const [pipelineForm, setPipelineForm] = useState({
    startOrder: 1, endOrder: DEFAULT_ESTIMATED_CHAPTER_COUNT, maxRetries: 1,
    runMode: "fast" as PipelineRunMode, autoReview: true, autoRepair: true,
    skipCompleted: true, qualityThreshold: 75, repairMode: "light_repair" as PipelineRepairMode,
  });
  const [storedReview, setReviewResult] = useState<BoundChapterReview | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [chapterOperationMessage, setChapterOperationMessage] = useState("");
  const [chapterStrategy, setChapterStrategy] = useState<ChapterExecutionStrategy>({ runMode: "fast", wordSize: "medium", conflictLevel: 60, pace: "balanced", aiFreedom: "medium" });
  const [activeChapterStream, setActiveChapterStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [activeRepairStream, setActiveRepairStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [repairBeforeContent, setRepairBeforeContent] = useState("");
  const [repairAfterContent, setRepairAfterContent] = useState("");
  return {
    currentJobId, setCurrentJobId, pipelineForm, setPipelineForm, storedReview, setReviewResult,
    pipelineMessage, setPipelineMessage, chapterOperationMessage, setChapterOperationMessage,
    chapterStrategy, setChapterStrategy, activeChapterStream, setActiveChapterStream,
    activeRepairStream, setActiveRepairStream, repairBeforeContent, setRepairBeforeContent,
    repairAfterContent, setRepairAfterContent,
  };
}
