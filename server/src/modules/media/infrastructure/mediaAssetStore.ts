import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveGeneratedMediaRoot } from "../../../runtime/appPaths";

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const EXTENSION_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  webm: "audio/webm",
  mp4: "video/mp4",
};

export const MEDIA_ASSET_KINDS = ["tts", "video", "music"] as const;
export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

const FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,120}$/;

export function isMediaAssetKind(value: unknown): value is MediaAssetKind {
  return typeof value === "string" && (MEDIA_ASSET_KINDS as readonly string[]).includes(value);
}

export function extensionForContentType(contentType: string | null | undefined): string {
  const normalized = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_EXTENSIONS[normalized] ?? "bin";
}

export function contentTypeForFileName(fileName: string): string {
  const extension = path.extname(fileName).replace(/^\./, "").toLowerCase();
  return EXTENSION_MIME[extension] ?? "application/octet-stream";
}

export function mediaAssetUrl(kind: MediaAssetKind, fileName: string): string {
  return `/api/media/assets/${kind}/${fileName}`;
}

/**
 * 收到的二进制音频/视频落盘到 storage/generated-media/<kind>/ 下，
 * 返回可被前端直接访问的地址。文件名只由后端生成，不接受上游输入。
 */
export async function saveMediaAsset(input: {
  kind: MediaAssetKind;
  bytes: Uint8Array;
  contentType?: string | null;
}): Promise<{ url: string; fileName: string; contentType: string }> {
  const extension = extensionForContentType(input.contentType);
  const fileName = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${extension}`;
  const directory = path.join(resolveGeneratedMediaRoot(), input.kind);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), input.bytes);
  return {
    url: mediaAssetUrl(input.kind, fileName),
    fileName,
    contentType: input.contentType?.split(";")[0]?.trim() || contentTypeForFileName(fileName),
  };
}

/** 发布后端生成的大文件；流式复制后原子改名，不把整个成片读入内存。 */
export async function publishMediaAssetFile(input: {
  kind: MediaAssetKind;
  filePath: string;
  contentType: string;
}): Promise<{ url: string; fileName: string; contentType: string }> {
  const fileName = `${Date.now().toString(36)}-${randomUUID()}.${extensionForContentType(input.contentType)}`;
  const target = resolveMediaAssetPath(input.kind, fileName);
  const temporary = `${target}.partial`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.copyFile(input.filePath, temporary);
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { url: mediaAssetUrl(input.kind, fileName), fileName, contentType: input.contentType };
}

/** 解析并校验落盘路径，阻断路径穿越。 */
export function resolveMediaAssetPath(kind: string, fileName: string): string {
  if (!isMediaAssetKind(kind)) {
    throw new Error("不支持的媒体资产类型。");
  }
  if (!FILE_NAME_PATTERN.test(fileName) || fileName.includes("..")) {
    throw new Error("媒体资产文件名不合法。");
  }
  return path.join(resolveGeneratedMediaRoot(), kind, fileName);
}
