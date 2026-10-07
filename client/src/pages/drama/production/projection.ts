import type {
  DramaBatchJob,
  DramaBatchJobType,
  DramaBatchProgress,
  DramaEpisode,
  DramaProjectDetail,
  DramaVideoPrompt,
} from "@/api/drama";

export function parseBatchProgress(raw?: string | null): DramaBatchProgress {
  const fallback: DramaBatchProgress = { total: 0, done: 0, failed: 0, failedShotIds: [] };
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...fallback, ...parsed }
      : fallback;
  } catch {
    return fallback;
  }
}

export function isActiveBatch(job?: DramaBatchJob): boolean {
  return job?.status === "pending" || job?.status === "running";
}

export function isRecoverableBatch(job?: DramaBatchJob): boolean {
  return job?.status === "paused" || job?.status === "failed";
}

export function latestBatchJobs(jobs: DramaBatchJob[] = []): DramaBatchJob[] {
  const sorted = [...jobs].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
  const keys = new Set<string>();
  return sorted.filter((job) => {
    const key = `${job.episodeId}:${job.type}`;
    if (keys.has(key)) return isActiveBatch(job) || isRecoverableBatch(job);
    keys.add(key);
    return true;
  });
}

export function latestEpisodeBatch(
  jobs: DramaBatchJob[] | undefined,
  episodeId: string,
  type: DramaBatchJobType,
): DramaBatchJob | undefined {
  return latestBatchJobs(jobs).find((job) => job.episodeId === episodeId && job.type === type);
}

/** A storyboard is current only while its source script revision is still current. */
export function currentStoryboard(episode?: DramaEpisode) {
  if (!episode || !Number.isInteger(episode.revision)) return undefined;
  return [...(episode.storyboards ?? [])]
    .sort((a, b) => b.version - a.version)
    .find(
      (board) =>
        board.sourceRevision === episode.revision &&
        !["stale", "superseded"].includes(board.status),
    );
}

export function isBatchStoryboardCurrent(job: DramaBatchJob, episode?: DramaEpisode): boolean {
  const storyboardId = parseBatchProgress(job.progress).storyboardId;
  const board = currentStoryboard(episode);
  return Boolean(board && (!storyboardId || board.id === storyboardId));
}

export function hasEpisodeProduction(
  jobs: DramaBatchJob[] | undefined,
  episode: DramaEpisode,
  type?: DramaBatchJobType,
): boolean {
  return latestBatchJobs(jobs).some(
    (job) =>
      job.episodeId === episode.id &&
      (!type || job.type === type) &&
      (isActiveBatch(job) || (isRecoverableBatch(job) && isBatchStoryboardCurrent(job, episode))),
  );
}

/** Only the current storyboard and latest non-superseded prompt belong to active production. */
export function currentVideoPrompts(project: DramaProjectDetail): DramaVideoPrompt[] {
  const shots = new Set(
    (project.episodes ?? []).flatMap(
      (episode) => currentStoryboard(episode)?.shots?.map((shot) => shot.id) ?? [],
    ),
  );
  const seen = new Set<string>();
  return [...(project.videoPrompts ?? [])]
    .sort((a, b) => (b.version ?? 1) - (a.version ?? 1))
    .filter((prompt) => {
      if (
        !prompt.shotId ||
        !shots.has(prompt.shotId) ||
        ["stale", "superseded"].includes(prompt.status) ||
        prompt.supersededById ||
        seen.has(prompt.shotId)
      )
        return false;
      seen.add(prompt.shotId);
      return true;
    });
}

export function pollingVideoPrompts(project: DramaProjectDetail): DramaVideoPrompt[] {
  return currentVideoPrompts(project).filter(
    (prompt) => canRefreshVideoTask(prompt) && ["queued", "running"].includes(prompt.status),
  );
}

export function canRefreshVideoTask(prompt: DramaVideoPrompt): boolean {
  return (
    Boolean(prompt.providerTaskId) && !["submitting", "submission_unknown"].includes(prompt.status)
  );
}

export function shouldPollProduction(project?: DramaProjectDetail): boolean {
  return Boolean(
    project &&
    ((project.batchJobs ?? []).some(isActiveBatch) ||
      currentVideoPrompts(project).some((prompt) => prompt.status === "submitting") ||
      pollingVideoPrompts(project).length),
  );
}

export function videoStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "等待提交",
    queued: "等待生成",
    running: "生成中",
    succeeded: "生成成功",
    failed: "生成失败",
    stale: "需按台本重新制作",
    submitting: "正在提交",
    submission_unknown: "提交结果待确认",
    superseded: "历史版本",
  };
  return labels[status] ?? status;
}

export function nextOutlineRange(
  project: Pick<DramaProjectDetail, "episodes" | "targetEpisodes">,
): { startOrder: number; count: number } | undefined {
  const existing = new Set((project.episodes ?? []).map((episode) => episode.order));
  let startOrder = 1;
  while (startOrder <= project.targetEpisodes && existing.has(startOrder)) startOrder++;
  if (startOrder > project.targetEpisodes) return undefined;
  let count = 1;
  while (
    count < 12 &&
    startOrder + count <= project.targetEpisodes &&
    !existing.has(startOrder + count)
  )
    count++;
  return { startOrder, count };
}

export function summarizeDramaStages(project: DramaProjectDetail) {
  const episodes = (project.episodes ?? []).filter(
    (episode) => episode.order >= 1 && episode.order <= project.targetEpisodes,
  );
  const scripted = episodes.filter((episode) => Boolean(episode.content?.trim()));
  const reviewed = scripted.filter((episode) =>
    ["reviewed", "needs_repair", "approved"].includes(episode.status),
  );
  return {
    outlined: new Set(episodes.map((episode) => episode.order)).size,
    scripted: scripted.length,
    reviewed: reviewed.length,
  };
}

export function batchCompletion(job: DramaBatchJob): {
  total: number;
  done: number;
  processed: number;
  percent: number;
} {
  const progress = parseBatchProgress(job.progress);
  const total = Math.max(0, progress.total || 0);
  const done = Math.max(0, progress.done || 0);
  // Backend `done` includes reused/skipped shots; they must not be counted twice.
  const processed = Math.min(total, done + Math.max(0, progress.failed || 0));
  return { total, done, processed, percent: total ? Math.round((processed / total) * 100) : 0 };
}
