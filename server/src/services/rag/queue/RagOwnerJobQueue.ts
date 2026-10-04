import type { Prisma, RagIndexJob } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import { ragConfig } from "../../../config/rag";
import type { RagJobType, RagOwnerType } from "../types";

export interface RagOwnerJobInput {
  jobType: RagJobType;
  ownerType: RagOwnerType;
  ownerId: string;
  tenantId?: string;
  payload?: Record<string, unknown>;
  runAfter?: Date;
  maxAttempts?: number;
}

function readPayload(raw: string | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Join a source mutation transaction so removal and index cleanup commit together. */
export async function enqueueRagOwnerJob(
  input: RagOwnerJobInput,
  client?: Prisma.TransactionClient,
): Promise<RagIndexJob> {
  const enqueue = async (tx: Prisma.TransactionClient) => {
    const scope = {
      tenantId: input.tenantId ?? ragConfig.defaultTenantId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    };
    // A running job already captured its source. Only unclaimed jobs may be
    // coalesced. The latest requested operation wins across upsert/delete.
    const queued = await tx.ragIndexJob.findMany({
      where: { ...scope, status: "queued" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const existing = queued[0];
    const progress = {
      stage: "queued",
      label: "等待执行",
      detail: "索引任务已进入队列。",
      percent: 0,
      updatedAt: new Date().toISOString(),
    };
    const data = {
      jobType: input.jobType,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? ragConfig.workerMaxAttempts,
      runAfter: input.runAfter ?? new Date(),
      lastError: null,
      payloadJson: JSON.stringify({
        ...(existing?.jobType === input.jobType ? readPayload(existing.payloadJson) : {}),
        ...(input.payload ?? {}),
        progress,
      }),
    };
    if (existing) {
      // Also converge duplicate queued jobs left by older queue writers.
      if (queued.length > 1) {
        await tx.ragIndexJob.updateMany({
          where: { id: { in: queued.slice(1).map((job) => job.id) }, status: "queued" },
          data: { status: "cancelled", lastError: "Superseded by a newer owner index request." },
        });
      }
      return tx.ragIndexJob.update({ where: { id: existing.id }, data });
    }
    return tx.ragIndexJob.create({ data: { ...scope, ...data, status: "queued" } });
  };
  return client
    ? enqueue(client)
    : withSqliteRetry(() => prisma.$transaction(enqueue, { isolationLevel: "Serializable" }), {
        label: "rag.owner.enqueue",
      });
}

/** Owners run in FIFO order, while unrelated owners may run concurrently. */
export async function claimRagOwnerJob(): Promise<RagIndexJob | null> {
  return withSqliteRetry(
    () =>
      prisma.$transaction(
        async (tx) => {
          const jobs = await tx.ragIndexJob.findMany({
            where: { status: { in: ["queued", "running"] } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
          const ownerKey = (job: RagIndexJob) =>
            JSON.stringify([job.tenantId, job.ownerType, job.ownerId]);
          const occupied = new Set(jobs.filter((job) => job.status === "running").map(ownerKey));
          const seen = new Set<string>();
          const now = new Date();
          for (const job of jobs) {
            const key = ownerKey(job);
            if (occupied.has(key) || seen.has(key)) continue;
            seen.add(key);
            // A retry with backoff still precedes later deletion/rebuild requests.
            if (job.status !== "queued" || job.runAfter > now) continue;
            const result = await tx.ragIndexJob.updateMany({
              where: { id: job.id, status: "queued", runAfter: { lte: now } },
              data: { status: "running", attempts: { increment: 1 }, lastError: null },
            });
            if (result.count === 1) return tx.ragIndexJob.findUnique({ where: { id: job.id } });
          }
          return null;
        },
        { isolationLevel: "Serializable" },
      ),
    { label: "rag.owner.claim" },
  );
}
