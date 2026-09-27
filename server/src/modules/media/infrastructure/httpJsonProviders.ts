import type { MediaProviderOptions } from "../domain/mediaProviderContracts";
import type {
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicProviderPort,
  TTSGenerationRequest,
  TTSGenerationResult,
  TTSProviderPort,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProviderPort,
} from "../domain/providerPorts";
import type { MediaTaskStatus } from "./mediaHttp";
import {
  buildHeaders,
  normalizeCostValue,
  normalizeTaskStatus,
  normalizeTimeoutMs,
  readCostCurrency,
  readJsonResponse,
  readNumberField,
  readPathField,
  readStringFieldDeep,
  resolvePayloadTemplate,
} from "./mediaHttp";

const TASK_ID_PATHS = ["providerTaskId", "taskId", "task_id", "id", "requestId", "request_id", "data.id", "data.taskId", "output.id"];
const STATUS_PATHS = ["status", "state", "taskStatus", "task_status", "data.status", "output.status"];
const RESULT_URL_PATHS = [
  "resultUrl",
  "videoUrl",
  "audioUrl",
  "url",
  "video_url",
  "audio_url",
  "output.url",
  "output.video_url",
  "output.audio_url",
  "data.url",
  "data.0.url",
  "data.video_url",
  "result.url",
];
const FAILURE_PATHS = ["failureReason", "error", "message", "error.message", "data.error", "data.message"];

function readMappedString(payload: Record<string, unknown>, path: string | undefined, fallbackPaths: string[]): string | undefined {
  if (path) {
    const value = readPathField(payload, path);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  return readStringFieldDeep(payload, fallbackPaths);
}

export interface JsonTaskResponse {
  providerTaskId: string;
  status: MediaTaskStatus;
  resultUrl?: string;
  failureReason?: string;
}

export interface TaskResponsePaths {
  taskId: string[];
  status: string[];
  resultUrl: string[];
  failure: string[];
}

export const DEFAULT_TASK_RESPONSE_PATHS: TaskResponsePaths = {
  taskId: TASK_ID_PATHS,
  status: STATUS_PATHS,
  resultUrl: RESULT_URL_PATHS,
  failure: FAILURE_PATHS,
};

export function normalizeTaskPayload(
  payload: Record<string, unknown>,
  fallbackTaskId: string,
  options: MediaProviderOptions,
  paths: TaskResponsePaths = DEFAULT_TASK_RESPONSE_PATHS,
): JsonTaskResponse {
  const statusValue = options.statusValuePath ? readPathField(payload, options.statusValuePath) : undefined;
  const status = statusValue !== undefined
    ? normalizeTaskStatus(statusValue, options.statusMap)
    : normalizeTaskStatus(readStringFieldDeep(payload, paths.status), options.statusMap);
  return {
    providerTaskId: readMappedString(payload, options.taskIdPath, paths.taskId) ?? fallbackTaskId,
    status,
    resultUrl: readMappedString(payload, options.resultUrlPath, paths.resultUrl),
    failureReason: status === "failed" ? readStringFieldDeep(payload, paths.failure) : undefined,
  };
}

export class HttpTTSProvider implements TTSProviderPort {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;
  readonly costPerSecond: number;
  readonly currency: string;

  constructor(private readonly config: {
    provider: string;
    label?: string;
    description?: string;
    synthesizeUrl: string;
    apiKey?: string;
    model?: string | null;
    headers?: Record<string, string>;
    timeoutMs?: number;
    costPerSecond?: number;
    currency?: string;
    options?: MediaProviderOptions;
  }) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
    this.costPerSecond = normalizeCostValue(config.costPerSecond);
    this.currency = config.currency?.trim() || readCostCurrency();
  }

  async synthesize(input: TTSGenerationRequest): Promise<TTSGenerationResult> {
    const template = this.config.options?.payload;
    const body = template
      ? resolvePayloadTemplate(template, {
        text: input.text,
        voiceId: input.voiceId ?? "",
        speed: input.speed ?? "",
        emotion: input.emotion ?? "",
        model: this.config.model ?? "",
        providerKey: this.provider,
      })
      : { ...input };
    const response = await fetch(this.config.synthesizeUrl, {
      method: "POST",
      headers: buildHeaders(this.config.apiKey, this.config.headers),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`配音通道合成失败：${response.status} ${response.statusText}`);
    }
    const audioUrl = readMappedString(payload, this.config.options?.resultUrlPath, ["audioUrl", "url", "resultUrl", "data.0.url", "data.url"]);
    if (!audioUrl) {
      throw new Error("配音通道没有返回音频地址。");
    }
    return {
      audioUrl,
      durationSec: readNumberField(payload, ["durationSec", "duration", "seconds"]),
      raw: payload,
    };
  }
}

export interface HttpJsonTaskProviderConfig {
  provider: string;
  label?: string;
  description?: string;
  createUrl: string;
  statusUrl?: string;
  apiKey?: string;
  model?: string | null;
  headers?: Record<string, string>;
  timeoutMs?: number;
  costPerSecond?: number;
  currency?: string;
  options?: MediaProviderOptions;
  kindLabel: string;
}

abstract class HttpJsonTaskProvider<TResult extends JsonTaskResponse> {
  readonly provider: string;
  readonly label: string;
  readonly description?: string;
  readonly costPerSecond: number;
  readonly currency: string;
  protected readonly options: MediaProviderOptions;

  constructor(protected readonly config: HttpJsonTaskProviderConfig) {
    this.provider = config.provider;
    this.label = config.label ?? config.provider;
    this.description = config.description;
    this.costPerSecond = normalizeCostValue(config.costPerSecond);
    this.currency = config.currency?.trim() || readCostCurrency();
    this.options = config.options ?? {};
  }

  /** 上游未配置 payload 模板时使用的默认请求体。 */
  protected abstract defaultTaskBody(input: unknown): Record<string, unknown>;

  /** payload 模板可引用的请求字段。 */
  protected abstract taskContext(input: unknown): Record<string, unknown>;

  protected buildTaskBody(input: unknown): Record<string, unknown> {
    if (this.options.payload) {
      return resolvePayloadTemplate(this.options.payload, this.taskContext(input));
    }
    return this.defaultTaskBody(input);
  }

  async createTask(input: unknown): Promise<TResult> {
    const payload = await this.postJson(this.config.createUrl, this.buildTaskBody(input));
    return { ...normalizeTaskPayload(payload, `${this.provider}_${Date.now()}`, this.options), raw: payload } as unknown as TResult;
  }

  async getTask(providerTaskId: string): Promise<TResult> {
    if (!this.config.statusUrl) {
      return {
        providerTaskId,
        status: "queued",
        raw: { message: "statusUrl is not configured" },
      } as unknown as TResult;
    }
    const url = this.config.statusUrl.replace("{taskId}", encodeURIComponent(providerTaskId));
    const payload = await this.getJson(url);
    return { ...normalizeTaskPayload(payload, providerTaskId, this.options), raw: payload } as unknown as TResult;
  }

  private async postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(this.config.apiKey, this.config.headers),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`${this.config.kindLabel}创建任务失败：${response.status} ${response.statusText}`);
    }
    return payload;
  }

  private async getJson(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(this.config.apiKey, this.config.headers),
      signal: AbortSignal.timeout(normalizeTimeoutMs(this.config.timeoutMs)),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`${this.config.kindLabel}查询任务失败：${response.status} ${response.statusText}`);
    }
    return payload;
  }
}

export class HttpVideoProvider extends HttpJsonTaskProvider<VideoGenerationResult> implements VideoProviderPort {
  readonly supportsRefImages: boolean;

  constructor(config: HttpJsonTaskProviderConfig & { supportsRefImages?: boolean }) {
    super(config);
    this.supportsRefImages = config.supportsRefImages ?? false;
  }

  protected defaultTaskBody(input: unknown): Record<string, unknown> {
    const request = input as VideoGenerationRequest;
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
    };
    if (request.negativePrompt) {
      body.negativePrompt = request.negativePrompt;
    }
    if (request.durationSec) {
      body.durationSec = request.durationSec;
    }
    if (this.supportsRefImages && request.refImages?.length) {
      body.refImages = request.refImages;
    }
    return body;
  }

  protected taskContext(input: unknown): Record<string, unknown> {
    const request = input as VideoGenerationRequest;
    return {
      prompt: request.prompt,
      negativePrompt: request.negativePrompt ?? "",
      aspectRatio: request.aspectRatio,
      durationSec: request.durationSec ?? "",
      refImages: request.refImages ?? [],
      model: this.config.model ?? "",
      providerKey: this.provider,
    };
  }

}

export class HttpMusicProvider extends HttpJsonTaskProvider<MusicGenerationResult> implements MusicProviderPort {
  protected defaultTaskBody(input: unknown): Record<string, unknown> {
    const request = input as MusicGenerationRequest;
    const body: Record<string, unknown> = { prompt: request.prompt };
    if (request.durationSec) {
      body.durationSec = request.durationSec;
    }
    if (request.style) {
      body.style = request.style;
    }
    if (typeof request.instrumental === "boolean") {
      body.instrumental = request.instrumental;
    }
    return body;
  }

  protected taskContext(input: unknown): Record<string, unknown> {
    const request = input as MusicGenerationRequest;
    return {
      prompt: request.prompt,
      durationSec: request.durationSec ?? "",
      style: request.style ?? "",
      instrumental: request.instrumental ?? "",
      model: this.config.model ?? "",
      providerKey: this.provider,
    };
  }

}
