import type { ComicPanel } from "@/api/comic";
import { readPanelImage } from "../assets/index.ts";

export interface ExportArtifactLink { url: string; index?: number; width?: number; height?: number }

export function parseExportArtifacts(raw: string | null | undefined): ExportArtifactLink[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ExportArtifactLink => Boolean(item && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("/api/comic/export-jobs/")));
  } catch { return []; }
}

export function missingPanelOrders(panels: ComicPanel[]): number[] {
  return panels.filter((panel) => readPanelImage(panel.imageData).status !== "done")
    .map((panel) => panel.order).sort((a, b) => a - b);
}
