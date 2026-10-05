import { currentVideoPrompts, isActiveBatch, isBatchStoryboardCurrent, isRecoverableBatch, latestBatchJobs, nextOutlineRange } from "./projection.ts";
import type { DramaEpisode, DramaProjectDetail, DramaShot, DramaVideoPrompt } from "@/api/drama";
type NextStepKind =
  | "source"
  | "strategy"
  | "outline"
  | "script"
  | "review"
  | "repair"
  | "storyboard"
  | "videoPrompt"
  | "providerTask"
  | "production"
  | "videoStatus"
  | "settings"
  | "export";

export interface NextStep {
  kind: NextStepKind;
  title: string;
  description: string;
  button: string;
  tab: "source" | "strategy" | "episodes" | "visual" | "export";
  icon: "source" | "strategy" | "outline" | "script" | "review" | "repair" | "video" | "export";
  episodeOrder?: number;
  outlineRange?: { startOrder: number; count: number };
  shot?: DramaShot;
  videoPrompt?: DramaVideoPrompt;
}

function firstEpisodeWithoutScript(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => !episode.content?.trim());
}

function firstEpisodeWithoutReview(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) =>
    Boolean(episode.content?.trim()) && !["reviewed", "needs_repair", "approved"].includes(episode.status)
  );
}

function firstRepairableEpisode(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => episode.status === "needs_repair");
}

function firstEpisodeWithoutStoryboard(episodes: DramaEpisode[]): DramaEpisode | undefined {
  return episodes.find((episode) => Boolean(episode.content?.trim()) && !episode.storyboards?.[0]?.shots?.length);
}

function firstShotWithoutVideoPrompt(episodes: DramaEpisode[], videoPrompts: DramaVideoPrompt[]): {
  episode: DramaEpisode;
  shot: DramaShot;
} | undefined {
  const promptedShotIds = new Set(videoPrompts.filter(isActiveVideoPrompt).map((prompt) => prompt.shotId).filter(Boolean));
  for (const episode of episodes) {
    for (const storyboard of episode.storyboards?.slice(0, 1) ?? []) {
      for (const shot of storyboard.shots ?? []) {
        if (!promptedShotIds.has(shot.id)) {
          return { episode, shot };
        }
      }
    }
  }
  return undefined;
}

function firstPromptWithoutProviderTask(videoPrompts: DramaVideoPrompt[]): DramaVideoPrompt | undefined {
  return videoPrompts.find((prompt) => isActiveVideoPrompt(prompt) && !prompt.providerTaskId);
}

function isActiveVideoPrompt(prompt: DramaVideoPrompt): boolean {
  return prompt.status !== "superseded";
}

export function buildNextStep(project: DramaProjectDetail, videoProviderConfigured = true): NextStep {
  const episodes = [...(project.episodes ?? [])].sort((a, b) => a.order - b.order);
  const videoPrompts = currentVideoPrompts(project);
  const repairable = firstRepairableEpisode(episodes);
  const unreviewed = firstEpisodeWithoutReview(episodes);
  const unscripted = firstEpisodeWithoutScript(episodes);
  const unstagedStoryboard = firstEpisodeWithoutStoryboard(episodes);
  const shotWithoutPrompt = firstShotWithoutVideoPrompt(episodes, videoPrompts);
  const promptWithoutTask = firstPromptWithoutProviderTask(videoPrompts);

  const outstandingJob = latestBatchJobs(project.batchJobs).find((job) =>
    isActiveBatch(job) || (isRecoverableBatch(job) && isBatchStoryboardCurrent(job, episodes.find((episode) => episode.id === job.episodeId)))
  );
  if (outstandingJob) {
    const episode = episodes.find((item) => item.id === outstandingJob.episodeId);
    return {
      kind: "production", title: isActiveBatch(outstandingJob) ? "本集制作进行中" : "下一步：继续未完成的制作",
      description: isActiveBatch(outstandingJob) ? "任务进度会自动刷新。可在制作任务中暂停，已有镜头结果会保留。" : "查看制作任务，确认生成费用后继续未完成的镜头。",
      button: "查看本集制作", tab: outstandingJob.type === "tts" ? "episodes" : "visual", icon: "video", episodeOrder: episode?.order,
    };
  }
  if (!project.sourceBundle) {
    return {
      kind: "source",
      title: "下一步：整理来源素材",
      description: "先把小说、灵感或导入文本整理成短剧可用的梗概、节拍、角色和硬事实。",
      button: "整理素材",
      tab: "source",
      icon: "source",
    };
  }
  if (!project.strategy) {
    return {
      kind: "strategy",
      title: "下一步：生成短剧策略",
      description: "根据素材和赛道生成受众定位、主爽点线、付费卡点和改编边界。",
      button: "生成策略",
      tab: "strategy",
      icon: "strategy",
    };
  }
  const outlineRange = nextOutlineRange(project);
  if (episodes.length === 0 && outlineRange) return outlineStep(outlineRange);
  if (unscripted) {
    return {
      kind: "script",
      title: `下一步：生成第 ${unscripted.order} 集台本`,
      description: "把本集大纲写成可拍摄、对白密集、开场有钩子、结尾有卡点的短剧台本。",
      button: "生成台本",
      tab: "episodes",
      icon: "script",
      episodeOrder: unscripted.order,
    };
  }
  if (repairable) {
    return {
      kind: "repair",
      title: `下一步：修复第 ${repairable.order} 集质量问题`,
      description: "这集已有质量建议，先按建议修复，避免问题进入分镜和视频提示词。",
      button: "修复台本",
      tab: "episodes",
      icon: "repair",
      episodeOrder: repairable.order,
    };
  }
  if (unreviewed) {
    return {
      kind: "review",
      title: `下一步：检查第 ${unreviewed.order} 集质量`,
      description: "检查黄金 3 秒、信息密度、付费卡点、时长、事实一致和角色一致。",
      button: "质量检查",
      tab: "episodes",
      icon: "review",
      episodeOrder: unreviewed.order,
    };
  }
  if (unstagedStoryboard) {
    return {
      kind: "storyboard",
      title: `下一步：生成第 ${unstagedStoryboard.order} 集分镜`,
      description: "把已通过检查的台本拆成可拍摄镜头，保留角色视觉锚点和动作重点。",
      button: "生成分镜",
      tab: "visual",
      icon: "video",
      episodeOrder: unstagedStoryboard.order,
    };
  }
  if (shotWithoutPrompt) {
    return {
      kind: "videoPrompt",
      title: `下一步：生成第 ${shotWithoutPrompt.episode.order} 集视频提示词`,
      description: "把一个分镜镜头转换成竖屏视频生成提示词，保留角色、动作和镜头语言。",
      button: "生成视频提示词",
      tab: "visual",
      icon: "video",
      episodeOrder: shotWithoutPrompt.episode.order,
      shot: shotWithoutPrompt.shot,
    };
  }
  const videoNeedingAttention = videoPrompts.find((prompt) =>
    ["queued", "running", "submitting", "submission_unknown", "failed"].includes(prompt.status)
    || (Boolean(prompt.providerTaskId) && (prompt.status !== "succeeded" || !prompt.resultUrl))
  );
  if (videoNeedingAttention) {
    const waiting = ["queued", "running", "submitting"].includes(videoNeedingAttention.status);
    return {
      kind: "videoStatus", title: waiting ? "视频制作进行中" : "下一步：处理未完成的视频",
      description: waiting ? "视频生成仍在处理中，请在分镜视频中查看进度。" : "查看失败或待确认的视频任务。确认重试前，请检查生成通道中的结果和费用。",
      button: "查看视频任务", tab: "visual", icon: "video",
      episodeOrder: episodes.find((episode) => episode.id === videoNeedingAttention.episodeId)?.order,
      videoPrompt: videoNeedingAttention,
    };
  }
  if (promptWithoutTask) {
    if (!videoProviderConfigured) return {
      kind: "settings", title: "下一步：配置视频生成通道", description: "在媒体通道设置中添加并启用视频生成服务，再创建视频任务。", button: "设置视频通道", tab: "visual", icon: "video",
    };
    return {
      kind: "providerTask", title: "下一步：创建视频生成任务",
      description: "把视频提示词提交给所选生成通道，进度会自动刷新。",
      button: "创建视频任务", tab: "visual", icon: "video", videoPrompt: promptWithoutTask,
      episodeOrder: episodes.find((episode) => episode.id === promptWithoutTask.episodeId)?.order,
    };
  }
  if (outlineRange) return outlineStep(outlineRange);
  return {
    kind: "export",
    title: "下一步：导出短剧资料",
    description: "导出当前角色、分集、台本、质量结果和后续生产资料，方便继续编辑或交付。",
    button: "导出 Markdown",
    tab: "export",
    icon: "export",
  };
}


function outlineStep(range: { startOrder: number; count: number }): NextStep {
  const end = range.startOrder + range.count - 1;
  const label = range.count === 1 ? `第 ${range.startOrder} 集` : `第 ${range.startOrder}–${end} 集`;
  return {
    kind: "outline", title: `下一步：规划${label}`, description: "按目标集数补齐下一段分集大纲，保留已有分集和台本。",
    button: `生成${label}分集`, tab: "episodes", icon: "outline", outlineRange: range,
  };
}
