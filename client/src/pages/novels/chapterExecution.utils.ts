import type { ReviewIssue } from "@ai-novel/shared/types/novel";

export interface ChapterExecutionStrategy {
  runMode: "fast" | "polish";
  wordSize: "short" | "medium" | "long";
  conflictLevel: number;
  pace: "slow" | "balanced" | "fast";
  aiFreedom: "low" | "medium" | "high";
}

export function resolveTargetWordCount(strategy: ChapterExecutionStrategy): number {
  if (strategy.wordSize === "short") {
    return 1500;
  }
  if (strategy.wordSize === "long") {
    return 3500;
  }
  return 2500;
}

export function buildRepairIssue(category: ReviewIssue["category"], fixSuggestion: string, evidence: string): ReviewIssue {
  return {
    severity: "medium",
    category,
    evidence,
    fixSuggestion,
  };
}

export type ChapterRepairPreset =
  | "expand"
  | "compress"
  | "strengthenConflict"
  | "enhanceEmotion"
  | "unifyStyle"
  | "addDialogue"
  | "addDescription";

export function buildChapterRepairIssue(action: ChapterRepairPreset): ReviewIssue {
  const presets: Record<ChapterRepairPreset, Pick<ReviewIssue, "category" | "fixSuggestion" | "evidence">> = {
    expand: {
      category: "engagement",
      fixSuggestion: "在不改动主线事件的前提下扩写场景细节和情绪反应，适度拉长文本。",
      evidence: "用户要求扩写章节",
    },
    compress: {
      category: "repetition",
      fixSuggestion: "压缩重复表达，保留关键事件与冲突节点，控制篇幅更紧凑。",
      evidence: "用户要求压缩章节",
    },
    strengthenConflict: {
      category: "pacing",
      fixSuggestion: "提升对抗密度，让冲突更早出现并持续施压。",
      evidence: "用户要求强化冲突",
    },
    enhanceEmotion: {
      category: "engagement",
      fixSuggestion: "增强角色情绪层次与张力，突出内外部情感变化。",
      evidence: "用户要求增强情绪",
    },
    unifyStyle: {
      category: "voice",
      fixSuggestion: "统一叙事语气与措辞，保持文风稳定。",
      evidence: "用户要求提升文风一致性",
    },
    addDialogue: {
      category: "voice",
      fixSuggestion: "增加推动情节的有效对话，减少空泛叙述。",
      evidence: "用户要求增加对话推进",
    },
    addDescription: {
      category: "engagement",
      fixSuggestion: "补充环境与动作描写，提升画面感与临场感。",
      evidence: "用户要求增加描写",
    },
  };
  const preset = presets[action];
  return buildRepairIssue(preset.category, preset.fixSuggestion, preset.evidence);
}
