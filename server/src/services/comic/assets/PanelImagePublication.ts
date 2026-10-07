import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { throwIfExecutionAborted } from "../../../platform/execution";
import type { ImageTargetAdapter } from "../../image/runtime";
import type { PanelImageData } from "../ComicPanelImageService";
import {
  confirmedPanelImage,
  panelRevisionPath,
  panelSourceFingerprint,
  type PanelArtifactSnapshot,
} from "./PanelArtifactSource";

/** Each worker owns an immutable file revision and may only publish against its captured source. */
export function createPanelImageAdapter(
  panel: PanelArtifactSnapshot,
): ImageTargetAdapter<PanelImageData> {
  const revision = randomUUID();
  const sourceFingerprint = panelSourceFingerprint(panel);
  const previousImage = confirmedPanelImage(panel);
  let expectedImageData = panel.imageData;
  let extension = "png";
  const sourceWhere = {
    id: panel.id,
    visualPrompt: panel.visualPrompt ?? null,
    dialogues: panel.dialogues ?? null,
    characterRefs: panel.characterRefs ?? null,
    sceneRef: panel.sceneRef ?? null,
  };
  return {
    kind: `comic.panel:${panel.id}`,
    loadState: async () => (previousImage as PanelImageData | null) ?? { status: "idle" },
    async saveState(next) {
      throwIfExecutionAborted();
      if (next.status === "done") {
        // A downloadable but invalid image must never become the confirmed version.
        const metadata = await sharp(panelRevisionPath(panel.id, revision, extension)).metadata();
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > 80_000_000) {
          throw new AppError("图片生成结果无法读取或尺寸过大，请重新生成。", 502);
        }
        await sharp(panelRevisionPath(panel.id, revision, extension))
          .resize(1, 1)
          .raw()
          .toBuffer();
      }
      const state =
        next.status === "done"
          ? { ...next, revision, ext: extension, sourceFingerprint }
          : { ...next, generationRevision: revision, previousImage: previousImage ?? undefined };
      const serialized = JSON.stringify(state);
      const result = await prisma.comicPanel.updateMany({
        where: { ...sourceWhere, imageData: expectedImageData },
        data: { imageData: serialized, ...(next.status === "done" ? { letteredData: null } : {}) },
      });
      if (result.count !== 1) {
        // The shared runner reports the original error after this callback. Do not mask it or overwrite a successor.
        if (next.status === "error") return;
        throw new AppError("该格的分镜或图片已更新，请刷新后重新生成。", 409);
      }
      expectedImageData = serialized;
    },
    diskPath(ext) {
      throwIfExecutionAborted();
      extension = ["png", "jpg", "webp"].includes(ext) ? ext : "png";
      return panelRevisionPath(panel.id, revision, extension);
    },
    publicUrl: () => `/api/comic/panel-images/${panel.id}/panel?revision=${revision}`,
    buildExtraDoneState: () => ({ revision, ext: extension, sourceFingerprint }),
  };
}
