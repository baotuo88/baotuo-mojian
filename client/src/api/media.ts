import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export type MediaProviderKind = "tts" | "video" | "music";

export type MediaProviderProtocol = "openai_speech" | "openai_video" | "http_json";

/** 协议扩展项；留空时运行时会按协议内置约定拼装请求。 */
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

export interface MediaProviderProtocolMeta {
  protocol: MediaProviderProtocol;
  label: string;
}

export interface MediaProviderKindMeta {
  kind: MediaProviderKind;
  label: string;
  protocols: MediaProviderProtocolMeta[];
}

export interface MediaProviderListPayload {
  providers: MediaProviderView[];
  kinds: MediaProviderKindMeta[];
}

export interface CreateMediaProviderInput {
  kind: MediaProviderKind;
  providerKey?: string;
  label: string;
  description?: string;
  protocol?: MediaProviderProtocol;
  baseURL?: string;
  apiKey?: string;
  model?: string;
  options?: MediaProviderOptions;
  isActive?: boolean;
  supportsRefImages?: boolean;
  costPerSecond?: number;
  currency?: string;
}

/** 更新时传入 null 表示清空已保存的密钥；省略 apiKey 表示保持原有密钥不变。 */
export type UpdateMediaProviderInput = Omit<Partial<CreateMediaProviderInput>, "apiKey"> & {
  apiKey?: string | null;
};

export async function listMediaProviders(): Promise<ApiResponse<MediaProviderListPayload>> {
  const { data } = await apiClient.get<ApiResponse<MediaProviderListPayload>>("/media/providers");
  return data;
}

export async function createMediaProvider(
  payload: CreateMediaProviderInput,
): Promise<ApiResponse<MediaProviderView>> {
  const { data } = await apiClient.post<ApiResponse<MediaProviderView>>("/media/providers", payload);
  return data;
}

export async function updateMediaProvider(
  id: string,
  payload: UpdateMediaProviderInput,
): Promise<ApiResponse<MediaProviderView>> {
  const { data } = await apiClient.patch<ApiResponse<MediaProviderView>>(`/media/providers/${id}`, payload);
  return data;
}

export async function deleteMediaProvider(id: string): Promise<ApiResponse<{ id: string }>> {
  const { data } = await apiClient.delete<ApiResponse<{ id: string }>>(`/media/providers/${id}`);
  return data;
}
