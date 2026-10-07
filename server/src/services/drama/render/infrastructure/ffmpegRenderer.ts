import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "../../../../middleware/errorHandler";
import { MediaInputResolver } from "./mediaInput";
import {
  retimeShotForMeasuredAudio,
  shotSubtitles,
  type RenderLimits,
  type RenderTimeline,
} from "../domain/renderContract";

// Do not allow playlists or network protocols inside media parsers. FFmpeg receives only downloaded files.
const MEDIA_FORMATS = "mov,matroska,webm,wav,mp3,ogg,flac,aac";

export function runMediaProcess(
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let processFailure: Error | undefined;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
      killTimer.unref();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (killTimer) clearTimeout(killTimer);
      if (error) reject(error);
      else resolve(stdout);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 1024 * 1024) {
        stdout = "";
        processFailure = new AppError("媒体分析输出超过限制。", 422);
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16000);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.name === "AbortError") return; // Wait for close before deleting work files or scheduling another job.
      finish(
        error.code === "ENOENT"
          ? new AppError("服务器缺少 FFmpeg/FFprobe，请联系管理员安装成片组件。", 503)
          : error,
      );
    });
    child.once("close", (code) => {
      if (processFailure) return finish(processFailure);
      if (signal.aborted) return finish(new AppError("成片合成已取消或超时。", 409));
      if (code !== 0) {
        console.warn("[drama-render] media process failed", { code, detail: stderr.slice(-1200) });
        return finish(new AppError("素材无法解码或成片处理失败，请检查镜头视频及配音格式。", 422));
      }
      finish();
    });
  });
}

interface ProbeResult {
  duration: number;
  video: boolean;
  audio: boolean;
  width: number;
  height: number;
}

export async function probeMedia(
  file: string,
  cwd: string,
  limits: RenderLimits,
  signal: AbortSignal,
): Promise<ProbeResult> {
  const raw = await runMediaProcess(
    limits.ffprobePath,
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file",
      "-format_whitelist",
      MEDIA_FORMATS,
      "-show_entries",
      "format=duration:stream=codec_type,width,height",
      "-of",
      "json",
      file,
    ],
    cwd,
    signal,
  );
  const parsed = JSON.parse(raw) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const duration = Number(parsed.format?.duration);
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > limits.maxDurationSec + 30 ||
    (video &&
      (!video.width ||
        !video.height ||
        video.width > 7680 ||
        video.height > 7680 ||
        video.width * video.height > 34000000))
  ) {
    throw new AppError("素材时长或分辨率超过合成限制。", 422);
  }
  return {
    duration,
    video: Boolean(video),
    audio: Boolean(parsed.streams?.some((stream) => stream.codec_type === "audio")),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
  };
}

export async function ensureRenderTools(limits: RenderLimits, signal: AbortSignal): Promise<void> {
  await runMediaProcess(limits.ffmpegPath, ["-version"], process.cwd(), signal);
  await runMediaProcess(limits.ffprobePath, ["-version"], process.cwd(), signal);
}

/** Each shot produces bounded normalized H.264/AAC media, then concat copies those streams. */
export async function renderTimelineToMp4(input: {
  timeline: RenderTimeline;
  directory: string;
  limits: RenderLimits;
  signal: AbortSignal;
  onProgress: (progress: number) => Promise<void>;
}): Promise<string> {
  const { timeline, directory, limits, signal } = input;
  const resolver = new MediaInputResolver(limits, signal);
  const outputPaths: string[] = [];
  let normalizedBytes = 0;
  let renderCursor = 0;
  const seconds = (value: number) => value.toFixed(6);
  for (let index = 0; index < timeline.tracks.video.length; index++) {
    signal.throwIfAborted();
    const sourceClip = timeline.tracks.video[index];
    const videoFile = `video-${index}.input`;
    await resolver.materialize(sourceClip.sourceUrl, path.join(directory, videoFile), "video");
    const probe = await probeMedia(videoFile, directory, limits, signal);
    if (!probe.video)
      throw new AppError(`镜头 ${sourceClip.shotOrder} 的素材不包含视频画面。`, 422);
    const sourceAudio = timeline.tracks.audio
      .filter((audio) => audio.shotId === sourceClip.shotId)
      .sort((a, b) => a.startSec - b.startSec);
    if (sourceAudio.length > 64)
      throw new AppError(`镜头 ${sourceClip.shotOrder} 配音过多，请拆分镜头。`, 422);
    const measuredDurations: number[] = [];
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-filter_complex_threads",
      String(limits.threads),
    ];
    const addInput = (file: string) =>
      args.push(
        "-threads",
        String(limits.threads),
        "-protocol_whitelist",
        "file",
        "-format_whitelist",
        MEDIA_FORMATS,
        "-i",
        file,
      );
    addInput(videoFile);
    for (let audioIndex = 0; audioIndex < sourceAudio.length; audioIndex++) {
      const audioFile = `audio-${index}-${audioIndex}.input`;
      await resolver.materialize(sourceAudio[audioIndex].audioUrl, path.join(directory, audioFile));
      const audioProbe = await probeMedia(audioFile, directory, limits, signal);
      if (!audioProbe.audio)
        throw new AppError(`镜头 ${sourceClip.shotOrder} 的配音素材不包含声音。`, 422);
      measuredDurations.push(audioProbe.duration);
      addInput(audioFile);
    }
    const {
      clip,
      audio: audioClips,
      subtitles,
    } = retimeShotForMeasuredAudio({
      clip: sourceClip,
      audio: sourceAudio,
      measuredDurations,
      subtitles: timeline.tracks.subtitles,
      startSec: renderCursor,
    });
    if (clip.endSec > limits.maxDurationSec)
      throw new AppError(
        `配音实际时长使本集超过合成上限 ${limits.maxDurationSec} 秒，请拆分本集。`,
        422,
      );
    renderCursor = clip.endSec;
    const filters: string[] = [];
    const subtitleText = shotSubtitles(subtitles, clip.startSec, clip.durationSec);
    let videoFilter = `[0:v:0]setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${seconds(clip.durationSec)},trim=duration=${seconds(clip.durationSec)}`;
    if (subtitleText) {
      const subtitleFile = `subtitle-${index}.srt`;
      await fs.writeFile(path.join(directory, subtitleFile), subtitleText, "utf8");
      videoFilter += `,subtitles=filename=${subtitleFile}:force_style='FontName=Noto Sans CJK SC,FontSize=20,Outline=2,MarginV=30'`;
    }
    filters.push(`${videoFilter}[v]`);
    if (audioClips.length) {
      const labels: string[] = [];
      audioClips.forEach((audio, audioIndex) => {
        const label = `a${audioIndex}`;
        labels.push(`[${label}]`);
        const delayMs = Math.max(0, Math.round((audio.startSec - clip.startSec) * 1000));
        filters.push(
          `[${audioIndex + 1}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,atrim=duration=${seconds(audio.durationSec)},adelay=${delayMs}|${delayMs}[${label}]`,
        );
      });
      filters.push(
        `${labels.join("")}amix=inputs=${audioClips.length}:duration=longest:normalize=0,apad,atrim=duration=${seconds(clip.durationSec)}[a]`,
      );
    } else if (probe.audio) {
      filters.push(
        `[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,apad,atrim=duration=${seconds(clip.durationSec)}[a]`,
      );
    } else {
      filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(clip.durationSec)}[a]`);
    }
    const output = `clip-${index}.mp4`;
    args.push(
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-t",
      seconds(clip.durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      String(limits.threads),
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-map_metadata",
      "-1",
      "-max_muxing_queue_size",
      "1024",
      "-fs",
      String(limits.maxOutputBytes - normalizedBytes),
      output,
    );
    await runMediaProcess(limits.ffmpegPath, args, directory, signal);
    normalizedBytes += (await fs.stat(path.join(directory, output))).size;
    if (normalizedBytes >= limits.maxOutputBytes)
      throw new AppError("成片超过文件大小限制，请缩短本集时长。", 422);
    const encoded = await probeMedia(output, directory, limits, signal);
    if (Math.abs(encoded.duration - clip.durationSec) > 0.15)
      throw new AppError(`镜头 ${clip.shotOrder} 合成时长不完整。`, 422);
    outputPaths.push(output);
    await input.onProgress(
      Math.min(90, 5 + Math.round(((index + 1) / timeline.tracks.video.length) * 85)),
    );
  }
  signal.throwIfAborted();
  await fs.writeFile(
    path.join(directory, "clips.txt"),
    outputPaths.map((file) => `file '${file}'`).join("\n"),
    "utf8",
  );
  await runMediaProcess(
    limits.ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-protocol_whitelist",
      "file",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      "clips.txt",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c",
      "copy",
      "-map_metadata",
      "-1",
      "-movflags",
      "+faststart",
      "-fs",
      String(limits.maxOutputBytes),
      "result.mp4",
    ],
    directory,
    signal,
  );
  const output = path.join(directory, "result.mp4");
  if ((await fs.stat(output)).size >= limits.maxOutputBytes)
    throw new AppError("成片超过文件大小限制。", 422);
  const result = await probeMedia("result.mp4", directory, limits, signal);
  const expectedDuration = renderCursor;
  if (
    !result.video ||
    !result.audio ||
    Math.abs(result.duration - expectedDuration) >
      Math.max(0.25, timeline.tracks.video.length * 0.05)
  ) {
    throw new AppError("成片时长或音视频轨道不完整，请重试合成。", 422);
  }
  await input.onProgress(95);
  return output;
}
