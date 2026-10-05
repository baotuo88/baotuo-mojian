import { prisma } from "../../../db/prisma";
import type { GeneratedImageState } from "../../image/runtime";
import { confirmedReferenceImage, createReferenceImageAdapter, type ReferenceImageState } from "./ReferenceImagePublication";

interface CharacterSnapshot {
  id: string; name: string; gender: string; persona?: string | null; visualAnchor: string | null; sheetData: string | null;
  project: { stylePreset: string | null };
}
interface AssetSnapshot {
  id: string; name: string; assetType: string; description: string | null; imageData: string | null;
  character: Pick<CharacterSnapshot, "name" | "gender" | "visualAnchor" | "sheetData">;
  project: { stylePreset: string | null };
}
interface SceneSnapshot {
  id: string; name: string; sceneType: string; bible: string | null; sheetData: string | null;
  project: { stylePreset: string | null };
}
function parse<T extends GeneratedImageState>(raw: string | null): T {
  try { return JSON.parse(raw ?? "null") ?? { status: "idle" }; } catch { return { status: "idle" } as T; }
}
function sheetIdentity(raw: string | null) {
  const image = confirmedReferenceImage(raw);
  return image ? { revision: image.revision, ext: image.ext, version: image.version,
    url: image.url, sourceFingerprint: image.sourceFingerprint } : null;
}
export function characterImageSource(character: CharacterSnapshot, expression = false) {
  return { name: character.name, gender: character.gender, persona: character.persona ?? null,
    visualAnchor: character.visualAnchor, stylePreset: character.project.stylePreset,
    ...(expression ? { sheet: sheetIdentity(character.sheetData) } : {}) };
}
export function assetImageSource(asset: AssetSnapshot) {
  return { name: asset.name, assetType: asset.assetType, description: asset.description,
    characterName: asset.character.name, gender: asset.character.gender, visualAnchor: asset.character.visualAnchor,
    sheet: sheetIdentity(asset.character.sheetData), stylePreset: asset.project.stylePreset };
}
export function sceneImageSource(scene: SceneSnapshot) {
  return { name: scene.name, sceneType: scene.sceneType, bible: scene.bible, stylePreset: scene.project.stylePreset };
}

export function createCharacterReferenceAdapter<T extends GeneratedImageState>(character: CharacterSnapshot, expression = false) {
  type SheetState = ReferenceImageState & { assets?: { expression?: T } };
  const sheet = parse<SheetState>(character.sheetData);
  let expected = character.sheetData;
  return createReferenceImageAdapter<T>({
    kind: expression ? "expression" : "sheet", id: character.id,
    state: (expression ? sheet.assets?.expression ?? { status: "idle" } : sheet) as T,
    source: characterImageSource(character, expression),
    publicUrl: `/api/comic/character-images/${character.id}/${expression ? "expressions" : "sheet"}`,
    ...(!expression ? { extraDone: { assets: undefined } as unknown as Partial<T>, versioning: {
      enabled: true, maxHistory: 5,
      archiveCurrent: async (current: T) => current.status === "done" ? ({ ...current, version: current.version ?? 1,
        history: undefined, assets: undefined, previousImage: undefined,
        legacyCurrent: !(current as ReferenceImageState).revision,
        url: `/api/comic/character-images/${character.id}/sheet/v${current.version ?? 1}` }) : null,
    } } : {}),
    async commit(next) {
      // Compare the entire enclosing JSON. A nested expression must never merge over a newer sheet.
      const serialized = JSON.stringify(expression ? { ...sheet, assets: { ...sheet.assets, expression: next } } : next);
      const result = await prisma.comicCharacter.updateMany({
        where: { id: character.id, name: character.name, gender: character.gender,
          persona: character.persona ?? null, visualAnchor: character.visualAnchor,
          project: { stylePreset: character.project.stylePreset }, sheetData: expected },
        data: { sheetData: serialized },
      });
      if (result.count === 1) expected = serialized;
      return result.count === 1;
    },
  });
}

export function createAssetReferenceAdapter<T extends GeneratedImageState>(asset: AssetSnapshot, uploaded = false) {
  let expected = asset.imageData;
  return createReferenceImageAdapter<T>({
    kind: "asset", id: asset.id, state: parse<T>(expected), source: assetImageSource(asset),
    publicUrl: `/api/comic/character-assets/${asset.id}/image`,
    extraDone: { origin: uploaded ? "uploaded" : "generated" } as Partial<T>,
    async commit(next) {
      const serialized = JSON.stringify(next);
      const result = await prisma.comicCharacterAsset.updateMany({
        where: { id: asset.id, name: asset.name, assetType: asset.assetType, description: asset.description,
          imageData: expected, character: { name: asset.character.name, gender: asset.character.gender,
            visualAnchor: asset.character.visualAnchor, sheetData: asset.character.sheetData },
          project: { stylePreset: asset.project.stylePreset } },
        data: { imageData: serialized },
      });
      if (result.count === 1) expected = serialized;
      return result.count === 1;
    },
  });
}

export function createSceneReferenceAdapter<T extends GeneratedImageState>(scene: SceneSnapshot, uploaded = false) {
  let expected = scene.sheetData;
  return createReferenceImageAdapter<T>({
    kind: "scene", id: scene.id, state: parse<T>(expected), source: sceneImageSource(scene),
    publicUrl: `/api/comic/scenes/${scene.id}/image`,
    extraDone: { origin: uploaded ? "uploaded" : "generated" } as Partial<T>,
    async commit(next) {
      const serialized = JSON.stringify(next);
      const result = await prisma.comicScene.updateMany({
        where: { id: scene.id, name: scene.name, sceneType: scene.sceneType, bible: scene.bible,
          sheetData: expected, project: { stylePreset: scene.project.stylePreset } },
        data: { sheetData: serialized },
      });
      if (result.count === 1) expected = serialized;
      return result.count === 1;
    },
  });
}
