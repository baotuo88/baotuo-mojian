import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { AppError } from "../../../../middleware/errorHandler";

/** Keep the exact replaced manuscript recoverable, then CAS the generation baseline. */
export async function commitGeneratedChapter(input: {
  novelId: string;
  chapterId: string;
  expectedContent: string | null | undefined;
  content: string;
  generationState: "drafted" | "repaired";
}) {
  if (input.expectedContent === undefined)
    throw new AppError("缺少章节原稿版本，请重新读取章节后生成。", 409);
  return withSqliteRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const current = await tx.chapter.findFirst({
          where: { id: input.chapterId, novelId: input.novelId },
          select: { id: true, title: true, order: true, content: true },
        });
        if (!current || current.content !== input.expectedContent) {
          throw new AppError("章节正文已被修改，生成稿未覆盖当前正文，请重新读取后重试。", 409);
        }
        if (current.content?.trim() && current.content !== input.content) {
          const snapshotData = JSON.stringify({ chapters: [current] });
          const backup = await tx.novelSnapshot.create({
            data: {
              novelId: input.novelId,
              triggerType: "manual",
              label: `第${current.order}章生成替换前原稿`,
              snapshotData,
            },
            select: { id: true, snapshotData: true },
          });
          if (!backup.id || backup.snapshotData !== snapshotData) {
            throw new Error("原稿备份未完成，章节正文未替换。");
          }
        }
        const updated = await tx.chapter.updateMany({
          where: { id: input.chapterId, novelId: input.novelId, content: input.expectedContent },
          data: {
            content: input.content,
            generationState: input.generationState,
            chapterStatus: "generating",
          },
        });
        if (updated.count !== 1)
          throw new AppError("章节正文已被修改，生成稿未覆盖当前正文。", 409);
      }),
    { label: "chapter.generatedContent.commit" },
  );
}
