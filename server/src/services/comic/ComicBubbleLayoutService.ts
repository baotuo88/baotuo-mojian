/**
 * 气泡排版引擎
 *
 * 输入：ComicPanel（含 imageData 路径 + dialogues JSON）
 * 输出：格子图 + 气泡合成后的新图（写入 ComicPanel.letteredData 路径）
 *
 * 实现：sharp + 手写 SVG 气泡模板，librsvg 渲染，不依赖 headless 浏览器。
 * 中文字体：按优先级降序尝试系统字体，均不可用时降级为无衬线字体（librsvg 兜底）。
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import type * as SharpNS from "sharp";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { randomUUID } from "node:crypto";
import { throwIfExecutionAborted } from "../../platform/execution";
import {
  letteringSourceFingerprint,
  panelRevisionPath,
  resolveLetteredImageFile,
  resolvePanelImageFile,
} from "./assets";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BubbleType = "round" | "spike" | "cloud" | "caption";
export type AnchorHint =
  | "top-left"
  | "top-center"
  | "top-right"
  | "mid-left"
  | "mid-center"
  | "mid-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface Dialogue {
  speaker: string;
  text: string;
  bubbleType: BubbleType;
  anchorHint?: string;
}

export interface LetterPanelOptions {
  /** 气泡背景不透明度（0-1），默认 0.95 */
  bubbleOpacity?: number;
  /** 最大气泡宽度（像素），默认为图宽 * 0.45 */
  maxBubbleWidthRatio?: number;
}

export interface LetterPanelResult {
  buffer: Buffer;
  ext: string;
  width: number;
  height: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CJK_FONT_STACK = `"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans CN", sans-serif`;
const DEFAULT_FONT_SIZE = 24;
const BUBBLE_PADDING = 16;
const LINE_HEIGHT_RATIO = 1.45;
const MAX_CHARS_PER_LINE = 10;

// 锚点位置 → [x%, y%]（相对图片宽高的百分比）
const ANCHOR_POSITIONS: Record<string, [number, number]> = {
  "top-left": [0.18, 0.12],
  "top-center": [0.5, 0.12],
  "top-right": [0.82, 0.12],
  "mid-left": [0.18, 0.5],
  "mid-center": [0.5, 0.5],
  "mid-right": [0.82, 0.5],
  "bottom-left": [0.18, 0.88],
  "bottom-center": [0.5, 0.88],
  "bottom-right": [0.82, 0.88],
};
// 默认排列顺序（anchorHint 缺失时按话序占用格点）
const DEFAULT_ANCHOR_ORDER: AnchorHint[] = [
  "top-right",
  "top-left",
  "mid-right",
  "mid-left",
  "bottom-right",
  "bottom-left",
];

// ─── SVG 生成 ─────────────────────────────────────────────────────────────────

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    current += char;
    if (current.length >= maxCharsPerLine) {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/**
 * 生成单个气泡的 SVG 字符串（坐标相对于气泡自身左上角）。
 * cx/cy 是气泡中心在整图中的坐标（像素）。
 */
function buildBubbleSvg(
  dialogue: Dialogue,
  cx: number,
  cy: number,
  imgWidth: number,
  imgHeight: number,
  opts: LetterPanelOptions,
): { svgStr: string; bw: number; bh: number; bx: number; by: number } {
  const fontSize = Math.max(8, Math.min(DEFAULT_FONT_SIZE, Math.floor(imgWidth / 20)));
  const padding = Math.min(BUBBLE_PADDING, Math.max(2, Math.floor(imgWidth / 40)));
  const maxBubbleWidth = Math.floor((opts.maxBubbleWidthRatio ?? 0.42) * imgWidth);
  const lineHeightPx = Math.ceil(fontSize * LINE_HEIGHT_RATIO);
  const charsPerLine = Math.max(
    1,
    Math.min(MAX_CHARS_PER_LINE, Math.floor(maxBubbleWidth / (fontSize * 0.8))),
  );
  const lines = wrapText(dialogue.text, charsPerLine);

  const textW = Math.min(
    lines.reduce((max, l) => Math.max(max, l.length), 0) * fontSize * 0.85,
    maxBubbleWidth,
  );
  const textH = lines.length * lineHeightPx;
  const bw = Math.ceil(textW + padding * 2);
  const bh = Math.ceil(textH + padding * 2);
  if (bw + 8 > imgWidth || bh + 8 > imgHeight) {
    throw new AppError("该格对白较长，无法完整放入气泡。请缩短对白或使用更大的图片。", 400);
  }

  // 气泡左上角坐标（保证在图内）
  let bx = Math.round(cx - bw / 2);
  let by = Math.round(cy - bh / 2);
  bx = Math.max(4, Math.min(imgWidth - bw - 4, bx));
  by = Math.max(4, Math.min(imgHeight - bh - 4, by));

  const opacity = opts.bubbleOpacity ?? 0.95;
  const textY0 = padding + fontSize;

  const textElems = lines
    .map(
      (line, i) =>
        `<text x="${padding}" y="${textY0 + i * lineHeightPx}"
      font-family="${escapeXml(CJK_FONT_STACK)}"
      font-size="${fontSize}"
      fill="#1a1a1a">${escapeXml(line)}</text>`,
    )
    .join("\n");

  let bgShape = "";
  switch (dialogue.bubbleType) {
    case "round": {
      const rx = bw / 2;
      const ry = bh / 2;
      bgShape = `<ellipse cx="${bw / 2}" cy="${bh / 2}" rx="${rx}" ry="${ry}"
        fill="white" fill-opacity="${opacity}" stroke="#333" stroke-width="1.5"/>`;
      break;
    }
    case "spike": {
      // 尖角气泡：矩形 + 外圆角 + 锯齿描边
      bgShape = `<rect x="2" y="2" width="${bw - 4}" height="${bh - 4}" rx="4" ry="4"
        fill="white" fill-opacity="${opacity}" stroke="#e53e3e" stroke-width="2" stroke-dasharray="6 2"/>`;
      break;
    }
    case "cloud": {
      // 思维云泡：多个圆形叠加近似
      const r = Math.min(bw, bh) * 0.35;
      bgShape = `
        <circle cx="${bw * 0.3}" cy="${bh * 0.45}" r="${r * 0.85}" fill="white" fill-opacity="${opacity}" stroke="#333" stroke-width="1"/>
        <circle cx="${bw * 0.55}" cy="${bh * 0.38}" r="${r * 0.9}" fill="white" fill-opacity="${opacity}" stroke="#333" stroke-width="1"/>
        <circle cx="${bw * 0.72}" cy="${bh * 0.48}" r="${r * 0.82}" fill="white" fill-opacity="${opacity}" stroke="#333" stroke-width="1"/>
        <ellipse cx="${bw / 2}" cy="${bh * 0.62}" rx="${bw * 0.42}" ry="${bh * 0.3}"
          fill="white" fill-opacity="${opacity}" stroke="#333" stroke-width="1"/>`;
      break;
    }
    case "caption": {
      bgShape = `<rect x="0" y="0" width="${bw}" height="${bh}"
        fill="#1a1a1a" fill-opacity="0.78" rx="3" ry="3"/>`;
      break;
    }
    default: {
      bgShape = `<rect x="0" y="0" width="${bw}" height="${bh}" rx="${Math.min(bw, bh) * 0.15}" ry="${Math.min(bw, bh) * 0.15}"
        fill="white" fill-opacity="${opacity}" stroke="#333" stroke-width="1.5"/>`;
    }
  }

  const textFill = dialogue.bubbleType === "caption" ? "#f5f0e8" : "#1a1a1a";
  const textElemsAdj = lines
    .map(
      (line, i) =>
        `<text x="${bw / 2}" y="${textY0 + i * lineHeightPx - 4}"
      font-family="${escapeXml(CJK_FONT_STACK)}"
      font-size="${fontSize}"
      text-anchor="middle"
      fill="${textFill}">${escapeXml(line)}</text>`,
    )
    .join("\n");

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}">
${bgShape}
${textElemsAdj}
</svg>`;

  return { svgStr, bw, bh, bx, by };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComicBubbleLayoutService {
  /**
   * 为单格格子叠加气泡，生成已排版图。
   * 结果存磁盘 + letteredData 写入 ComicPanel。
   */
  async letterPanel(panelId: string, opts: LetterPanelOptions = {}): Promise<LetterPanelResult> {
    const panel = await prisma.comicPanel.findUnique({ where: { id: panelId } });
    if (!panel) throw new AppError(`未找到漫画格子：${panelId}`, 404);

    const dialogues: Dialogue[] = panel.dialogues
      ? (JSON.parse(panel.dialogues) as Dialogue[])
      : [];

    // 加载原始格子图
    const sourceFingerprint = letteringSourceFingerprint(panel);
    const sourceFile = await resolvePanelImageFile(panel);
    if (!sourceFingerprint || !sourceFile)
      throw new AppError("该格缺少有效图片，请先生成图像。", 400);
    const rawBuffer = await fs.readFile(sourceFile.filePath);
    const meta = await sharp(rawBuffer).metadata();
    const imgWidth = meta.width ?? 1024;
    const imgHeight = meta.height ?? 1536;

    let composited = sharp(rawBuffer);

    if (dialogues.length > 0) {
      const usedAnchors = new Set<string>();
      const composites: SharpNS.OverlayOptions[] = [];

      for (let idx = 0; idx < dialogues.length; idx++) {
        const dlg = dialogues[idx];
        const hint = dlg.anchorHint?.toLowerCase();

        // 选锚点
        let anchor: [number, number];
        const knownHint = hint && ANCHOR_POSITIONS[hint] ? hint : null;
        if (knownHint && !usedAnchors.has(knownHint)) {
          usedAnchors.add(knownHint);
          anchor = ANCHOR_POSITIONS[knownHint];
        } else {
          const fallback = DEFAULT_ANCHOR_ORDER.find((a) => !usedAnchors.has(a));
          const fallbackKey = fallback ?? "mid-center";
          usedAnchors.add(fallbackKey);
          anchor = ANCHOR_POSITIONS[fallbackKey];
        }

        const cx = Math.round(anchor[0] * imgWidth);
        const cy = Math.round(anchor[1] * imgHeight);
        const { svgStr, bx, by } = buildBubbleSvg(dlg, cx, cy, imgWidth, imgHeight, opts);
        composites.push({
          input: Buffer.from(svgStr),
          top: by,
          left: bx,
        });
      }

      composited = sharp(rawBuffer).composite(composites);
    }

    const outBuffer = await composited.png().toBuffer();
    throwIfExecutionAborted();
    const revision = randomUUID();
    const filePath = panelRevisionPath(panelId, revision, "png", true);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, outBuffer, { flag: "wx" });

    const letteredData = {
      status: "done",
      url: `/api/comic/panel-images/${panelId}/lettered?revision=${revision}`,
      revision,
      sourceFingerprint,
      generatedAt: new Date().toISOString(),
    };
    const saved = await prisma.comicPanel.updateMany({
      where: {
        id: panelId,
        imageData: panel.imageData,
        dialogues: panel.dialogues,
        visualPrompt: panel.visualPrompt,
        characterRefs: panel.characterRefs,
        sceneRef: panel.sceneRef,
        letteredData: panel.letteredData,
      },
      data: { letteredData: JSON.stringify(letteredData) },
    });
    if (saved.count !== 1) throw new AppError("该格图片或对白已更新，请刷新后重新排版。", 409);

    return { buffer: outBuffer, ext: "png", width: imgWidth, height: imgHeight };
  }

  /** 读取已排版图文件（供 HTTP 路由流式响应） */
  async getLetteredImageFile(panelId: string): Promise<Buffer | null> {
    const panel = await prisma.comicPanel.findUnique({ where: { id: panelId } });
    if (!panel) return null;
    const file = await resolveLetteredImageFile(panel);
    if (!file) return null;
    try {
      return await fs.readFile(file.filePath);
    } catch {
      return null;
    }
  }
}

export const comicBubbleLayoutService = new ComicBubbleLayoutService();
