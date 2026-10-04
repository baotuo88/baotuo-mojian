import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";

export interface PanelArtifactSnapshot {
  id: string;
  order?: number;
  imageData: string | null;
  letteredData?: string | null;
  visualPrompt?: string | null;
  dialogues?: string | null;
  characterRefs?: string | null;
  sceneRef?: string | null;
}

export interface PublishedPanelImage {
  status: string;
  revision?: string;
  ext?: string;
  sourceFingerprint?: string;
  previousImage?: PublishedPanelImage;
  [key: string]: unknown;
}

export function parseArtifactData(raw: string | null | undefined): PublishedPanelImage | null {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as PublishedPanelImage : null;
  } catch { return null; }
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function panelSourceFingerprint(panel: PanelArtifactSnapshot): string {
  return digest({ visualPrompt: panel.visualPrompt ?? null, dialogues: panel.dialogues ?? null,
    characterRefs: panel.characterRefs ?? null, sceneRef: panel.sceneRef ?? null });
}

/** Generating/error metadata may retain one confirmed predecessor, never a directory fallback. */
export function confirmedPanelImage(panel: PanelArtifactSnapshot): PublishedPanelImage | null {
  const state = parseArtifactData(panel.imageData);
  const image = state?.status === "done" ? state : state?.previousImage;
  if (image?.status !== "done") return null;
  if (image.sourceFingerprint && image.sourceFingerprint !== panelSourceFingerprint(panel)) return null;
  return image;
}

export function letteringSourceFingerprint(panel: PanelArtifactSnapshot): string | null {
  const image = confirmedPanelImage(panel);
  return image ? digest({ image, sourceFingerprint: panelSourceFingerprint(panel) }) : null;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
export function panelRevisionPath(panelId: string, revision: string, ext: string, lettered = false): string {
  if (!SAFE_SEGMENT.test(panelId) || !SAFE_SEGMENT.test(revision) || !["png", "jpg", "webp"].includes(ext)) {
    throw new Error("Invalid comic image revision path");
  }
  return path.join(resolveGeneratedImagesRoot(), lettered ? "comic-panels-lettered" : "comic-panels",
    panelId, revision, `${lettered ? "lettered" : "panel"}.${ext}`);
}

export interface ResolvedPanelImage { filePath: string; ext: string; revision?: string; }

export async function resolvePanelImageFile(panel: PanelArtifactSnapshot): Promise<ResolvedPanelImage | null> {
  const image = confirmedPanelImage(panel);
  if (!image || !SAFE_SEGMENT.test(panel.id)) return null;
  if (image.revision) {
    if (typeof image.revision !== "string" || !SAFE_SEGMENT.test(image.revision) || !["png", "jpg", "webp"].includes(image.ext ?? "")) return null;
    const filePath = panelRevisionPath(panel.id, image.revision, image.ext!);
    try { await fs.access(filePath); return { filePath, ext: image.ext!, revision: image.revision }; } catch { return null; }
  }
  // Existing confirmed images used a fixed filename. New workers never write or delete these files.
  for (const ext of ["png", "jpg", "webp"]) {
    const filePath = path.join(resolveGeneratedImagesRoot(), "comic-panels", panel.id, `panel.${ext}`);
    try { await fs.access(filePath); return { filePath, ext }; } catch { /* try the legacy extension */ }
  }
  return null;
}

export async function resolveLetteredImageFile(panel: PanelArtifactSnapshot): Promise<ResolvedPanelImage | null> {
  const state = parseArtifactData(panel.letteredData);
  const sourceFingerprint = letteringSourceFingerprint(panel);
  if (!sourceFingerprint || state?.status !== "done" || state.sourceFingerprint !== sourceFingerprint
      || typeof state.revision !== "string" || !SAFE_SEGMENT.test(state.revision) || !SAFE_SEGMENT.test(panel.id)) return null;
  const filePath = panelRevisionPath(panel.id, state.revision, "png", true);
  try { await fs.access(filePath); return { filePath, ext: "png", revision: state.revision }; } catch { return null; }
}
