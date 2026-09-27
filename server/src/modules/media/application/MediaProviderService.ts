import type { MusicProviderPort, TTSProviderPort, VideoProviderPort } from "../domain/providerPorts";
import {
  defaultProtocolForKind,
  isMediaProviderKind,
  isMediaProviderProtocol,
  isProtocolAllowedForKind,
  maskApiKey,
  normalizeMediaProviderKey,
  normalizeMediaProviderOptions,
  serializeMediaProviderOptions,
  type CreateMediaProviderInput,
  type MediaProviderKind,
  type MediaProviderOptions,
  type MediaProviderProtocol,
  type MediaProviderView,
  type UpdateMediaProviderInput,
} from "../domain/mediaProviderContracts";
import { HttpMusicProvider, HttpTTSProvider, HttpVideoProvider } from "../infrastructure/httpJsonProviders";
import {
  musicProviderRegistry,
  ttsProviderRegistry,
  videoProviderRegistry,
} from "../infrastructure/mediaProviderRegistry";
import { OpenAiSpeechProvider, OpenAiVideoProvider } from "../infrastructure/openAiProviders";
import { joinUrl } from "../infrastructure/mediaHttp";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";

interface MediaProviderRecord {
  id: string;
  kind: string;
  providerKey: string;
  label: string;
  description: string | null;
  protocol: string;
  baseURL: string | null;
  apiKey: string | null;
  model: string | null;
  options: string | null;
  isActive: boolean;
  isBuiltin: boolean;
  supportsRefImages: boolean;
  costPerSecond: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaProviderKindMeta {
  kind: MediaProviderKind;
  label: string;
  protocols: Array<{ protocol: MediaProviderProtocol; label: string }>;
}

const DEFAULT_TTS_TASK_PATH = "/tts/synthesize";
const DEFAULT_VIDEO_TASK_PATH = "/video/tasks";
const DEFAULT_MUSIC_TASK_PATH = "/music/tasks";

function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveKind(record: { kind: string }): MediaProviderKind {
  if (!isMediaProviderKind(record.kind)) {
    throw new AppError(`未知的媒体通道类型：${record.kind}`, 500);
  }
  return record.kind;
}

function resolveProtocol(record: { protocol: string }, kind: MediaProviderKind): MediaProviderProtocol {
  if (!isMediaProviderProtocol(record.protocol) || !isProtocolAllowedForKind(kind, record.protocol)) {
    throw new AppError(`媒体通道协议 ${record.protocol} 与 ${kind} 能力不匹配。`, 500);
  }
  return record.protocol;
}

export function toMediaProviderView(record: MediaProviderRecord): MediaProviderView {
  const kind = resolveKind(record);
  return {
    id: record.id,
    kind,
    providerKey: record.providerKey,
    label: record.label,
    description: record.description ?? null,
    protocol: resolveProtocol(record, kind),
    baseURL: record.baseURL ?? null,
    model: record.model ?? null,
    hasApiKey: Boolean(record.apiKey?.trim()),
    apiKeyMasked: maskApiKey(record.apiKey),
    options: normalizeMediaProviderOptions(record.options),
    isActive: record.isActive,
    isBuiltin: record.isBuiltin,
    supportsRefImages: record.supportsRefImages,
    costPerSecond: record.costPerSecond,
    currency: record.currency,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** 用数据库记录构建运行期端口。协议差异只在这里收口，业务侧只认 provider 标识。 */
export function buildMediaProviderPorts(records: MediaProviderRecord[]): {
  tts: TTSProviderPort[];
  video: VideoProviderPort[];
  music: MusicProviderPort[];
} {
  const result: { tts: TTSProviderPort[]; video: VideoProviderPort[]; music: MusicProviderPort[] } = {
    tts: [],
    video: [],
    music: [],
  };
  for (const record of records) {
    if (!record.isActive) {
      continue;
    }
    const kind = resolveKind(record);
    const protocol = resolveProtocol(record, kind);
    const options = normalizeMediaProviderOptions(record.options);
    const baseURL = record.baseURL?.trim() ?? "";
    const shared = {
      provider: record.providerKey,
      label: record.label,
      description: record.description ?? undefined,
      apiKey: record.apiKey?.trim() || undefined,
      model: record.model?.trim() || null,
      options,
      costPerSecond: record.costPerSecond,
      currency: record.currency,
    };
    if (kind === "tts") {
      result.tts.push(
        protocol === "openai_speech"
          ? new OpenAiSpeechProvider({ ...shared, baseURL })
          : new HttpTTSProvider({
            ...shared,
            synthesizeUrl: joinUrl(baseURL, options.synthesizePath ?? DEFAULT_TTS_TASK_PATH),
            headers: options.headers,
            timeoutMs: options.timeoutMs,
          }),
      );
      continue;
    }
    if (kind === "video") {
      result.video.push(
        protocol === "openai_video"
          ? new OpenAiVideoProvider({
            ...shared,
            baseURL,
            supportsRefImages: record.supportsRefImages,
          })
          : new HttpVideoProvider({
            ...shared,
            createUrl: joinUrl(baseURL, options.createPath ?? DEFAULT_VIDEO_TASK_PATH),
            statusUrl: options.statusPath ? joinUrl(baseURL, options.statusPath) : undefined,
            headers: options.headers,
            timeoutMs: options.timeoutMs,
            supportsRefImages: record.supportsRefImages,
            kindLabel: "视频通道",
          }),
      );
      continue;
    }
    result.music.push(new HttpMusicProvider({
      ...shared,
      createUrl: joinUrl(baseURL, options.createPath ?? DEFAULT_MUSIC_TASK_PATH),
      statusUrl: options.statusPath ? joinUrl(baseURL, options.statusPath) : undefined,
      headers: options.headers,
      timeoutMs: options.timeoutMs,
      kindLabel: "配乐通道",
    }));
  }
  return result;
}

function validateCreateInput(input: CreateMediaProviderInput): {
  kind: MediaProviderKind;
  protocol: MediaProviderProtocol;
  providerKey: string;
  options: MediaProviderOptions;
} {
  if (!isMediaProviderKind(input.kind)) {
    throw new AppError("媒体通道类型不支持。", 400);
  }
  const protocol = input.protocol ?? defaultProtocolForKind(input.kind);
  if (!isProtocolAllowedForKind(input.kind, protocol)) {
    throw new AppError("媒体通道协议与通道类型不匹配。", 400);
  }
  const providerKey = normalizeMediaProviderKey(input.providerKey ?? input.label);
  if (isEnvPresetConflict(input.kind, providerKey)) {
    throw new AppError(`通道标识 ${providerKey} 已被环境变量预置通道占用，请换一个名称。`, 400);
  }
  const options = normalizeMediaProviderOptions(input.options);
  if (protocol !== "http_json" && !input.baseURL?.trim()) {
    throw new AppError("OpenAI 兼容协议需要填写接口地址。", 400);
  }
  const usesPath = options.synthesizePath ?? options.createPath ?? options.statusPath;
  if (protocol === "http_json" && !input.baseURL?.trim() && !usesPath) {
    throw new AppError("自定义端点需要填写接口地址或完整的请求路径。", 400);
  }
  return { kind: input.kind, protocol, providerKey, options };
}

function isEnvPresetConflict(kind: MediaProviderKind, providerKey: string): boolean {
  if (kind === "tts") {
    return ttsProviderRegistry.hasEnvProvider(providerKey);
  }
  if (kind === "video") {
    return videoProviderRegistry.hasEnvProvider(providerKey);
  }
  return musicProviderRegistry.hasEnvProvider(providerKey);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export class MediaProviderService {
  async list(): Promise<MediaProviderView[]> {
    const records = await prisma.mediaProvider.findMany({
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });
    return records.map((record) => toMediaProviderView(record as MediaProviderRecord));
  }

  async create(input: CreateMediaProviderInput): Promise<MediaProviderView> {
    const { kind, protocol, providerKey, options } = validateCreateInput(input);
    try {
      const created = await prisma.mediaProvider.create({
        data: {
          kind,
          providerKey,
          label: input.label.trim(),
          description: readText(input.description),
          protocol,
          baseURL: readText(input.baseURL),
          apiKey: readText(input.apiKey),
          model: readText(input.model),
          options: serializeMediaProviderOptions(options),
          isActive: input.isActive ?? true,
          supportsRefImages: input.supportsRefImages ?? false,
          costPerSecond: input.costPerSecond ?? 0,
          currency: readText(input.currency) ?? "CNY",
        },
      });
      await this.syncRegistries();
      return toMediaProviderView(created as MediaProviderRecord);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(`该能力下已存在标识为 ${providerKey} 的通道。`, 400);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateMediaProviderInput): Promise<MediaProviderView> {
    const existing = await prisma.mediaProvider.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("没有找到这个媒体通道。", 404);
    }
    const record = existing as MediaProviderRecord;
    const kind = input.kind && isMediaProviderKind(input.kind) ? input.kind : resolveKind(record);
    const protocol = input.protocol ?? resolveProtocol(record, kind);
    if (!isProtocolAllowedForKind(kind, protocol)) {
      throw new AppError("媒体通道协议与通道类型不匹配。", 400);
    }
    const providerKey = input.label || input.providerKey
      ? normalizeMediaProviderKey(input.providerKey ?? input.label ?? record.label)
      : record.providerKey;
    if (providerKey !== record.providerKey || kind !== record.kind) {
      if (isEnvPresetConflict(kind, providerKey)) {
        throw new AppError(`通道标识 ${providerKey} 已被环境变量预置通道占用，请换一个名称。`, 400);
      }
    }
    const baseURL = input.baseURL === undefined ? record.baseURL : readText(input.baseURL);
    if (protocol !== "http_json" && !baseURL) {
      throw new AppError("OpenAI 兼容协议需要填写接口地址。", 400);
    }
    const options = input.options === undefined
      ? normalizeMediaProviderOptions(record.options)
      : normalizeMediaProviderOptions(input.options);
    try {
      const updated = await prisma.mediaProvider.update({
        where: { id },
        data: {
          kind,
          providerKey,
          ...(input.label !== undefined ? { label: input.label.trim() } : {}),
          ...(input.description !== undefined ? { description: readText(input.description) } : {}),
          protocol,
          ...(input.baseURL !== undefined ? { baseURL } : {}),
          ...(input.apiKey !== undefined ? { apiKey: readText(input.apiKey) } : {}),
          ...(input.model !== undefined ? { model: readText(input.model) } : {}),
          ...(input.options !== undefined ? { options: serializeMediaProviderOptions(options) } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.supportsRefImages !== undefined ? { supportsRefImages: input.supportsRefImages } : {}),
          ...(input.costPerSecond !== undefined ? { costPerSecond: input.costPerSecond } : {}),
          ...(input.currency !== undefined ? { currency: readText(input.currency) ?? "CNY" } : {}),
        },
      });
      await this.syncRegistries();
      return toMediaProviderView(updated as MediaProviderRecord);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(`该能力下已存在标识为 ${providerKey} 的通道。`, 400);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await prisma.mediaProvider.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("没有找到这个媒体通道。", 404);
    }
    if ((existing as MediaProviderRecord).isBuiltin) {
      throw new AppError("系统内置通道不能删除，可以停用它。", 400);
    }
    await prisma.mediaProvider.delete({ where: { id } });
    await this.syncRegistries();
    return { id };
  }

  /** 把数据库里的启用通道同步进运行期注册表，删除的通道只影响数据库来源。 */
  async syncRegistries(): Promise<{ tts: number; video: number; music: number }> {
    const records = await prisma.mediaProvider.findMany({ where: { isActive: true } });
    const ports = buildMediaProviderPorts(records as MediaProviderRecord[]);
    ttsProviderRegistry.replaceDatabaseProviders(ports.tts);
    videoProviderRegistry.replaceDatabaseProviders(ports.video);
    musicProviderRegistry.replaceDatabaseProviders(ports.music);
    return { tts: ports.tts.length, video: ports.video.length, music: ports.music.length };
  }
}

export const mediaProviderService = new MediaProviderService();

/** 启动时加载数据库通道；失败不阻塞服务启动，运行期仍可用环境变量预置通道。 */
export async function syncMediaProviderRegistries(): Promise<{ tts: number; video: number; music: number }> {
  return mediaProviderService.syncRegistries();
}
