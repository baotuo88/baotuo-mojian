/**
 * 小说内容源适配器（novel_import）——共享层版本
 *
 * drama 与 comic 共用此适配器。唯一通过 prisma 只读访问 novel 相关表，
 * 不 import 任何 services/novel/* 业务逻辑（由 CI 守卫强制）。
 *
 * loadChapterText：按章节区间取原文，供 comic 分格脚本提取对白。
 */
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import type { SourceContentPort } from "./SourceContentPort";
import type {
  SourceBundle,
  SourceBeat,
  SourceCharacter,
  SourceFact,
  SourceFactCategory,
  SourceRef,
} from "../contracts/sourceBundle";

function truncate(text: string, max = 200): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function normalizeFactCategory(raw: string): SourceFactCategory {
  if (raw === "revealed" || raw === "state_changed") return raw;
  return "completed";
}

export class NovelSourceAdapter implements SourceContentPort {
  readonly sourceType = "novel_import" as const;

  async loadBundle(ref: SourceRef): Promise<SourceBundle> {
    const novelId = ref.ref?.trim();
    if (!novelId) {
      throw new Error("novel_import 内容源缺少 novelId（ref.ref）。");
    }

    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true, description: true },
    });
    if (!novel) {
      throw new Error(`未找到源小说：${novelId}`);
    }

    const [chapters, characters, factRows] = await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        orderBy: { order: "asc" },
        select: { order: true, title: true, expectation: true, content: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: {
          id: true,
          name: true,
          gender: true,
          role: true,
          personality: true,
          background: true,
          appearance: true,
          physique: true,
          attireStyle: true,
          signatureDetail: true,
        },
      }),
      prisma.novelFactEntry.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "asc" },
        select: { text: true, category: true },
      }),
    ]);

    const beats: SourceBeat[] = chapters.map((chapter) => {
      const summary =
        (chapter.expectation ?? "").trim() || truncate(chapter.content ?? "") || chapter.title;
      return {
        order: chapter.order,
        summary: `${chapter.title}：${summary}`,
        sourceChapterStart: chapter.order,
        sourceChapterEnd: chapter.order,
      };
    });

    const bundleCharacters: SourceCharacter[] = characters.map((character) => ({
      name: character.name,
      gender: character.gender as "male" | "female" | "other" | "unknown" | undefined,
      persona: [character.role, character.personality].filter(Boolean).join("｜") || undefined,
      relations: character.background ?? undefined,
      visualHint:
        [character.appearance, character.physique, character.attireStyle, character.signatureDetail]
          .filter(Boolean)
          .join("，") || undefined,
      sourceCharacterRef: character.id,
    }));

    const hardFacts: SourceFact[] = factRows.map((row) => ({
      text: row.text,
      category: normalizeFactCategory(row.category),
    }));

    return {
      synopsis: (novel.description ?? "").trim() || novel.title,
      beats,
      characters: bundleCharacters,
      hardFacts,
    };
  }

  async loadChapterText(ref: SourceRef, start: number, end: number): Promise<string> {
    const novelId = ref.ref?.trim();
    if (!novelId) throw new AppError("请先选择需要改编的小说。", 400);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new AppError("小说章节范围无效，请重新规划本话。", 422);
    }

    const chapters = await prisma.chapter.findMany({
      where: { novelId, order: { gte: start, lte: end } },
      orderBy: { order: "asc" },
      select: { order: true, title: true, content: true },
    });

    if (
      chapters.length !== end - start + 1 ||
      chapters.some((chapter, index) => chapter.order !== start + index)
    ) {
      throw new AppError("本话对应的小说章节不完整，请重新导入小说资料并检查分话范围。", 422);
    }
    const unwritten = chapters.filter((chapter) => !chapter.content?.trim());
    if (unwritten.length) {
      throw new AppError(
        `第 ${unwritten.map((chapter) => chapter.order).join("、")} 章没有正文，请先完成小说章节。`,
        422,
      );
    }

    return chapters
      .map((ch) => `【第${ch.order}章 ${ch.title}】\n${ch.content ?? ""}`)
      .join("\n\n");
  }
}

export const novelSourceAdapter = new NovelSourceAdapter();
