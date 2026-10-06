import fs from "fs/promises";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import path from "path";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import { filterImageGenerationReferences, runImageGeneration, type ImageTargetAdapter } from "../../image/runtime";
import { safeJsonParse } from "../utils/json";
import { assertCurrentStoryboard, withCurrentShot } from "../revisions";
import { renderDramaKeyframePrompt } from "../../../prompting/prompts/drama/drama-keyframe.prompt";

export type ShotKeyframeStatus = "idle" | "generating" | "done" | "error";

export interface ShotKeyframeHistoryItem {
  version: number;
  fileName?: string;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

export interface ShotKeyframeData {
  status: ShotKeyframeStatus;
  version?: number;
  fileName?: string;
  generationId?: string;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: ShotKeyframeHistoryItem[];
}

interface CharacterLite {
  id: string;
  name: string;
  archetype?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
  portraitData?: string | null;
}

interface ShotKeyframeSource {
  id: string;
  order: number;
  shotSize?: string | null;
  cameraMove?: string | null;
  location?: string | null;
  action: string;
  dialogue?: string | null;
  characterRefs?: string | null;
  visualPrompt?: string | null;
  storyboard: {
    project: {
      id: string;
      characters: CharacterLite[];
    };
  };
}

const DRAMA_SHOT_IMAGES_DIR = "drama-shots";
const DEFAULT_PROVIDER: LLMProvider = "openai";
const KEYFRAME_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

function dramaShotDir(shotId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(shotId)) throw new AppError("镜头编号无效。", 400);
  return path.join(resolveGeneratedImagesRoot(), DRAMA_SHOT_IMAGES_DIR, shotId);
}

function archivedKeyframeUrl(shotId: string, version: number): string {
  return `/api/drama/shot-images/${shotId}/keyframe/v${version}`;
}


function normalizePositiveVersion(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function readKeyframeVersion(data: ShotKeyframeData): number {
  const explicit = normalizePositiveVersion(data.version);
  if (explicit) {
    return explicit;
  }
  return data.status === "done" ? 1 : 0;
}

function normalizeHistoryItem(input: unknown): ShotKeyframeHistoryItem | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const version = normalizePositiveVersion(record.version);
  if (!version) {
    return null;
  }
  return {
    version,
    fileName: typeof record.fileName === "string" ? record.fileName : undefined,
    url: typeof record.url === "string" && record.url.trim() ? record.url.trim() : undefined,
    prompt: typeof record.prompt === "string" ? record.prompt : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
  };
}

function readKeyframeHistory(data: ShotKeyframeData): ShotKeyframeHistoryItem[] {
  return Array.isArray(data.history)
    ? data.history.map(normalizeHistoryItem).filter((item): item is ShotKeyframeHistoryItem => Boolean(item))
    : [];
}

function normalizeReferenceKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(raw, raw ?? []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return [parsed.trim()];
  }
  return [];
}

function extractVisualDesc(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) {
    return "";
  }
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
    if (typeof parsed.visualAnchor === "string") return parsed.visualAnchor;
    return JSON.stringify(parsed);
  } catch {
    return visualAnchor;
  }
}

function selectReferencedCharacters(shot: ShotKeyframeSource): CharacterLite[] {
  const refs = parseCharacterRefs(shot.characterRefs);
  if (!refs.length) {
    return [];
  }
  const refKeys = new Set(refs.map(normalizeReferenceKey).filter((key): key is string => Boolean(key)));
  return shot.storyboard.project.characters.filter((character) => {
    const idKey = normalizeReferenceKey(character.id);
    const nameKey = normalizeReferenceKey(character.name);
    return Boolean((idKey && refKeys.has(idKey)) || (nameKey && refKeys.has(nameKey)));
  });
}

function resolveCharacterRefImageUrl(character: CharacterLite): string | null {
  if (!character.portraitData) return null;
  try {
    const pd = JSON.parse(character.portraitData) as { status?: string; url?: string };
    return pd.status === "done" && pd.url ? pd.url : null;
  } catch {
    return null;
  }
}

function buildCharacterPromptLine(character: CharacterLite): string {
  return [
    character.name,
    character.archetype ? `role: ${character.archetype}` : "",
    character.persona ? `persona: ${character.persona}` : "",
    extractVisualDesc(character.visualAnchor) ? `appearance: ${extractVisualDesc(character.visualAnchor)}` : "",
  ].filter(Boolean).join("; ");
}

function buildShotKeyframePrompt(shot: ShotKeyframeSource): string {
  return renderDramaKeyframePrompt({ ...shot, characters: selectReferencedCharacters(shot).map(buildCharacterPromptLine) });
}

export class DramaShotKeyframeService {
  private async buildKeyframeGenerationContext(
    shotId: string,
    useCharacterRefImages = false,
  ) {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: {
        storyboard: {
          include: {
            project: { include: { characters: true } },
          },
        },
      },
    });
    if (!shot) {
      throw new AppError(`未找到短剧镜头：${shotId}`, 404);
    }

    await assertCurrentStoryboard(shot.storyboardId);
    const prompt = buildShotKeyframePrompt(shot);
    const refImages: string[] = [];
    const referenceImages: import("../../image/runtime").GeneratedReferenceImageMeta[] = [];
    if (useCharacterRefImages) {
      const referencedChars = selectReferencedCharacters(shot);
      for (const char of referencedChars) {
        const url = resolveCharacterRefImageUrl(char);
        if (url) {
          refImages.push(url);
          referenceImages.push({
            kind: "character_sheet",
            label: `${char.name} · 角色设计稿`,
            url,
          });
        }
      }
    }

    // A request owns its files before it owns a database revision. Late results can
    // leave an unused file, but can never replace the bytes of a published image.
    const generationId = randomUUID();
    let expectedJson: string | null | undefined;
    let fileName: string | undefined;
    let outputVersion = 1;
    const adapter: ImageTargetAdapter<ShotKeyframeData> = {
      kind: `drama.shot.keyframe:${shotId}`,
      loadState: async () => withCurrentShot(shotId, async (_tx, current) => {
        if (current.action !== shot.action || current.dialogue !== shot.dialogue
          || current.visualPrompt !== shot.visualPrompt || current.characterRefs !== shot.characterRefs) {
          throw new AppError("镜头内容发生变化，请重新确认首帧画面。", 409);
        }
        const state = safeJsonParse<ShotKeyframeData>(current.keyframeData, { status: "idle" });
        if (state.status === "generating") throw new AppError("本镜头的首帧正在生成，请等待结果。", 409);
        expectedJson = current.keyframeData;
        return state;
      }),
      saveState: async (next) => {
        outputVersion = next.version ?? 1;
        // Mutating the object also keeps runImageGeneration's returned state exact.
        next.generationId = generationId;
        if (next.status === "done") next.fileName = fileName;
        const serialized = JSON.stringify(next);
        await withCurrentShot(shotId, async (tx) => {
          const saved = await tx.dramaShot.updateMany({
            where: { id: shotId, keyframeData: expectedJson ?? null },
            data: { keyframeData: serialized },
          });
          if (saved.count !== 1) throw new AppError("本镜头的首帧任务有变化，请查看最新结果。", 409);
        });
        expectedJson = serialized;
      },
      diskPath: (ext) => {
        const supportedExt = ext === "jpeg" ? "jpg" : ext;
        if (!KEYFRAME_EXTS.some(([allowed]) => allowed === supportedExt)) {
          throw new AppError("图片通道返回了不支持的格式，请使用 PNG、JPEG 或 WebP。", 422);
        }
        fileName = `keyframe.${generationId}.${supportedExt}`;
        return path.join(dramaShotDir(shotId), fileName);
      },
      publicUrl: () => archivedKeyframeUrl(shotId, outputVersion),
      versioning: {
        enabled: true,
        // Version URLs are also provider references; keep their immutable file
        // mapping even after more than five regenerations.
        maxHistory: Number.MAX_SAFE_INTEGER,
        archiveCurrent: (current) => this.archiveCurrentKeyframe(shotId, current),
      },
    };

    return {
      adapter,
      prompt,
      refImages,
      referenceImages,
      size: "1024x1536" as const,
      negativePrompt: "low quality, blurry, distorted face, extra fingers, duplicate body, text, watermark, subtitles",
      title: `生成镜头 ${shot.order} 首帧图`,
    };
  }

  async prepareKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = false,
  ): Promise<import("../../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildKeyframeGenerationContext(shotId, useCharacterRefImages);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      negativePrompt: ctx.negativePrompt,
      referenceImages: ctx.referenceImages,
      provider,
      size: ctx.size,
    };
  }

  async generateKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = false,
    overrides?: import("../../image/runtime").ImageGenerationOverrides,
  ): Promise<ShotKeyframeData> {
    const ctx = await this.buildKeyframeGenerationContext(shotId, useCharacterRefImages);
    const refs = filterImageGenerationReferences({
      refImages: ctx.refImages,
      referenceImages: ctx.referenceImages,
      excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls,
    });
    return runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
      negativePrompt: overrides?.negativePromptOverride ?? ctx.negativePrompt,
      ...(refs.refImages && refs.refImages.length > 0 ? { refImages: refs.refImages } : {}),
      referenceImages: refs.referenceImages && refs.referenceImages.length > 0 ? refs.referenceImages : undefined,
    });
  }

  private async archiveCurrentKeyframe(shotId: string, data: ShotKeyframeData): Promise<ShotKeyframeHistoryItem | null> {
    if (data.status !== "done") {
      return null;
    }
    const version = readKeyframeVersion(data);
    if (!version) {
      return null;
    }
    if (data.fileName) {
      return { version, fileName: data.fileName, url: archivedKeyframeUrl(shotId, version),
        prompt: data.prompt, provider: data.provider, generatedAt: data.generatedAt };
    }
    const resolved = await this.resolveExistingKeyframePath(shotId);
    const historyItem: ShotKeyframeHistoryItem = {
      version,
      prompt: data.prompt,
      provider: data.provider,
      generatedAt: data.generatedAt,
    };
    if (!resolved) {
      return historyItem;
    }
    const ext = path.extname(resolved.filePath).replace(".", "").toLowerCase() || "png";
    const archivePath = path.join(dramaShotDir(shotId), `keyframe.v${version}.${ext}`);
    try {
      await fs.copyFile(resolved.filePath, archivePath, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return {
      ...historyItem,
      url: archivedKeyframeUrl(shotId, version),
    };
  }

  async resolveExistingKeyframePath(shotId: string): Promise<{ filePath: string; mimeType: string } | null> {
    const shot = await prisma.dramaShot.findUnique({ where: { id: shotId }, select: { keyframeData: true } });
    if (!shot) return null;
    const state = safeJsonParse<ShotKeyframeData>(shot.keyframeData, { status: "idle" });
    if (state.fileName) return this.resolveImmutableFile(shotId, state.fileName);
    const dir = dramaShotDir(shotId);
    for (const [ext, mimeType] of KEYFRAME_EXTS) {
      const filePath = path.join(dir, `keyframe.${ext}`);
      try {
        await fs.access(filePath);
        return { filePath, mimeType };
      } catch {
        // Try the next supported extension.
      }
    }
    return null;
  }

  private async resolveImmutableFile(shotId: string, fileName: string) {
    if (!/^keyframe\.[a-f0-9-]{36}\.(png|jpg|webp)$/.test(fileName)) return null;
    const mimeType = KEYFRAME_EXTS.find(([ext]) => fileName.endsWith(`.${ext}`))?.[1];
    if (!mimeType) return null;
    const filePath = path.join(dramaShotDir(shotId), fileName);
    try { await fs.access(filePath); return { filePath, mimeType }; } catch { return null; }
  }

  async resolveArchivedKeyframePath(shotId: string, version: number): Promise<{ filePath: string; mimeType: string } | null> {
    const shot = await prisma.dramaShot.findUnique({ where: { id: shotId }, select: { keyframeData: true } });
    if (!shot) return null;
    const state = safeJsonParse<ShotKeyframeData>(shot.keyframeData, { status: "idle" });
    const entry = readKeyframeVersion(state) === version && state.status === "done"
      ? state : readKeyframeHistory(state).find((item) => item.version === version);
    if (entry?.fileName) return this.resolveImmutableFile(shotId, entry.fileName);
    const dir = dramaShotDir(shotId);
    for (const [ext, mimeType] of KEYFRAME_EXTS) {
      const filePath = path.join(dir, `keyframe.v${version}.${ext}`);
      try {
        await fs.access(filePath);
        return { filePath, mimeType };
      } catch {
        // Try the next supported extension.
      }
    }
    return null;
  }
}

export const dramaShotKeyframeService = new DramaShotKeyframeService();
