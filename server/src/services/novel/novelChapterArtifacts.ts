import { prisma } from "../../db/prisma";
import { enqueueRagOwnerJob } from "../rag";
import { withSqliteRetry } from "../../db/sqliteRetry";
import { briefSummary, extractCharacterEventLines, extractFacts } from "./novelCoreShared";
import { getExecutionScope } from "../../platform/execution";
import { assertChapterArtifactSource } from "./runtime/persistence";
import { chapterArtifactBackgroundSyncService } from "./runtime/ChapterArtifactBackgroundSyncService";

export async function syncCharacterTimelineForChapter(
  novelId: string,
  chapterId: string,
  content: string,
) {
  const [chapter, characters] = await Promise.all([
    prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { order: true, title: true },
    }),
    prisma.character.findMany({
      where: { novelId },
      select: { id: true, name: true },
    }),
  ]);

  if (!chapter || characters.length === 0) {
    return;
  }

  const events: Array<{
    novelId: string;
    characterId: string;
    chapterId: string;
    chapterOrder: number;
    title: string;
    content: string;
    source: string;
  }> = [];

  for (const character of characters) {
    const lines = extractCharacterEventLines(content, character.name, 3);
    for (const line of lines) {
      events.push({
        novelId,
        characterId: character.id,
        chapterId,
        chapterOrder: chapter.order,
        title: `${chapter.order} · ${chapter.title}`,
        content: line,
        source: "chapter_extract",
      });
    }
  }

  await withSqliteRetry(
    () =>
      prisma.$transaction(async (tx) => {
        await assertChapterArtifactSource(tx, novelId, chapterId, content);
        const previousTimelines = await tx.characterTimeline.findMany({
          where: { novelId, chapterId, source: "chapter_extract" },
          select: { id: true },
        });
        for (const timeline of previousTimelines) {
          await enqueueRagOwnerJob(
            { jobType: "delete", ownerType: "character_timeline", ownerId: timeline.id },
            tx,
          );
        }
        await tx.characterTimeline.deleteMany({
          where: {
            novelId,
            chapterId,
            source: "chapter_extract",
          },
        });
        if (events.length > 0) {
          await tx.characterTimeline.createMany({ data: events });
        }
      }),
    { label: "novelChapterArtifacts.characterTimeline" },
  );

  const timelines = await prisma.characterTimeline.findMany({
    where: {
      novelId,
      chapterId,
      source: "chapter_extract",
    },
    select: { id: true },
  });

  for (const timeline of timelines) {
    await queueRagUpsert("character_timeline", timeline.id);
  }
}

export async function syncChapterArtifacts(novelId: string, chapterId: string, content: string) {
  const facts = extractFacts(content);
  const summary = briefSummary(content, facts);

  await withSqliteRetry(
    () =>
      prisma.$transaction(async (tx) => {
        await assertChapterArtifactSource(tx, novelId, chapterId, content);
        await tx.chapterSummary.upsert({
          where: { chapterId },
          update: {
            summary,
            keyEvents: facts
              .map((item) => item.content)
              .slice(0, 3)
              .join(""),
            characterStates: facts
              .filter((item) => item.category === "character")
              .map((item) => item.content)
              .slice(0, 3)
              .join(""),
          },
          create: {
            novelId,
            chapterId,
            summary,
            keyEvents: facts
              .map((item) => item.content)
              .slice(0, 3)
              .join(""),
            characterStates: facts
              .filter((item) => item.category === "character")
              .map((item) => item.content)
              .slice(0, 3)
              .join(""),
          },
        });

        const previousFacts = await tx.consistencyFact.findMany({
          where: { novelId, chapterId },
          select: { id: true },
        });
        for (const fact of previousFacts) {
          await enqueueRagOwnerJob(
            { jobType: "delete", ownerType: "consistency_fact", ownerId: fact.id },
            tx,
          );
        }
        await tx.consistencyFact.deleteMany({ where: { novelId, chapterId } });
        if (facts.length > 0) {
          await tx.consistencyFact.createMany({
            data: facts.map((item) => ({
              novelId,
              chapterId,
              category: item.category,
              content: item.content,
              source: "chapter_auto_extract",
            })),
          });
        }
      }),
    { label: "novelChapterArtifacts.summaryAndFacts" },
  );

  await syncCharacterTimelineForChapter(novelId, chapterId, content);
  if (getExecutionScope()) {
    await chapterArtifactBackgroundSyncService.runChapterSyncNow(novelId, chapterId, content);
  } else {
    chapterArtifactBackgroundSyncService.scheduleChapterSync(novelId, chapterId, content);
  }

  await queueRagUpsert("chapter", chapterId);
  await queueRagUpsert("chapter_summary", chapterId);
  await queueRagUpsert("novel", novelId);

  const factRows = await prisma.consistencyFact.findMany({
    where: { novelId, chapterId },
    select: { id: true },
  });
  for (const fact of factRows) {
    await queueRagUpsert("consistency_fact", fact.id);
  }
}

function queueRagUpsert(ownerType: import("../rag/types").RagOwnerType, ownerId: string) {
  return enqueueRagOwnerJob({ jobType: "upsert", ownerType, ownerId });
}
