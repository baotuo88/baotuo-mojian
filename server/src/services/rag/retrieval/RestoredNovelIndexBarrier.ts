import { prisma } from "../../../db/prisma";

/** A restored manuscript is usable before its asynchronous search indexes are. */
export async function hasPendingRestoredNovelIndex(novelId: string): Promise<boolean> {
  const checkpoint = await prisma.chapterArtifactSyncCheckpoint.findFirst({
    where: { novelId, artifactType: "snapshot_restore" },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, metadataJson: true },
  });
  if (!checkpoint) return false;
  if (checkpoint.status !== "succeeded") return true;
  const metadata = JSON.parse(checkpoint.metadataJson ?? "{}") as { ragBarrierJobIds?: string[] };
  const ids = metadata.ragBarrierJobIds;
  if (!Array.isArray(ids) || ids.length === 0) return false;
  const jobs = await prisma.ragIndexJob.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });
  if (jobs.length !== ids.length || jobs.some((job) => job.status !== "succeeded")) return true;
  // Persist completion before queue history can be cleaned. Missing task records
  // are never proof that a failed rebuild succeeded.
  await prisma.chapterArtifactSyncCheckpoint.updateMany({
    where: { id: checkpoint.id, status: "succeeded", metadataJson: checkpoint.metadataJson },
    data: { metadataJson: JSON.stringify({ ...metadata, ragBarrierJobIds: [] }) },
  });
  return false;
}
