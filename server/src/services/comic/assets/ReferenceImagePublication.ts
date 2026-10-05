import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import { throwIfExecutionAborted } from "../../../platform/execution";
import type { GeneratedImageState, ImageTargetAdapter } from "../../image/runtime";

export type ReferenceImageKind = "sheet" | "expression" | "asset" | "scene";
export interface ReferenceImageState extends GeneratedImageState {
  revision?: string;
  ext?: string;
  sourceFingerprint?: string;
  generationRevision?: string;
  legacyCurrent?: boolean;
  previousImage?: ReferenceImageState;
}
const locations = {
  sheet: ["comic-characters", "character-sheet"],
  expression: ["comic-characters", "character-expression"],
  asset: ["comic-character-assets", "asset"],
  scene: ["comic-scenes", "scene-sheet"],
} as const;
const mimeTypes = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const safeSegment = /^[A-Za-z0-9_-]+$/;

export function referenceSourceFingerprint(source: unknown): string {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

export function confirmedReferenceImage(raw: string | ReferenceImageState | null | undefined): ReferenceImageState | null {
  let state: ReferenceImageState | null;
  try { state = typeof raw === "string" ? JSON.parse(raw) : raw ?? null; } catch { return null; }
  const image = state?.status === "done" ? state : state?.previousImage;
  return image?.status === "done" ? image : null;
}

export function referenceImagePath(kind: ReferenceImageKind, id: string, revision: string, ext: string): string {
  if (!safeSegment.test(id) || !safeSegment.test(revision) || !Object.hasOwn(mimeTypes, ext)) {
    throw new AppError("图片版本信息无效，请重新生成。", 400);
  }
  const [directory, basename] = locations[kind];
  return path.join(resolveGeneratedImagesRoot(), directory, id, revision, `${basename}.${ext}`);
}

export async function resolveReferenceImageFile(kind: ReferenceImageKind, id: string,
  raw: string | ReferenceImageState | null | undefined, sourceFingerprint?: string, requestedRevision?: string,
): Promise<{ filePath: string; mimeType: string; revision?: string } | null> {
  let image = confirmedReferenceImage(raw);
  if (requestedRevision) {
    if (!safeSegment.test(requestedRevision)) return null;
    let state: ReferenceImageState | null;
    try { state = typeof raw === "string" ? JSON.parse(raw) : raw ?? null; } catch { return null; }
    if (image?.revision !== requestedRevision) {
      const history = [...(Array.isArray(state?.history) ? state.history : []), ...(Array.isArray(image?.history) ? image.history : [])];
      const archived = history.find(item => (item as ReferenceImageState).revision === requestedRevision);
      image = archived ? { ...archived, status: "done" } : null;
    }
  }
  if (!image || !safeSegment.test(id)) return null;
  if (!requestedRevision && sourceFingerprint && image.sourceFingerprint && image.sourceFingerprint !== sourceFingerprint) return null;
  if (image.revision) {
    if (typeof image.revision !== "string" || !safeSegment.test(image.revision) || !Object.hasOwn(mimeTypes, image.ext ?? "")) return null;
    const filePath = referenceImagePath(kind, id, image.revision, image.ext!);
    try { await fs.access(filePath); return { filePath, mimeType: mimeTypes[image.ext as keyof typeof mimeTypes], revision: image.revision }; }
    catch { return null; }
  }
  // Only confirmed legacy metadata can authorize the old fixed filename.
  const [directory, basename] = locations[kind];
  for (const [ext, mimeType] of Object.entries(mimeTypes)) {
    const filePath = path.join(resolveGeneratedImagesRoot(), directory, id, `${basename}.${ext}`);
    try { await fs.access(filePath); return { filePath, mimeType }; } catch { /* next legacy encoding */ }
  }
  return null;
}

/** The service owns source-column CAS; this module owns immutable files and publication states. */
export function createReferenceImageAdapter<T extends GeneratedImageState>(input: {
  kind: ReferenceImageKind;
  id: string;
  state: T;
  source: unknown;
  publicUrl: string;
  commit: (state: T) => Promise<boolean>;
  extraDone?: Partial<T>;
  versioning?: ImageTargetAdapter<T>["versioning"];
}): ImageTargetAdapter<T> {
  const revision = randomUUID();
  const sourceFingerprint = referenceSourceFingerprint(input.source);
  const previousImage = confirmedReferenceImage(input.state);
  const existing = previousImage ?? input.state;
  let extension = "png";
  const doneExtra = () => ({ revision, ext: extension, sourceFingerprint,
    previousImage: undefined, generationRevision: undefined, error: undefined, ...input.extraDone });
  return {
    kind: `comic.reference.${input.kind}:${input.id}`,
    loadState: async () => existing as T,
    versioning: input.versioning ?? { enabled: true, maxHistory: 5,
      archiveCurrent: async current => current.status === "done"
        ? { ...current, version: current.version ?? 1, history: undefined, previousImage: undefined } : null },
    async saveState(next) {
      throwIfExecutionAborted();
      if (next.status === "done") {
        const filename = referenceImagePath(input.kind, input.id, revision, extension);
        const meta = await sharp(filename).metadata();
        if (!meta.width || !meta.height || meta.width * meta.height > 80_000_000) {
          throw new AppError("图片无法读取或尺寸过大，请重新生成或上传有效图片。", 400);
        }
        await sharp(filename).resize(1, 1).raw().toBuffer();
      }
      const state = next.status === "done" ? { ...next, ...doneExtra() }
        : { ...next, generationRevision: revision, previousImage: previousImage ?? undefined };
      if (!await input.commit(state as T)) {
        if (next.status === "error") return;
        throw new AppError("素材或图片已更新，请刷新后重新生成。", 409);
      }
    },
    diskPath(ext) {
      throwIfExecutionAborted();
      extension = Object.hasOwn(mimeTypes, ext) ? ext : "png";
      return referenceImagePath(input.kind, input.id, revision, extension);
    },
    publicUrl: () => `${input.publicUrl}?revision=${revision}`,
    buildExtraDoneState: () => doneExtra() as unknown as Partial<T>,
  };
}

/** Uploads use the same validated immutable publication protocol as model results. */
export async function publishReferenceUpload<T extends GeneratedImageState>(
  adapter: ImageTargetAdapter<T>, buffer: Buffer, mimeType: string,
): Promise<{ url: string }> {
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mimeType];
  if (!ext) throw new AppError("请上传 PNG、JPG 或 WebP 图片。", 400);
  const meta = await sharp(buffer).metadata().catch(() => null);
  if (!meta || meta.format !== (ext === "jpg" ? "jpeg" : ext)) {
    throw new AppError("图片内容与文件类型不符，请重新选择有效图片。", 400);
  }
  const filePath = adapter.diskPath(ext);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer, { flag: "wx" });
  const existing = await adapter.loadState();
  const archived = adapter.versioning?.enabled && adapter.versioning.archiveCurrent
    ? await adapter.versioning.archiveCurrent(existing) : null;
  const history = [...(Array.isArray(existing.history) ? existing.history : []), ...(archived ? [archived] : [])]
    .slice(-(adapter.versioning?.maxHistory ?? 5));
  const url = adapter.publicUrl();
  await adapter.saveState({ status: "done", url, version: (existing.version ?? 0) + 1, history,
    origin: "uploaded", generatedAt: new Date().toISOString() } as T);
  return { url };
}
