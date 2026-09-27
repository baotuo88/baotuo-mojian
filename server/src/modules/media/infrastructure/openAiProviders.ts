import type { MediaProviderOptions } from "../domain/mediaProviderContracts";
import type {
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProviderPort,
} from "../domain/providerPorts";
import { normalizeTaskPayload, type TaskResponsePaths } from "./httpJsonProviders";
import { saveMediaAsset } from "./mediaAssetStore";
import {
  buildHeaders,
  joinUrl,
  normalizeCostValue,
  normalizeTimeoutMs,
  readCostCurrency,
  readJsonResponse,
  readStringFieldDeep,
  resolvePayloadTemplate,
} from "./mediaHttp";

const OPENAI_SPEECH_DEFAULT_PATH = "/audio/speech";
const OPENAI_SPEECH_DEFAULT_VOICE = "alloy";
const OPENAI_SPEECH_DEFAULT_FORMAT = "mp3";

const OPENAI_VIDEO_DEFAULT_CREATE_PATH = "/video/generations";
const OPENAI_VIDEO_DEFAULT_STATUS_PATH = "/video/generations/{taskId}";
const OPENAI_VIDEO_RESPONSE_PATHS: TaskResponsePaths = {
  taskId: ["id", "task_id", "requestId", "data.id", "data.task_id"],
  status: ["status", "state", "data.status", "output.status"],
  resultUrl: ["video_url", "url", "output.url", "output.video_url", "data.url", "data.0.url", "data.video_url"],
  failure: ["error.message", "error", "message", "data.error.message", "data.error"],
};

export type MediaAssetPersister = (input: {
  kind: "tts" | "video" | "music";
  bytes: Uint8Array;
  contentType?: string | null;
}) => Promise<{ url: string }>;

/**
 * OpenAI 兼容语音合成（POST {baseURL}/audio/speech）。
 * 上游返回二进制音频时落盘到媒体资产目录并返回可访问地址；
 * 返回 JSON 且带音频地址时直接透传，兼容返回 URL 或 base64 的中转站。
 */
export class OpenAiSpeechProvider implements TTSProviderPort {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;
  readonly costPerSecond: number;
  readonly currency: string;

  constructor(private readonly config: {
    provider: string;
    label?: string;
    description?: string;
    baseURL: string;
    apiKey?: string;
    model?: string | null;
    options?: MediaProviderOptions;
    costPerSecond?: number;
    currency?: string;
    persistAsset?: MediaAssetPersister;
  }) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
    this.costPerSecond = normalizeCostValue(config.costPerSecond);
    this.currency = config.currency?.trim() || readCostCurrency();
  }

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    const options = this.config.options ?? {};
    const url = joinUrl(this.config.baseURL, options.speechPath ?? OPENAI_SPEECH_DEFAULT_PATH);
    const body: Record<string, unknown> = {
      input: input.text,
      voice: input.voiceId?.trim() || options.defaultVoice || OPENAI_SPEECH_DEFAULT_VOICE,
      response_format: options.responseFormat ?? OPENAI_SPEECH_DEFAULT_FORMAT,
    };
    if (this.config.model) {
      body.model = this.config.model;
    }
    if (Number.isFinite(Number(input.speed)) && Number(input.speed) > 0) {
      body.speed = Number(input.speed);
    }
    if (options.payload) {
      Object.assign(body, resolvePayloadTemplate(options.payload, {
        text: input.text,
        voiceId: input.voiceId ?? "",
        speed: input.speed ?? "",
        emotion: input.emotion ?? "",
        model: this.config.model ?? "",
        providerKey: this.provider,
      }));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(this.config.apiKey, options.headers),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(normalizeTimeoutMs(options.timeoutMs)),
    });
    if (!response.ok) {
      throw new Error(`配音通道合成失败：${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await readJsonResponse(response);
      return this.readJsonResult(payload);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) {
      throw new Error("配音通道返回了空音频。");
    }
    const persist = this.config.persistAsset ?? saveMediaAsset;
    const asset = await persist({ kind: "tts", bytes, contentType });
    return {
      audioUrl: asset.url,
      raw: { contentType: contentType || "audio/mpeg", bytes: bytes.byteLength },
    };
  }

  private readJsonResult(payload: Record<string, unknown>): TTSGenerationResult {
    const audioUrl = readStringFieldDeep(payload, ["audioUrl", "url", "resultUrl", "audio_url", "data.0.url", "data.url"]);
    if (audioUrl) {
      return { audioUrl, durationSec: this.readDuration(payload), raw: payload };
    }
    const base64 = readStringFieldDeep(payload, ["audio", "data", "audioBase64", "data.audio"]);
    if (base64) {
      const isDataUrl = /^data:[^,]+,/.test(base64);
      const mime = this.config.options?.responseFormat === "wav" ? "audio/wav" : "audio/mpeg";
      return {
        audioUrl: isDataUrl ? base64 : `data:${mime};base64,${base64}`,
        durationSec: this.readDuration(payload),
        raw: payload,
      };
    }
    throw new Error("配音通道没有返回音频数据。");
  }

  private readDuration(payload: Record<string, unknown>): number | undefined {
    const value = Number(payload.durationSec ?? payload.duration ?? payload.seconds);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
}

/** OpenAI 兼容视频任务（POST 创建 + GET 查询），支持自定义路径、请求模板与响应字段路径。 */
export class OpenAiVideoProvider implements VideoProviderPort {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;
  readonly supportsRefImages: boolean;
  readonly costPerSecond: number;
  readonly currency: string;

  constructor(private readonly config: {
    provider: string;
    label?: string;
    description?: string;
    baseURL: string;
    apiKey?: string;
    model?: string | null;
    options?: MediaProviderOptions;
    supportsRefImages?: boolean;
    costPerSecond?: number;
    currency?: string;
  }) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
    this.supportsRefImages = config.supportsRefImages ?? false;
    this.costPerSecond = normalizeCostValue(config.costPerSecond);
    this.currency = config.currency?.trim() || readCostCurrency();
  }

  async createTask(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const options = this.config.options ?? {};
    const url = joinUrl(this.config.baseURL, options.createPath ?? OPENAI_VIDEO_DEFAULT_CREATE_PATH);
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(this.config.apiKey, options.headers),
      body: JSON.stringify(this.buildBody(input, options)),
      signal: AbortSignal.timeout(normalizeTimeoutMs(options.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`视频通道创建任务失败：${response.status} ${response.statusText}`);
    }
    return this.toResult(payload, `${this.provider}_${Date.now()}`, options);
  }

  async getTask(providerTaskId: string): Promise<VideoGenerationResult> {
    const options = this.config.options ?? {};
    const statusPath = options.statusPath ?? OPENAI_VIDEO_DEFAULT_STATUS_PATH;
    const url = joinUrl(this.config.baseURL, statusPath.replace("{taskId}", encodeURIComponent(providerTaskId)));
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(this.config.apiKey, options.headers),
      signal: AbortSignal.timeout(normalizeTimeoutMs(options.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`视频通道查询任务失败：${response.status} ${response.statusText}`);
    }
    return this.toResult(payload, providerTaskId, options);
  }

  private buildBody(input: VideoGenerationRequest, options: MediaProviderOptions): Record<string, unknown> {
    if (options.payload) {
      return resolvePayloadTemplate(options.payload, {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt ?? "",
        aspectRatio: input.aspectRatio,
        durationSec: input.durationSec ?? "",
        refImages: input.refImages ?? [],
        model: this.config.model ?? "",
        providerKey: this.provider,
      });
    }
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (this.config.model) {
      body.model = this.config.model;
    }
    if (input.negativePrompt) {
      body.negative_prompt = input.negativePrompt;
    }
    if (input.aspectRatio) {
      body.aspect_ratio = input.aspectRatio;
    }
    if (input.durationSec) {
      body.duration = input.durationSec;
    }
    if (this.supportsRefImages && input.refImages?.length) {
      body.image_urls = input.refImages;
    }
    return body;
  }

  private toResult(payload: Record<string, unknown>, fallbackTaskId: string, options: MediaProviderOptions): VideoGenerationResult {
    return {
      ...normalizeTaskPayload(payload, fallbackTaskId, options, OPENAI_VIDEO_RESPONSE_PATHS),
      raw: payload,
    };
  }
}
