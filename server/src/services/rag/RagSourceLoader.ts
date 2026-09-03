import { prisma } from "../../db/prisma";
import { normalizeRagText } from "./utils";
import {
  normalizeRagFacets,
  type RagChunkAnchor,
  type RagPreChunk,
} from "./chunkFacets";
import type { RagOwnerType, RagSourceDocument } from "./types";

/**
 * 源文档加载适配器：把每种 RAG owner 类型（小说/章节/世界/角色/圣经/章节摘要/
 * 一致性事实/角色时间线/世界库条目/知识库文档）读成统一的 RagSourceDocument。
 *
 * 这是「持久化 → 领域输入」的适配层，与向量/Embedding 无关，因此从 RagIndexService
 * 抽出独立模块。索引编排（chunk 切分、向量化、写入）继续留在 RagIndexService。
 */

export function buildJoinedText(...parts: Array<string | null | undefined>): string {
  return parts
    .map((item) => (item ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function normalizeRagPreChunks(raw: unknown): RagPreChunk[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const chunkText = typeof record.chunkText === "string" ? normalizeRagText(record.chunkText) : "";
    if (!chunkText) {
      return [];
    }
    const anchor = record.anchor && typeof record.anchor === "object" && !Array.isArray(record.anchor)
      ? record.anchor as RagChunkAnchor
      : undefined;
    const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata as Record<string, unknown>
      : undefined;
    return [{
      chunkText,
      facets: normalizeRagFacets(record.facets),
      anchor,
      metadata,
    }];
  }).slice(0, 200);
}

export async function loadRagSourceDocuments(
  ownerType: RagOwnerType,
  ownerId: string,
  tenantId: string,
  payload?: { preChunks?: unknown },
): Promise<RagSourceDocument[]> {
  switch (ownerType) {
    case "novel": {
      const novel = await prisma.novel.findUnique({
        where: { id: ownerId },
        include: { world: true },
      });
      if (!novel) {
        return [];
      }
      const content = buildJoinedText(
        novel.title,
        novel.description ?? undefined,
        novel.outline ?? undefined,
        novel.structuredOutline ?? undefined,
        novel.world?.description ?? undefined,
      );
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          novelId: novel.id,
          worldId: novel.worldId ?? undefined,
          title: novel.title,
          content,
          metadata: {
            status: novel.status,
            updatedAt: novel.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "chapter": {
      const chapter = await prisma.chapter.findUnique({ where: { id: ownerId } });
      if (!chapter) {
        return [];
      }
      const content = buildJoinedText(chapter.title, chapter.content ?? undefined);
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          novelId: chapter.novelId,
          title: chapter.title,
          content,
          metadata: {
            order: chapter.order,
            chapterOrder: chapter.order,
            state: chapter.generationState,
            updatedAt: chapter.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "world": {
      const world = await prisma.world.findUnique({ where: { id: ownerId } });
      if (!world) {
        return [];
      }
      const content = buildJoinedText(
        world.name,
        world.description ?? undefined,
        world.background ?? undefined,
        world.geography ?? undefined,
        world.magicSystem ?? undefined,
        world.politics ?? undefined,
        world.cultures ?? undefined,
        world.races ?? undefined,
        world.religions ?? undefined,
        world.technology ?? undefined,
        world.history ?? undefined,
        world.economy ?? undefined,
        world.factions ?? undefined,
        world.conflicts ?? undefined,
        world.overviewSummary ?? undefined,
      );
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          worldId: world.id,
          title: world.name,
          content,
          metadata: {
            worldType: world.worldType,
            status: world.status,
            version: world.version,
            updatedAt: world.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "character": {
      const character = await prisma.character.findUnique({ where: { id: ownerId } });
      if (!character) {
        return [];
      }
      const content = buildJoinedText(
        character.name,
        character.role,
        character.personality ?? undefined,
        character.background ?? undefined,
        character.development ?? undefined,
        character.currentState ?? undefined,
        character.currentGoal ?? undefined,
      );
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          novelId: character.novelId,
          title: character.name,
          content,
          metadata: {
            role: character.role,
            updatedAt: character.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "bible": {
      const bible = await prisma.novelBible.findUnique({ where: { novelId: ownerId } });
      if (!bible) {
        return [];
      }
      const content = buildJoinedText(
        bible.mainPromise ?? undefined,
        bible.coreSetting ?? undefined,
        bible.forbiddenRules ?? undefined,
        bible.characterArcs ?? undefined,
        bible.worldRules ?? undefined,
        bible.rawContent ?? undefined,
      );
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          novelId: bible.novelId,
          title: `bible-${bible.novelId}`,
          content,
          metadata: {
            updatedAt: bible.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "chapter_summary": {
      const summary = await prisma.chapterSummary.findUnique({ where: { chapterId: ownerId } });
      if (!summary) {
        return [];
      }
      const content = buildJoinedText(
        summary.summary,
        summary.keyEvents ?? undefined,
        summary.characterStates ?? undefined,
        summary.hook ?? undefined,
      );
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          novelId: summary.novelId,
          title: `chapter-summary-${summary.chapterId}`,
          content,
          metadata: {
            chapterId: summary.chapterId,
            updatedAt: summary.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "consistency_fact": {
      const fact = await prisma.consistencyFact.findUnique({ where: { id: ownerId } });
      if (!fact) {
        return [];
      }
      const content = normalizeRagText(fact.content);
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          novelId: fact.novelId,
          title: `fact-${fact.category}`,
          content,
          metadata: {
            category: fact.category,
            source: fact.source,
            chapterId: fact.chapterId,
            updatedAt: fact.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "character_timeline": {
      const timeline = await prisma.characterTimeline.findUnique({ where: { id: ownerId } });
      if (!timeline) {
        return [];
      }
      const content = buildJoinedText(timeline.title, timeline.content);
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          novelId: timeline.novelId,
          title: timeline.title,
          content,
          metadata: {
            source: timeline.source,
            characterId: timeline.characterId,
            chapterId: timeline.chapterId,
            chapterOrder: timeline.chapterOrder,
            updatedAt: timeline.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "world_library_item": {
      const item = await prisma.worldPropertyLibrary.findUnique({ where: { id: ownerId } });
      if (!item) {
        return [];
      }
      const content = buildJoinedText(item.name, item.description ?? undefined);
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          worldId: item.sourceWorldId ?? undefined,
          title: item.name,
          content,
          metadata: {
            category: item.category,
            worldType: item.worldType,
            usageCount: item.usageCount,
            updatedAt: item.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "knowledge_document": {
      const document = await prisma.knowledgeDocument.findUnique({
        where: { id: ownerId },
        include: { activeVersion: true },
      });
      if (!document?.activeVersion || document.status === "archived") {
        return [];
      }
      const content = normalizeRagText(document.activeVersion.content);
      return content
        ? [{
          ownerType,
          ownerId,
          tenantId,
          title: document.title,
          content,
          preChunks: normalizeRagPreChunks(payload?.preChunks),
          metadata: {
            fileName: document.fileName,
            kind: document.kind,
            sourceAnalysisId: document.sourceAnalysisId,
            status: document.status,
            activeVersionId: document.activeVersionId,
            activeVersionNumber: document.activeVersionNumber,
            updatedAt: document.updatedAt.toISOString(),
          },
        }]
        : [];
    }
    case "chat_message":
    default:
      return [];
  }
}