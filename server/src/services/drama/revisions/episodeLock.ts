import type { Prisma } from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";

export function revisionConflict(): AppError {
  return new AppError("台本有新的修改，请保留本地内容并查看最新台本后再保存或生成。", 409);
}

/** Parameterized no-op UPDATE locks the row without changing its update timestamp. */
export async function lockEpisodeRevision(tx: Prisma.TransactionClient, episodeId: string, revision: number) {
  const count = await tx.$executeRaw`UPDATE "DramaEpisode" SET "revision" = "revision" WHERE "id" = ${episodeId} AND "revision" = ${revision}`;
  if (!count) throw revisionConflict();
  return tx.dramaEpisode.findUniqueOrThrow({ where: { id: episodeId } });
}
