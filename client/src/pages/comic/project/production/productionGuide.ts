import type { ComicCharacter, ComicEpisode, ComicPanel } from "@/api/comic";
import { readPanelImage } from "../assets/index.ts";

export type ComicWorkspaceTab = "outline" | "characters" | "scenes" | "panels" | "export";
export type ProductionStep = "import" | "outline" | "script" | "characters" | "panels" | "export";

export function hasReadyCharacterSheet(character: ComicCharacter): boolean {
  try { return JSON.parse(character.sheetData ?? "null")?.status === "done"; } catch { return false; }
}

export function resolveProductionStep(input: {
  hasSource: boolean;
  episodes: ComicEpisode[];
  characters: ComicCharacter[];
  panels: ComicPanel[];
}): ProductionStep {
  if (!input.hasSource) return "import";
  const first = [...input.episodes].sort((a, b) => a.order - b.order)[0];
  if (!first) return "outline";
  if (Math.max(first._count?.panels ?? 0, first.panels?.length ?? 0, input.panels.length) === 0) return "script";
  if (input.characters.some((character) => !hasReadyCharacterSheet(character))) return "characters";
  if (input.panels.length === 0) return "panels";
  const allDone = input.panels.every((panel) => readPanelImage(panel.imageData).status === "done");
  return allDone ? "export" : "panels";
}
