import type { Prisma } from "@prisma/client";
import { AppError } from "../../../../middleware/errorHandler";

/** Lock the persisted manuscript in the same short transaction as derived writes. */
export async function assertChapterArtifactSource(
  tx: Prisma.TransactionClient,
  novelId: string,
  chapterId: string,
  content: string,
): Promise<void> {
  const chapter = await tx.chapter.findFirst({
    where: { id: chapterId, novelId },
    select: { content: true, updatedAt: true },
  });
  if (!chapter || (chapter.content ?? "") !== content) {
    throw new AppError("章节正文已被修改，旧正文的资料更新已取消。", 409);
  }
  const locked = await tx.chapter.updateMany({
    where: { id: chapterId, novelId, content: chapter.content, updatedAt: chapter.updatedAt },
    data: { content: chapter.content, updatedAt: chapter.updatedAt },
  });
  if (locked.count !== 1) throw new AppError("章节正文已被修改，旧正文的资料更新已取消。", 409);
}
