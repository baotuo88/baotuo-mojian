import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ExecutionStoppedError,
  getExecutionScope,
  runWithExecutionScope,
  throwIfExecutionAborted,
  withoutExecutionScope,
} from "./executionScope";

type FenceClient = Pick<
  Prisma.TransactionClient,
  | "directorRunCommand"
  | "agentRun"
  | "chapter"
  | "chapterArtifactSyncCheckpoint"
  | "comicBatchJob"
  | "$executeRaw"
>;

export function isExecutionMutation(operation: string): boolean {
  return (
    operation.startsWith("create") ||
    operation.startsWith("update") ||
    operation.startsWith("delete") ||
    operation === "upsert" ||
    operation.startsWith("$executeRaw") ||
    operation === "executeRaw"
  );
}

/** Check persisted ownership as well as the local signal; no cached lease decisions. */
export async function assertExecutionWriteAllowed(
  client: FenceClient,
  lock = false,
): Promise<void> {
  throwIfExecutionAborted();
  const scope = getExecutionScope();
  if (!scope || (scope.writeFenceHeld && !lock)) return;
  for (const fence of scope.fences) {
    const allowed = await withoutExecutionScope(async () => {
      if (fence.kind === "comic_batch") {
        const job = await client.comicBatchJob.findUnique({ where: { id: fence.jobId } });
        if (!job || job.type !== "episode_image_batch" || job.status !== "running") return 0;
        let progress: { leaseOwner?: string; leaseExpiresAt?: number };
        try {
          progress = JSON.parse(job.progress);
        } catch {
          return 0;
        }
        if (
          !progress ||
          progress.leaseOwner !== fence.leaseOwner ||
          typeof progress.leaseExpiresAt !== "number" ||
          progress.leaseExpiresAt <= Date.now()
        )
          return 0;
        if (!lock) return 1;
        // Compare the complete lease snapshot while acquiring the row lock. Never renew here.
        return client.$executeRaw(Prisma.sql`
          UPDATE "ComicBatchJob" SET "progress" = "progress"
          WHERE "id" = ${fence.jobId} AND "status" = 'running' AND "progress" = ${job.progress}
        `);
      }
      if (fence.kind === "director") {
        const where: Prisma.DirectorRunCommandWhereInput = {
          id: fence.commandId,
          leaseOwner: fence.leaseOwner,
          ...(fence.attempt === undefined ? {} : { attempt: fence.attempt }),
          status: { in: ["leased", "running"] },
          leaseExpiresAt: { gt: new Date() },
          ...(fence.controlAction === "cancel"
            ? { commandType: "cancel" }
            : { task: { is: { cancelRequestedAt: null, status: { not: "cancelled" as const } } } }),
        };
        return lock
          ? (
              await client.directorRunCommand.updateMany({
                where,
                data: { leaseOwner: fence.leaseOwner },
              })
            ).count
          : await client.directorRunCommand.count({ where });
      }
      if (fence.kind === "chapter_content") {
        if (!lock) {
          return client.chapter.count({
            where: { id: fence.chapterId, novelId: fence.novelId, content: fence.content },
          });
        }
        // A SQL no-op takes the row lock without Prisma advancing updatedAt.
        const contentMatch =
          fence.content === null
            ? Prisma.sql`"content" IS NULL`
            : Prisma.sql`"content" = ${fence.content}`;
        return client.$executeRaw(Prisma.sql`
          UPDATE "Chapter" SET "content" = "content"
          WHERE "id" = ${fence.chapterId} AND "novelId" = ${fence.novelId} AND ${contentMatch}
        `);
      }
      if (fence.kind === "snapshot_restore") {
        if (!lock) {
          return client.chapterArtifactSyncCheckpoint.count({
            where: { id: fence.checkpointId, status: "running", metadataJson: fence.metadataJson },
          });
        }
        // Heartbeats own updatedAt; checking ownership must not extend the lease.
        return client.$executeRaw(Prisma.sql`
          UPDATE "ChapterArtifactSyncCheckpoint" SET "metadataJson" = "metadataJson"
          WHERE "id" = ${fence.checkpointId} AND "status" = 'running' AND "metadataJson" = ${fence.metadataJson}
        `);
      }
      const where = { id: fence.runId, status: { not: "cancelled" as const } };
      return lock
        ? (await client.agentRun.updateMany({ where, data: { id: fence.runId } })).count
        : await client.agentRun.count({ where });
    });
    if (allowed !== 1) {
      if (fence.kind === "chapter_content") {
        throw new ExecutionStoppedError("章节正文已被更新，拒绝保存旧稿的审校或衍生结果。");
      }
      if (fence.kind === "snapshot_restore") {
        throw new ExecutionStoppedError("版本恢复任务的执行权已变化，拒绝保存过期的重建结果。");
      }
      throw new ExecutionStoppedError("执行已取消或执行租约已失效，拒绝保存过期结果。");
    }
    throwIfExecutionAborted();
  }
}

/** Lock ownership and persist outputs together, rolling back if cancellation wins. */
export function withExecutionWriteFence<T>(
  client: PrismaClient,
  runner: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await assertExecutionWriteAllowed(tx, true);
    return runWithExecutionScope({ writeFenceHeld: true }, async () => {
      const result = await runner(tx);
      // Repeat the persisted check before commit, including the lease deadline.
      await assertExecutionWriteAllowed(tx, true);
      return result;
    });
  });
}
