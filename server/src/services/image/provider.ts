import fs from "fs/promises";
import path from "path";
import os from "node:os";
import sharp from "sharp";

import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { imageGenerationConfig } from "../../config/imageGeneration";
import { getExecutionAbortSignal, throwIfExecutionAborted } from "../../platform/execution";
import { AppError } from "../../middleware/errorHandler";
import { saveImageToDisk } from "./infrastructure";
import {
  getProviderDefaultBaseUrl,
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  providerRequiresApiKey,
} from "../../llm/providers";
import {
  getDefaultImageModel,
  getProviderImageModel,
  supportsImageModelSettings,
} from "../settings/ProviderImageSettingsService";
import type {
  ImageBackground,
  ImageModerationLevel,
  ImageOutputFormat,
  ImageProviderGenerateInput,
  ImageProviderGenerateResult,
  ImageQuality,
} from "./types";

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

interface ProviderSecret {
  apiKey?: string;
  baseURL: string;
}

function mapSizeToAspectRatio(size: string): string | undefined {
  const mapping: Record<string, string> = {
    "512x512": "1:1",
    "768x768": "1:1",
    "1024x1024": "1:1",
    "1024x1536": "2:3",
    "1536x1024": "3:2",
  };
  return mapping[size];
}

async function resolveProviderSecret(provider: LLMProvider): Promise<ProviderSecret> {
  let savedApiKey: string | undefined;
  let savedBaseURL: string | undefined;

  try {
    const config = await prisma.aPIKey.findUnique({
      where: { provider },
    });
    if (config?.isActive) {
      savedApiKey = config.key?.trim() || undefined;
      savedBaseURL = config.baseURL?.trim() || undefined;
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const finalApiKey = savedApiKey ?? getProviderEnvApiKey(provider);
  if (providerRequiresApiKey(provider) && !finalApiKey) {
    throw new Error(`Provider ${provider} API key is not configured.`);
  }

  const baseURLSource = savedBaseURL ?? getProviderEnvBaseUrl(provider) ?? getProviderDefaultBaseUrl(provider);
  if (!baseURLSource) {
    throw new Error(`Provider ${provider} API URL is not configured.`);
  }
  const baseURL = normalizeBaseUrl(baseURLSource);
  return { apiKey: finalApiKey, baseURL };
}

function parseImagesFromPayload(payload: unknown, outputFormat: ImageOutputFormat = "png"): Array<{
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}> {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return [];
  }
  const images: Array<{
    url: string;
    mimeType?: string;
    width?: number;
    height?: number;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const item of data) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as {
      url?: unknown;
      b64_json?: unknown;
      mime_type?: unknown;
      width?: unknown;
      height?: unknown;
    };
    const mimeType = typeof row.mime_type === "string" && ["image/png", "image/jpeg", "image/webp"].includes(row.mime_type)
      ? row.mime_type : `image/${outputFormat}`;
    const rawUrl = typeof row.url === "string"
      ? row.url
      : typeof row.b64_json === "string"
        ? `data:${mimeType};base64,${row.b64_json}`
        : "";
    if (!rawUrl) {
      continue;
    }
    images.push({
      url: rawUrl,
      mimeType,
      width: typeof row.width === "number" ? row.width : undefined,
      height: typeof row.height === "number" ? row.height : undefined,
      metadata: {},
    });
  }
  return images;
}

function buildPrompt(prompt: string, negativePrompt?: string): string {
  const cleanPrompt = prompt.trim();
  const cleanNegativePrompt = negativePrompt?.trim();
  if (!cleanNegativePrompt) {
    return cleanPrompt;
  }
  return `${cleanPrompt}\n\nAvoid: ${cleanNegativePrompt}`;
}

function normalizeOptionalEnum<T extends string>(value: T | undefined, skipValues: readonly T[]): T | undefined {
  if (!value || skipValues.includes(value)) {
    return undefined;
  }
  return value;
}

export function buildImageGenerationRequestBody(input: ImageProviderGenerateInput): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: input.model,
    prompt: buildPrompt(input.prompt, input.negativePrompt),
    n: input.count,
  };

  if (input.provider === "grok") {
    const aspectRatio = mapSizeToAspectRatio(input.size);
    if (aspectRatio) {
      requestBody.aspect_ratio = aspectRatio;
    }
    requestBody.resolution = "1k";
  } else {
    requestBody.size = input.size;
    const quality = normalizeOptionalEnum<ImageQuality>(input.quality, ["auto"]);
    const background = normalizeOptionalEnum<ImageBackground>(input.background, ["auto"]);
    const moderation = normalizeOptionalEnum<ImageModerationLevel>(input.moderation, ["auto"]);
    const outputFormat = input.outputFormat;
    if (quality) {
      requestBody.quality = quality;
    }
    if (background) {
      requestBody.background = background;
    }
    if (moderation) {
      requestBody.moderation = moderation;
    }
    if (outputFormat) {
      requestBody.output_format = outputFormat;
    }
    if (typeof input.outputCompression === "number" && Number.isFinite(input.outputCompression)) {
      requestBody.output_compression = Math.max(0, Math.min(100, Math.floor(input.outputCompression)));
    }
  }

  return requestBody;
}

export function isImageProviderSupported(provider: LLMProvider): boolean {
  return supportsImageModelSettings(provider);
}

export async function resolveImageModel(provider: LLMProvider, model?: string): Promise<string> {
  const resolved = model?.trim()
    || await getProviderImageModel(provider)
    || getDefaultImageModel(provider);
  if (!resolved) {
    throw new Error(`No default image model configured for provider=${provider}.`);
  }
  return resolved;
}

/**
 * Every selected reference is uploaded to the edits endpoint in order.
 * Bound individual files and the complete multipart payload before contacting the model.
 */
async function generateWithFileRef(
  input: ImageProviderGenerateInput,
  apiKey: string | undefined,
  baseURL: string,
  signal: AbortSignal,
): Promise<ImageProviderGenerateResult> {
  const temporary = input.refImages?.length ? await fs.mkdtemp(path.join(os.tmpdir(), "image-references-")) : undefined;
  try {
    const paths = [...(input.refImagePaths ?? [])];
    const maxFileBytes = 20 * 1024 * 1024;
    const maxTotalBytes = 64 * 1024 * 1024;
    const tooLarge = () => new AppError("参考图单张不能超过 20 MB，总大小不能超过 64 MB，请缩小图片或减少参考图。", 400);
    let stagedBytes = 0;
    for (const referencePath of paths) {
      signal.throwIfAborted();
      const stat = await fs.stat(referencePath);
      stagedBytes += stat.size;
      if (!stat.isFile() || stat.size > maxFileBytes || stagedBytes > maxTotalBytes) throw tooLarge();
    }
    for (const [index, url] of (input.refImages ?? []).entries()) {
      const remainingBytes = maxTotalBytes - stagedBytes;
      if (remainingBytes <= 0) throw tooLarge();
      const destination = path.join(temporary!, `reference-${index}`);
      await saveImageToDisk(url, destination, { maxBytes: Math.min(maxFileBytes, remainingBytes), signal });
      stagedBytes += (await fs.stat(destination)).size;
      paths.push(destination);
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(buildImageGenerationRequestBody(input))) {
      form.append(key, String(value));
    }
    let totalBytes = 0;
    for (const [index, referencePath] of paths.entries()) {
      signal.throwIfAborted();
      const stat = await fs.stat(referencePath);
      totalBytes += stat.size;
      if (!stat.isFile() || stat.size > maxFileBytes || totalBytes > maxTotalBytes) throw tooLarge();
      const fileBuffer = await fs.readFile(referencePath, { signal });
      const { format } = await sharp(fileBuffer).metadata();
      if (format !== "png" && format !== "jpeg" && format !== "webp") {
        throw new AppError("参考图需要使用 PNG、JPEG 或 WebP 格式。", 400);
      }
      form.append(paths.length === 1 ? "image" : "image[]", new Blob([fileBuffer], { type: `image/${format}` }), `reference-${index}.${format}`);
    }

    signal.throwIfAborted();
    const response = await fetch(`${baseURL}/images/edits`, {
      method: "POST",
      headers: {
        // FormData 自动设置 Content-Type: multipart/form-data; boundary=...
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: form,
      signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Image API (edits) request failed (${response.status}): ${detail || "unknown error"}`);
    }

    const payload = (await response.json()) as unknown;
    const images = parseImagesFromPayload(payload, input.outputFormat);
    if (images.length === 0) {
      throw new Error("Image API returned empty data.");
    }
    return {
      provider: input.provider,
      model: input.model,
      images: images.map((item, index) => ({
        ...item,
        seed: typeof input.seed === "number" ? input.seed + index : undefined,
      })),
    };
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}

export async function generateImagesByProvider(input: ImageProviderGenerateInput): Promise<ImageProviderGenerateResult> {
  throwIfExecutionAborted();
  if (!isImageProviderSupported(input.provider)) {
    throw new Error(`Provider ${input.provider} does not support image generation currently.`);
  }

  const referenceCount = (input.refImagePaths?.length ?? 0) + (input.refImages?.length ?? 0);
  if (referenceCount > 16) throw new AppError("最多使用 16 张参考图，请取消部分参考图后重试。", 400);
  if (referenceCount && input.provider === "grok") {
    throw new AppError("此图片通道未接入参考图，请选择支持参考图的通道，或取消所有参考图。", 400);
  }

  const { apiKey, baseURL } = await resolveProviderSecret(input.provider);
  const controller = new AbortController();
  const executionSignal = getExecutionAbortSignal();
  const signal = executionSignal ? AbortSignal.any([controller.signal, executionSignal]) : controller.signal;
  const timeoutMs = imageGenerationConfig.httpTimeoutMs;
  const timeout = setTimeout(
    () => controller.abort(new Error(`Image generation request timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );

  try {
    signal.throwIfAborted();
    if (referenceCount) {
      return await generateWithFileRef(input, apiKey, baseURL, signal);
    }

    const requestBody = buildImageGenerationRequestBody(input);

    const response = await fetch(`${baseURL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Image API request failed (${response.status}): ${detail || "unknown error"}`);
    }

    const payload = (await response.json()) as unknown;
    const images = parseImagesFromPayload(payload, input.outputFormat);
    if (images.length === 0) {
      throw new Error("Image API returned empty data.");
    }

    return {
      provider: input.provider,
      model: input.model,
      images: images.map((item, index) => ({
        ...item,
        seed: typeof input.seed === "number" ? input.seed + index : undefined,
      })),
    };
  } finally {
    clearTimeout(timeout);
  }
}
