import type { Prisma } from "@prisma/client";
import type {
  CanonicalStateSnapshot,
  StateVersionRecord,
} from "@ai-novel/shared/types/canonicalState";
import { prisma } from "../../../db/prisma";

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export interface CreateStateVersionInput {
  novelId: string;
  chapterId?: string | null;
  sourceType: string;
  sourceStage?: string | null;
  summary: string;
  acceptedProposalIds: string[];
  snapshot: CanonicalStateSnapshot;
}

export class StateVersionLog {
  async createVersion(
    input: CreateStateVersionInput,
    client?: Prisma.TransactionClient,
  ): Promise<StateVersionRecord> {
    const run = async (tx: Prisma.TransactionClient) => {
      const latest = await tx.canonicalStateVersion.findFirst({
        where: { novelId: input.novelId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      return tx.canonicalStateVersion.create({
        data: {
          novelId: input.novelId,
          chapterId: input.chapterId ?? null,
          sourceType: input.sourceType,
          sourceStage: input.sourceStage ?? null,
          version: (latest?.version ?? 0) + 1,
          summary: input.summary,
          snapshotJson: JSON.stringify(input.snapshot),
          acceptedProposalIdsJson: JSON.stringify(input.acceptedProposalIds),
        },
      });
    };

    // When a caller already holds a transaction, join it so version creation
    // and any sibling writes (e.g. linking proposals to this version) commit or
    // roll back together. Otherwise open a self-contained transaction.
    const created = client ? await run(client) : await prisma.$transaction(run);

    return {
      id: created.id,
      novelId: created.novelId,
      chapterId: created.chapterId ?? null,
      sourceType: created.sourceType,
      sourceStage: created.sourceStage ?? null,
      version: created.version,
      summary: created.summary,
      acceptedProposalIds: parseStringArray(created.acceptedProposalIdsJson),
      snapshotJson: created.snapshotJson,
      createdAt: created.createdAt.toISOString(),
    };
  }
}

export const stateVersionLog = new StateVersionLog();
