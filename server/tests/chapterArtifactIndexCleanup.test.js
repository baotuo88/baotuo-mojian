const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { ragServices } = require("../dist/services/rag/index.js");
const { syncChapterArtifacts } = require("../dist/services/novel/novelChapterArtifacts.js");
const {
  ChapterArtifactSyncService,
} = require("../dist/services/novel/runtime/ChapterArtifactSyncService.js");
const {
  chapterArtifactBackgroundSyncService,
} = require("../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService.js");

for (const [path, sync] of [
  ["editor", () => syncChapterArtifacts("novel-1", "chapter-1", "林远活着回到了城里。")],
  [
    "production",
    () =>
      new ChapterArtifactSyncService().syncChapterArtifacts(
        "novel-1",
        "chapter-1",
        "林远活着回到了城里。",
        { scheduleBackgroundSync: false },
      ),
  ],
]) {
  for (const mode of ["healthy", "queue_failure", "stale_content"]) {
    const rejectQueue = mode === "queue_failure";
    test(`${path} artifact replacement: ${mode}`, async () => {
      const originals = [];
      const replace = (object, key, value) => {
        originals.push(() => {
          object[key] = value;
        });
        object[key] = value;
      };
      let facts = [{ id: "old-fact" }];
      let timelines = [{ id: "old-timeline" }];
      let jobs = [];
      const tx = {
        chapter: {
          findFirst: async () => ({
            content: mode === "stale_content" ? "用户刚保存的新正文" : "林远活着回到了城里。",
            updatedAt: new Date(0),
          }),
          updateMany: async () => ({ count: 1 }),
        },
        ragIndexJob: {
          findMany: async () => [],
          create: async ({ data }) => {
            if (rejectQueue) throw new Error("queue unavailable");
            const job = { id: `cleanup-${jobs.length}`, ...data };
            jobs.push(job);
            return job;
          },
        },
        chapterSummary: { upsert: async () => ({}) },
        consistencyFact: {
          findMany: async () => facts,
          deleteMany: async () => {
            assert.equal(
              jobs.some((job) => job.ownerId === "old-fact" && job.jobType === "delete"),
              true,
            );
            facts = [];
            return { count: 1 };
          },
          createMany: async () => {
            facts = [{ id: "new-fact" }];
            return { count: 1 };
          },
        },
        characterTimeline: {
          findMany: async () => timelines,
          deleteMany: async () => {
            assert.equal(
              jobs.some((job) => job.ownerId === "old-timeline" && job.jobType === "delete"),
              true,
            );
            timelines = [];
            return { count: 1 };
          },
          createMany: async () => {
            timelines = [{ id: "new-timeline" }];
            return { count: 1 };
          },
        },
      };
      replace(prisma, "$transaction", async (run) => {
        const before = { facts: [...facts], timelines: [...timelines], jobs: [...jobs] };
        try {
          return await run(tx);
        } catch (error) {
          ({ facts, timelines, jobs } = before);
          throw error;
        }
      });
      replace(prisma.chapter, "findFirst", async () => ({ order: 1, title: "归来" }));
      replace(prisma.character, "findMany", async () => [{ id: "hero", name: "林远" }]);
      replace(prisma.consistencyFact, "findMany", async () => facts);
      replace(prisma.characterTimeline, "findMany", async () => timelines);
      replace(prisma.ragIndexJob, "findMany", async () => []);
      replace(prisma.ragIndexJob, "create", tx.ragIndexJob.create);
      replace(chapterArtifactBackgroundSyncService, "scheduleChapterSync", () => {});
      try {
        if (mode === "stale_content") {
          await assert.rejects(sync, /旧正文的资料更新已取消/);
          assert.deepEqual(facts, [{ id: "old-fact" }]);
          assert.equal(jobs.length, 0);
        } else if (rejectQueue) {
          await assert.rejects(sync, /queue unavailable/);
          assert.deepEqual(facts, [{ id: "old-fact" }]);
          assert.equal(jobs.length, 0);
        } else {
          await sync();
          assert.deepEqual(
            jobs
              .filter((job) => job.jobType === "delete")
              .map((job) => [job.jobType, job.ownerType, job.ownerId]),
            [
              ["delete", "consistency_fact", "old-fact"],
              ["delete", "character_timeline", "old-timeline"],
            ],
          );
        }
      } finally {
        originals.reverse().forEach((restore) => restore());
      }
    });
  }
}
