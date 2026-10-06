import { commitEpisodeEdit } from "./revisions";
import { prisma } from "../../db/prisma";

export interface DramaEpisodeUpdateInput {
  expectedRevision: number;
  title?: string;
  content?: string;
  hookOpening?: string | null;
  cliffhanger?: string | null;
  durationSec?: number | null;
}

export class DramaEpisodeService {
  async updateEpisode(projectId: string, order: number, input: DramaEpisodeUpdateInput) {
    const episode = await prisma.dramaEpisode.findUniqueOrThrow({ where: { projectId_order: { projectId, order } } });
    const { expectedRevision, ...changes } = input;
    return commitEpisodeEdit({ episodeId: episode.id, expectedRevision, changes, source: "manual" });
  }
  async listRevisions(projectId: string, order: number) {
    return prisma.dramaEpisodeRevision.findMany({
      where: { episode: { projectId, order } }, orderBy: { revision: "desc" },
    });
  }
}

export const dramaEpisodeService = new DramaEpisodeService();
