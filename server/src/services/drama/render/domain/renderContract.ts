import { AppError } from "../../../../middleware/errorHandler";

export interface RenderVideoClip {
  shotId: string;
  shotOrder: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  sourceUrl: string;
  status: string;
}
export interface RenderAudioClip {
  shotId: string;
  audioUrl: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}
export interface RenderSubtitle { startSec: number; endSec: number; text: string }
export interface RenderTimeline {
  episode: { id: string; durationSec: number };
  tracks: { video: RenderVideoClip[]; audio: RenderAudioClip[]; subtitles: RenderSubtitle[] };
}
export interface RenderLimits {
  ffmpegPath: string;
  ffprobePath: string;
  threads: number;
  maxDurationSec: number;
  maxClips: number;
  maxAssetBytes: number;
  maxTotalBytes: number;
  maxOutputBytes: number;
  timeoutMs: number;
  downloadTimeoutMs: number;
}

function positiveInt(name: string, fallback: number, cap: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > cap) {
    throw new AppError(`${name} 必须为 1 到 ${cap} 之间的整数。`, 503);
  }
  return value;
}

export function readRenderLimits(): RenderLimits {
  return {
    ffmpegPath: process.env.DRAMA_FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath: process.env.DRAMA_FFPROBE_PATH?.trim() || "ffprobe",
    threads: positiveInt("DRAMA_RENDER_THREADS", 2, 4),
    maxDurationSec: positiveInt("DRAMA_RENDER_MAX_DURATION_SEC", 600, 1800),
    maxClips: positiveInt("DRAMA_RENDER_MAX_CLIPS", 80, 200),
    maxAssetBytes: positiveInt("DRAMA_RENDER_MAX_ASSET_MB", 256, 1024) * 1024 * 1024,
    maxTotalBytes: positiveInt("DRAMA_RENDER_MAX_INPUT_MB", 2048, 8192) * 1024 * 1024,
    maxOutputBytes: positiveInt("DRAMA_RENDER_MAX_OUTPUT_MB", 512, 2048) * 1024 * 1024,
    timeoutMs: positiveInt("DRAMA_RENDER_TIMEOUT_SEC", 1800, 7200) * 1000,
    downloadTimeoutMs: positiveInt("DRAMA_RENDER_DOWNLOAD_TIMEOUT_SEC", 120, 600) * 1000,
  };
}

function validTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Timeline is an internal persisted-data boundary, still validated before any I/O. */
export function validateRenderTimeline(value: unknown, limits: RenderLimits): RenderTimeline {
  const timeline = value as RenderTimeline | null;
  const videos = timeline?.tracks?.video;
  if (!Array.isArray(videos) || !videos.length) {
    throw new AppError("请先生成本集分镜和全部镜头视频，再合成成片。", 409);
  }
  if (videos.length > limits.maxClips) throw new AppError(`本集镜头超过合成上限 ${limits.maxClips} 个。`, 422);
  let cursor = 0;
  const shotIds = new Set<string>();
  for (const clip of videos) {
    if (!clip || typeof clip.shotId !== "string" || shotIds.has(clip.shotId)) {
      throw new AppError("镜头时间线重复或不完整，请重新生成分镜。", 409);
    }
    shotIds.add(clip.shotId);
    if (clip.status !== "succeeded" || typeof clip.sourceUrl !== "string" || !clip.sourceUrl.trim()) {
      throw new AppError(`镜头 ${clip.shotOrder} 还没有可用视频，请先完成视频生成。`, 409);
    }
    if (!validTime(clip.startSec) || !validTime(clip.endSec) || !validTime(clip.durationSec)
      || clip.durationSec <= 0 || Math.abs(clip.startSec - cursor) > 0.02
      || Math.abs(clip.endSec - clip.startSec - clip.durationSec) > 0.02) {
      throw new AppError("镜头时间线不连续，请检查分镜时长。", 409);
    }
    cursor = clip.endSec;
  }
  if (cursor > limits.maxDurationSec) throw new AppError(`本集超过合成时长上限 ${limits.maxDurationSec} 秒。`, 422);
  if (!timeline?.episode || typeof timeline.episode.id !== "string"
    || !Array.isArray(timeline.tracks.audio) || !Array.isArray(timeline.tracks.subtitles)) {
    throw new AppError("本集时间线不完整，请重新生成分镜。", 409);
  }
  if (timeline.tracks.audio.length > 1000 || timeline.tracks.subtitles.length > 3000) {
    throw new AppError("本集配音或字幕数量超过合成上限。", 422);
  }
  for (const clip of timeline.tracks.audio) {
    const shot = videos.find(video => video.shotId === clip.shotId);
    if (!shot || typeof clip.audioUrl !== "string" || !clip.audioUrl.trim()
      || !validTime(clip.startSec) || !validTime(clip.endSec) || !validTime(clip.durationSec)
      || clip.durationSec <= 0 || clip.startSec < shot.startSec - 0.01 || clip.endSec > shot.endSec + 0.01
      || Math.abs(clip.endSec - clip.startSec - clip.durationSec) > 0.02) {
      throw new AppError("部分配音缺少可用音频或时长，请重新生成对应镜头配音。", 409);
    }
  }
  for (const subtitle of timeline.tracks.subtitles) {
    if (!validTime(subtitle.startSec) || !validTime(subtitle.endSec) || subtitle.endSec <= subtitle.startSec
      || subtitle.endSec > cursor + 0.02 || typeof subtitle.text !== "string" || subtitle.text.length > 4000) {
      throw new AppError("字幕时间线不完整，请检查本集对白。", 409);
    }
  }
  return timeline;
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

export function shotSubtitles(subtitles: RenderSubtitle[], startSec: number, durationSec: number): string {
  return subtitles.filter(item => item.startSec < startSec + durationSec && item.endSec > startSec)
    .map((item, index) => `${index + 1}\n${srtTime(Math.max(0, item.startSec - startSec))} --> ${srtTime(Math.min(durationSec, item.endSec - startSec))}\n${item.text.replace(/\r/g, "").replace(/\n{2,}/g, "\n")}\n`)
    .join("\n");
}

/** Provider duration metadata may be absent; measured audio must never be cut to its estimate. */
export function retimeShotForMeasuredAudio(input: {
  clip: RenderVideoClip;
  audio: RenderAudioClip[];
  measuredDurations: number[];
  subtitles: RenderSubtitle[];
  startSec: number;
}): { clip: RenderVideoClip; audio: RenderAudioClip[]; subtitles: RenderSubtitle[] } {
  let previousSourceEnd = input.clip.startSec;
  let audioCursor = input.startSec;
  const audio = input.audio.map((item, index) => {
    const durationSec = input.measuredDurations[index];
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new AppError("无法读取配音真实时长。", 422);
    const startSec = audioCursor + Math.max(0, item.startSec - previousSourceEnd);
    audioCursor = startSec + durationSec;
    previousSourceEnd = item.endSec;
    return { ...item, startSec, endSec: audioCursor, durationSec };
  });
  const durationSec = Math.max(input.clip.durationSec, audioCursor - input.startSec);
  const clip = { ...input.clip, startSec: input.startSec, endSec: input.startSec + durationSec, durationSec };
  const offset = input.startSec - input.clip.startSec;
  const subtitles = input.subtitles
    .filter(item => item.startSec < input.clip.endSec && item.endSec > input.clip.startSec)
    .map(item => {
      const audioIndex = input.audio.findIndex(original => Math.abs(original.startSec - item.startSec) < 0.001 && Math.abs(original.endSec - item.endSec) < 0.001);
      return audioIndex >= 0
        ? { ...item, startSec: audio[audioIndex].startSec, endSec: audio[audioIndex].endSec }
        : { ...item, startSec: Math.max(input.startSec, item.startSec + offset), endSec: Math.min(clip.endSec, item.endSec + offset) };
    });
  return { clip, audio, subtitles };
}
