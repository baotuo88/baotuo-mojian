ALTER TABLE "DramaEpisode" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DramaEpisode" ADD COLUMN "factsStatus" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "DramaStoryboard" ADD COLUMN "sourceRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DramaFact" ADD COLUMN "sourceRevision" INTEGER;
ALTER TABLE "DramaFact" ADD COLUMN "stale" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DramaEpisodeRevision" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "episodeId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL,
 "title" TEXT NOT NULL,
 "content" TEXT,
 "hookOpening" TEXT,
 "cliffhanger" TEXT,
 "durationSec" INTEGER,
 "source" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CONSTRAINT "DramaEpisodeRevision_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DramaEpisodeRevision_episodeId_revision_key" ON "DramaEpisodeRevision"("episodeId", "revision");

CREATE TABLE "DramaRenderJob" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "projectId" TEXT NOT NULL,
 "episodeId" TEXT NOT NULL,
 "storyboardId" TEXT NOT NULL,
 "sourceRevision" INTEGER NOT NULL,
 "snapshotJson" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'queued',
 "progress" INTEGER NOT NULL DEFAULT 0,
 "resultUrl" TEXT,
 "failureReason" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DramaRenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "DramaRenderJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DramaRenderJob_projectId_episodeId_createdAt_idx" ON "DramaRenderJob"("projectId", "episodeId", "createdAt");
CREATE INDEX "DramaRenderJob_status_idx" ON "DramaRenderJob"("status");

-- Legacy non-Compose chains did not include character image state columns.
ALTER TABLE "DramaCharacter" ADD COLUMN IF NOT EXISTS "portraitData" TEXT;
ALTER TABLE "DramaCharacter" ADD COLUMN IF NOT EXISTS "threeViewData" TEXT;
