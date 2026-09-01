import type { Dispatch, SetStateAction } from "react";
import { useSSE } from "@/hooks/useSSE";

type ChapterStreamTarget = { chapterId: string; chapterLabel: string };

interface UseNovelEditStreamsOptions {
  invalidateNovelDetail: () => Promise<unknown>;
  setChapterOperationMessage: Dispatch<SetStateAction<string>>;
  setRepairAfterContent: Dispatch<SetStateAction<string>>;
  setActiveChapterStream: Dispatch<SetStateAction<ChapterStreamTarget | null>>;
  setActiveRepairStream: Dispatch<SetStateAction<ChapterStreamTarget | null>>;
}

export function useNovelEditStreams(options: UseNovelEditStreamsOptions) {
  const chapterSSE = useSSE({
    onRunStatus: (payload) => {
      if ((payload.phase === "finalizing" || payload.phase === "completed") && payload.message) {
        options.setChapterOperationMessage(payload.message);
      }
    },
    onDone: async () => {
      await options.invalidateNovelDetail();
      options.setActiveChapterStream(null);
    },
  });
  const invalidateAfterStream = async () => {
    await options.invalidateNovelDetail();
  };
  const bibleSSE = useSSE({ onDone: invalidateAfterStream });
  const beatsSSE = useSSE({ onDone: invalidateAfterStream });
  const repairSSE = useSSE({
    onRunStatus: (payload) => {
      if ((payload.phase === "finalizing" || payload.phase === "completed") && payload.message) {
        options.setChapterOperationMessage(payload.message);
      }
    },
    onDone: async (fullContent) => {
      options.setRepairAfterContent(fullContent);
      await options.invalidateNovelDetail();
      options.setActiveRepairStream(null);
    },
  });

  return { chapterSSE, bibleSSE, beatsSSE, repairSSE };
}
