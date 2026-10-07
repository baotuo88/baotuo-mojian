import path from "node:path";
import sharp from "sharp";
import { AppError } from "../../../middleware/errorHandler";
import { throwIfExecutionAborted } from "../../../platform/execution";
import type { ExportArtifact, ExportFormat, ExportSpec } from "../ComicExportService";

const MAX_SLICE_PIXELS = 16_000_000;
const MAX_EDGE = 16_000; // Below WebP's dimension ceiling and safe for other supported encoders.
export interface ResolvedExportSpec {
  sliceWidth: number;
  sliceMaxHeight: number;
  outputFormat: "png" | "jpg" | "webp";
  quality: number;
}
export function resolveExportSpec(format: ExportFormat, spec: ExportSpec): ResolvedExportSpec {
  if (!["long_image", "sliced"].includes(format)) throw new AppError("请选择长图或切片导出。", 400);
  const sliceWidth = spec.sliceWidth ?? 800;
  const requestedHeight = spec.sliceMaxHeight ?? 0;
  const outputFormat = spec.outputFormat ?? "png";
  const quality = spec.quality ?? 90;
  if (
    !Number.isInteger(sliceWidth) ||
    sliceWidth < 1 ||
    sliceWidth > 4096 ||
    !Number.isInteger(requestedHeight) ||
    requestedHeight < 0 ||
    requestedHeight > MAX_EDGE ||
    !Number.isInteger(quality) ||
    quality < 1 ||
    quality > 100 ||
    !["png", "jpg", "webp"].includes(outputFormat)
  ) {
    throw new AppError(
      "导出宽度须为 1–4096 像素，切片高度须为 0–16000 像素，图片质量须为 1–100。",
      400,
    );
  }
  const safeHeight = Math.min(MAX_EDGE, Math.floor(MAX_SLICE_PIXELS / sliceWidth));
  return {
    sliceWidth,
    sliceMaxHeight: Math.min(
      requestedHeight || (format === "sliced" ? 8000 : safeHeight),
      safeHeight,
    ),
    outputFormat,
    quality,
  };
}

/** Render one bounded slice at a time; never allocate a full-episode canvas before slicing. */
export async function renderEpisodeArtifacts(input: {
  files: string[];
  jobDir: string;
  jobId: string;
  episodeOrder: number;
  spec: ResolvedExportSpec;
}): Promise<ExportArtifact[]> {
  const { spec, jobDir } = input;
  const panels: Array<{ filePath: string; top: number; height: number }> = [];
  let totalHeight = 0;
  for (const [index, file] of input.files.entries()) {
    throwIfExecutionAborted();
    const metadata = await sharp(file).metadata();
    if (!metadata.width || !metadata.height)
      throw new AppError(`第 ${index + 1} 格图片无法读取。`, 400);
    const height = Math.max(1, Math.round((metadata.height * spec.sliceWidth) / metadata.width));
    if (!Number.isSafeInteger(height) || height * spec.sliceWidth > 80_000_000) {
      throw new AppError(`第 ${index + 1} 格图片过长，请降低导出宽度。`, 400);
    }
    const normalized = path.join(jobDir, "inputs", `normalized-${index}.png`);
    await sharp(file).resize({ width: spec.sliceWidth, height }).png().toFile(normalized);
    panels.push({ filePath: normalized, top: totalHeight, height });
    totalHeight += height;
  }
  const count = Math.ceil(totalHeight / spec.sliceMaxHeight);
  const artifacts: ExportArtifact[] = [];
  for (let index = 0; index < count; index++) {
    throwIfExecutionAborted();
    const top = index * spec.sliceMaxHeight;
    const height = Math.min(spec.sliceMaxHeight, totalHeight - top);
    const composites: Array<{ input: Buffer; top: number; left: number }> = [];
    for (const panel of panels) {
      const overlapTop = Math.max(top, panel.top);
      const overlapBottom = Math.min(top + height, panel.top + panel.height);
      if (overlapTop >= overlapBottom) continue;
      const buffer = await sharp(panel.filePath)
        .extract({
          left: 0,
          top: overlapTop - panel.top,
          width: spec.sliceWidth,
          height: overlapBottom - overlapTop,
        })
        .png()
        .toBuffer();
      composites.push({ input: buffer, left: 0, top: overlapTop - top });
    }
    let output = sharp({
      create: { width: spec.sliceWidth, height, channels: 3, background: "white" },
    }).composite(composites);
    output =
      spec.outputFormat === "jpg"
        ? output.jpeg({ quality: spec.quality })
        : spec.outputFormat === "webp"
          ? output.webp({ quality: spec.quality })
          : output.png();
    const filename =
      count === 1
        ? `episode-${input.episodeOrder}.${spec.outputFormat}`
        : `slice-${String(index + 1).padStart(3, "0")}.${spec.outputFormat}`;
    const filePath = path.join(jobDir, filename);
    await output.toFile(filePath);
    artifacts.push({
      index: index + 1,
      filePath,
      url: `/api/comic/export-jobs/${input.jobId}/artifacts/${filename}`,
      width: spec.sliceWidth,
      height,
    });
  }
  return artifacts;
}
