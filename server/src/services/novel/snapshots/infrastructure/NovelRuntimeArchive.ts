import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma";
import { enqueueRagOwnerJob } from "../../../rag";

// Parents precede dependants. Only execution data belongs here: the character,
// world, book contract and volume planning definitions are deliberately absent.
const TABLES = [
  "storyStateSnapshot",
  "characterState",
  "relationState",
  "informationState",
  "foreshadowState",
  "storyStateSnapshotArchive",
  "canonicalStateVersion",
  "stateChangeProposal",
  "openConflict",
  "payoffLedgerItem",
  "characterResourceLedgerItem",
  "characterResourceEvent",
  "characterMindSnapshot",
  "characterCandidate",
  "characterFactionTrack",
  "characterRelationStage",
  "chapterSummary",
  "consistencyFact",
  "characterTimeline",
  "novelFactEntry",
  "storyTimelineEvent",
  "chapterTimeAnchor",
  "timelineHook",
  "timelineConstraint",
  "timelineCheckReport",
  "qualityReport",
  "auditReport",
  "auditIssue",
] as const;
type RuntimeTable = (typeof TABLES)[number];
type Row = Record<string, unknown>;
type Client = Prisma.TransactionClient;
interface Delegate {
  findMany(args: { where: Row }): Promise<Row[]>;
  deleteMany(args: { where: Row }): Promise<{ count: number }>;
  createMany(args: { data: Row[] }): Promise<{ count: number }>;
}
function delegate(client: Client, table: RuntimeTable): Delegate {
  return client[table] as unknown as Delegate;
}
function scope(table: RuntimeTable, novelId: string): Row {
  if (["characterState", "relationState", "informationState", "foreshadowState"].includes(table)) {
    return { snapshot: { novelId } };
  }
  if (table === "auditIssue") return { report: { novelId } };
  return { novelId };
}
interface InfluenceStateArchive {
  id: string;
  status: string;
  sourceMindSnapshotId: string | null;
  appliedAt: Date | string | null;
  resolvedChapterId: string | null;
  resolutionEvidenceJson: string;
}
export interface NovelRuntimeArchive {
  version: 1;
  chapters: Array<{ id: string; title: string; order: number; content: string | null }>;
  tables: Record<RuntimeTable, Row[]>;
  volumeOutcomes: Array<{ id: string; completedSummaryJson: string | null }>;
  chapterPlanStates: Array<{ id: string; status: string; sourceStateSnapshotId: string | null }>;
  influenceStates: InfluenceStateArchive[];
  dialogueInfluenceStates: InfluenceStateArchive[];
  characters: Array<{
    id: string;
    currentState: string | null;
    currentGoal: string | null;
    lastEvolvedAt: Date | string | null;
  }>;
}
export function parseRuntimeArchive(value: unknown): NovelRuntimeArchive | null {
  if (!value || typeof value !== "object") return null;
  const archive = value as NovelRuntimeArchive;
  if (
    archive.version !== 1 ||
    !Array.isArray(archive.chapters) ||
    !Array.isArray(archive.characters) ||
    !archive.tables
  )
    return null;
  return TABLES.every((table) => Array.isArray(archive.tables[table])) ? archive : null;
}
export async function captureNovelRuntimeArchive(
  novelId: string,
  tx: Client = prisma,
): Promise<NovelRuntimeArchive> {
  const tables = {} as NovelRuntimeArchive["tables"];
  for (const table of TABLES)
    tables[table] = await delegate(tx, table).findMany({ where: scope(table, novelId) });
  const characters = await tx.character.findMany({
    where: { novelId },
    select: { id: true, currentState: true, currentGoal: true, lastEvolvedAt: true },
  });
  const chapters = await tx.chapter.findMany({
    where: { novelId },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true, content: true },
  });
  const volumeOutcomes = await tx.volumePlan.findMany({
    where: { novelId },
    select: { id: true, completedSummaryJson: true },
  });
  const chapterPlanStates = await tx.storyPlan.findMany({
    where: { novelId, level: "chapter" },
    select: { id: true, status: true, sourceStateSnapshotId: true },
  });
  const influenceSelect = {
    id: true,
    status: true,
    sourceMindSnapshotId: true,
    appliedAt: true,
    resolvedChapterId: true,
    resolutionEvidenceJson: true,
  } as const;
  const influenceStates = await tx.characterInfluenceProposal.findMany({
    where: { novelId },
    select: influenceSelect,
  });
  const dialogueInfluenceStates = await tx.characterDialogueInfluence.findMany({
    where: { novelId },
    select: influenceSelect,
  });
  return {
    version: 1,
    tables,
    characters,
    chapters,
    volumeOutcomes,
    chapterPlanStates,
    influenceStates,
    dialogueInfluenceStates,
  };
}
export async function clearNovelRuntime(novelId: string, tx: Client): Promise<void> {
  for (const [table, ownerType] of [
    ["consistencyFact", "consistency_fact"],
    ["characterTimeline", "character_timeline"],
  ] as const) {
    const rows = await delegate(tx, table).findMany({ where: { novelId } });
    for (const row of rows) {
      await enqueueRagOwnerJob({ jobType: "delete", ownerType, ownerId: String(row.id) }, tx);
    }
  }
  await tx.volumePlan.updateMany({ where: { novelId }, data: { completedSummaryJson: null } });
  await tx.storyPlan.updateMany({
    where: { novelId, level: "chapter" },
    data: { status: "stale" },
  });
  // Reopen only applications of author-approved guidance. Preserve the guidance,
  // conversation history and explicit author selections themselves.
  await tx.characterInfluenceProposal.updateMany({
    where: { novelId, resolvedChapterId: { not: null }, acceptedAt: { not: null } },
    data: {
      status: "accepted",
      appliedAt: null,
      resolvedChapterId: null,
      resolutionEvidenceJson: "[]",
    },
  });
  await tx.characterDialogueInfluence.updateMany({
    where: { novelId, resolvedChapterId: { not: null }, activatedAt: { not: null } },
    data: {
      status: "active",
      appliedAt: null,
      resolvedChapterId: null,
      resolutionEvidenceJson: "[]",
    },
  });
  for (const table of [...TABLES].reverse())
    await delegate(tx, table).deleteMany({ where: scope(table, novelId) });
  await tx.chapterArtifactSyncCheckpoint.deleteMany({
    where: { novelId, artifactType: { not: "snapshot_restore" } },
  });
}
export async function applyNovelRuntimeArchive(
  novelId: string,
  archive: NovelRuntimeArchive,
  tx: Client,
): Promise<void> {
  for (const table of TABLES) {
    const rows = archive.tables[table];
    if (rows.length > 0) await delegate(tx, table).createMany({ data: rows });
  }
  for (const volume of archive.volumeOutcomes ?? []) {
    await tx.volumePlan.updateMany({
      where: { id: volume.id, novelId },
      data: { completedSummaryJson: volume.completedSummaryJson },
    });
  }
  for (const plan of archive.chapterPlanStates ?? []) {
    await tx.storyPlan.updateMany({
      where: { id: plan.id, novelId },
      data: { status: plan.status, sourceStateSnapshotId: plan.sourceStateSnapshotId },
    });
  }
  for (const [table, rows] of [
    ["characterInfluenceProposal", archive.influenceStates ?? []],
    ["characterDialogueInfluence", archive.dialogueInfluenceStates ?? []],
  ] as const) {
    for (const row of rows) {
      const { id, ...data } = row;
      if (table === "characterInfluenceProposal") {
        await tx.characterInfluenceProposal.updateMany({ where: { id, novelId }, data });
      } else {
        await tx.characterDialogueInfluence.updateMany({ where: { id, novelId }, data });
      }
    }
  }
  for (const character of archive.characters) {
    await tx.character.updateMany({
      where: { id: character.id, novelId },
      data: {
        currentState: character.currentState,
        currentGoal: character.currentGoal,
        lastEvolvedAt: character.lastEvolvedAt,
      },
    });
  }
  for (const [table, ownerType] of [
    ["consistencyFact", "consistency_fact"],
    ["characterTimeline", "character_timeline"],
  ] as const) {
    for (const row of archive.tables[table]) {
      await enqueueRagOwnerJob({ jobType: "upsert", ownerType, ownerId: String(row.id) }, tx);
    }
  }
}
