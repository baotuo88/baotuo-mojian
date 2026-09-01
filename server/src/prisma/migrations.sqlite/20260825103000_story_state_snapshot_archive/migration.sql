CREATE TABLE "StoryStateSnapshotArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "sourceChapterOrder" INTEGER,
    "summary" TEXT,
    "snapshotJson" TEXT NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryStateSnapshotArchive_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoryStateSnapshotArchive_novelId_sourceChapterId_key" ON "StoryStateSnapshotArchive"("novelId", "sourceChapterId");
CREATE INDEX "StoryStateSnapshotArchive_novelId_sourceChapterOrder_idx" ON "StoryStateSnapshotArchive"("novelId", "sourceChapterOrder");
CREATE INDEX "StoryStateSnapshotArchive_novelId_archivedAt_idx" ON "StoryStateSnapshotArchive"("novelId", "archivedAt");
