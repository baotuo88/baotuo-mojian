import type { DramaEpisode, DramaProjectDetail, DramaRenderJob } from "@/api/drama";
import { currentStoryboard, currentVideoPrompts } from "../production/model.ts";

export function isActiveRender(job: DramaRenderJob): boolean {
  return job.status === "queued" || job.status === "running";
}

export function isCurrentRender(job: DramaRenderJob, episode?: DramaEpisode): boolean {
  return Boolean(
    episode &&
    job.isCurrent !== false &&
    job.episodeId === episode.id &&
    job.sourceRevision === episode.revision &&
    job.storyboardId === currentStoryboard(episode)?.id,
  );
}

export function renderReadiness(project: DramaProjectDetail, episode?: DramaEpisode) {
  const board = currentStoryboard(episode);
  const shots = board?.shots ?? [];
  const completed = new Set(
    currentVideoPrompts(project)
      .filter((prompt) => prompt.status === "succeeded" && Boolean(prompt.resultUrl?.trim()))
      .map((prompt) => prompt.shotId),
  );
  const missingShotOrders = shots
    .filter((shot) => !completed.has(shot.id))
    .map((shot) => shot.order);
  return {
    ready: shots.length > 0 && missingShotOrders.length === 0,
    total: shots.length,
    missingShotOrders,
  };
}

export function renderProgress(job: DramaRenderJob): number {
  if (job.status === "succeeded" && job.resultUrl) return 100;
  return Number.isFinite(job.progress) ? Math.min(99, Math.max(0, Math.round(job.progress))) : 0;
}

export function renderStatusLabel(job: DramaRenderJob): string {
  if (job.status === "succeeded" && !job.resultUrl) return "成片链接缺失";
  return {
    queued: "等待合成",
    running: "合成中",
    succeeded: "成片可下载",
    failed: "合成失败",
    cancelled: "合成已取消",
  }[job.status];
}
