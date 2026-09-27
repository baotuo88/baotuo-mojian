import { z } from "zod";

export const MEDIA_PROVIDER_KINDS = ["tts", "video", "music"] as const;
export type MediaProviderKind = (typeof MEDIA_PROVIDER_KINDS)[number];

export const MEDIA_PROVIDER_PROTOCOLS = ["openai_speech", "openai_video", "http_json"] as const;
export type MediaProviderProtocol = (typeof MEDIA_PROVIDER_PROTOCOLS)[number];

/**
 * 每种能力允许的协议：
 * - tts：openai_speech（OpenAI 兼容 /audio/speech）或 http_json（自定义 JSON 端点）
 * - video：openai_video（OpenAI 兼容异步任务）或 http_json
 * - music：http_json
 */
export const MEDIA_PROTOCOLS_BY_KIND: Record<MediaProviderKind, readonly MediaProviderProtocol[]> = {
  tts: ["openai_speech", "http_json"],
  video: ["openai_video", "http_json"],
  music: ["http_json"],
};

export const MEDIA_PROVIDER_KIND_LABELS: Record<MediaProviderKind, string> = {
  tts: "配音",
  video: "视频",
  music: "配乐/音效",
};

export const MEDIA_PROVIDER_PROTOCOL_LABELS: Record<MediaProviderProtocol, string> = {
  openai_speech: "OpenAI 兼容语音合成",
  openai_video: "OpenAI 兼容视频任务",
  http_json: "自定义 JSON 端点",
};

/**
 * 协议扩展项。全部可选，缺省时按协议内置约定拼装请求：
 * - synthesizePath：http_json 配音合成路径
 * - createPath / statusPath：任务型协议（http_json 视频/配乐、openai_video）创建与查询路径，
 *   statusPath 支持 {taskId} 占位符
 * - speechPath / responseFormat / defaultVoice：openai_speech 细节
 * - headers：附加请求头；timeoutMs：单次请求超时
 * - payload：请求体模板。字符串值里的 ${字段} 占位符会用本次请求的字段替换，
 *   单独成段的 ${refImages} 会替换成数组本身，用于适配 Seedance、Grok 等异构报文
 * - taskIdPath / statusValuePath / resultUrlPath：从上游响应里取值的路径（支持 a.b.0.c）
 * - statusMap：上游状态词到 queued/running/succeeded/failed 的映射
 */
export interface MediaProviderOptions {
  synthesizePath?: string;
  createPath?: string;
  statusPath?: string;
  speechPath?: string;
  responseFormat?: string;
  defaultVoice?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  payload?: Record<string, unknown>;
  taskIdPath?: string;
  statusValuePath?: string;
  resultUrlPath?: string;
  statusMap?: Record<string, string>;
}

const OPTION_STRING_KEYS = [
  "synthesizePath",
  "createPath",
  "statusPath",
  "speechPath",
  "responseFormat",
  "defaultVoice",
] as const;

export function isMediaProviderKind(value: unknown): value is MediaProviderKind {
  return typeof value === "string" && (MEDIA_PROVIDER_KINDS as readonly string[]).includes(value);
}

export function isMediaProviderProtocol(value: unknown): value is MediaProviderProtocol {
  return typeof value === "string" && (MEDIA_PROVIDER_PROTOCOLS as readonly string[]).includes(value);
}

export function protocolsForKind(kind: MediaProviderKind): readonly MediaProviderProtocol[] {
  return MEDIA_PROTOCOLS_BY_KIND[kind];
}

export function defaultProtocolForKind(kind: MediaProviderKind): MediaProviderProtocol {
  return protocolsForKind(kind)[0];
}

export function isProtocolAllowedForKind(kind: MediaProviderKind, protocol: MediaProviderProtocol): boolean {
  return protocolsForKind(kind).includes(protocol);
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const headerName = key.trim();
    const headerValue = normalizeOptionalText(raw);
    if (headerName && headerValue) {
      headers[headerName] = headerValue;
    }
  }
  return Object.keys(headers).length ? headers : undefined;
}

/** 把数据库或请求体里的 options 归一化成受控结构，未知字段一律忽略。 */
export function normalizeMediaProviderOptions(input: unknown): MediaProviderOptions {
  let raw: unknown = input;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const options: MediaProviderOptions = {};
  for (const key of OPTION_STRING_KEYS) {
    const value = normalizeOptionalText(record[key]);
    if (value) {
      options[key] = value;
    }
  }
  const headers = normalizeHeaders(record.headers);
  if (headers) {
    options.headers = headers;
  }
  if (record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)) {
    options.payload = { ...(record.payload as Record<string, unknown>) };
  }
  const statusMap = normalizeHeaders(record.statusMap);
  if (statusMap) {
    options.statusMap = statusMap;
  }
  const timeoutMs = Number(record.timeoutMs);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    options.timeoutMs = Math.floor(timeoutMs);
  }
  return options;
}

export function serializeMediaProviderOptions(options: MediaProviderOptions | undefined): string | null {
  const normalized = normalizeMediaProviderOptions(options);
  return Object.keys(normalized).length ? JSON.stringify(normalized) : null;
}

const PROVIDER_KEY_FALLBACK = "channel";

/** 通道标识只保留小写字母、数字、下划线，便于与业务 provider 字段对应。 */
export function normalizeMediaProviderKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  return normalized || PROVIDER_KEY_FALLBACK;
}

/** 接口返回的密钥一律脱敏，只保留首尾少量字符用于人工核对。 */
export function maskApiKey(apiKey: string | null | undefined): string | null {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****`;
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

export interface MediaProviderView {
  id: string;
  kind: MediaProviderKind;
  providerKey: string;
  label: string;
  description: string | null;
  protocol: MediaProviderProtocol;
  baseURL: string | null;
  model: string | null;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  options: MediaProviderOptions;
  isActive: boolean;
  isBuiltin: boolean;
  supportsRefImages: boolean;
  costPerSecond: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

const mediaProviderKindSchema = z.enum(MEDIA_PROVIDER_KINDS);
const mediaProviderProtocolSchema = z.enum(MEDIA_PROVIDER_PROTOCOLS);

export const mediaProviderIdSchema = z.object({
  id: z.string().trim().min(1),
});

const mediaProviderOptionsInputSchema = z.union([z.string(), z.record(z.string(), z.unknown())]).optional();

export const createMediaProviderSchema = z.object({
  kind: mediaProviderKindSchema,
  providerKey: z.string().trim().max(64).optional(),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  protocol: mediaProviderProtocolSchema.optional(),
  baseURL: z.string().trim().max(500).optional(),
  apiKey: z.string().trim().max(500).optional(),
  model: z.string().trim().max(120).optional(),
  options: mediaProviderOptionsInputSchema,
  isActive: z.boolean().optional(),
  supportsRefImages: z.boolean().optional(),
  costPerSecond: z.coerce.number().min(0).max(1_000_000).optional(),
  currency: z.string().trim().max(8).optional(),
});

export const updateMediaProviderSchema = createMediaProviderSchema.partial().extend({
  apiKey: z.string().trim().max(500).nullable().optional(),
});

export type CreateMediaProviderInput = z.infer<typeof createMediaProviderSchema>;
export type UpdateMediaProviderInput = z.infer<typeof updateMediaProviderSchema>;

export const mediaAssetParamsSchema = z.object({
  kind: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(160),
});
