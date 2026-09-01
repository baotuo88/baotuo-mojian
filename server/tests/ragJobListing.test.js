const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");
const { RagJobCleanupService } = require("../dist/services/rag/RagJobCleanupService.js");

test("listJobs requests the most recently updated jobs first for UI polling", async () => {
  const service = new RagIndexService({}, {});
  const originalFindMany = prisma.ragIndexJob.findMany;
  const calls = [];

  prisma.ragIndexJob.findMany = async (args) => {
    calls.push(args);
    return [];
  };

  try {
    await service.listJobs(30);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].orderBy, [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ]);
    assert.equal(calls[0].take, 30);
  } finally {
    prisma.ragIndexJob.findMany = originalFindMany;
  }
});

test("claimNextRunnableJob lets only one concurrent worker claim a queued job", async () => {
  const service = new RagIndexService({}, {});
  const originalFindFirst = prisma.ragIndexJob.findFirst;
  const originalUpdateMany = prisma.ragIndexJob.updateMany;
  const originalFindUnique = prisma.ragIndexJob.findUnique;
  const originalUpdate = prisma.ragIndexJob.update;
  let updateManyCalls = 0;
  let findUniqueCalls = 0;

  const job = {
    id: "rag-job-race",
    payloadJson: null,
    status: "running",
    attempts: 1,
  };
  prisma.ragIndexJob.findFirst = async () => ({ id: job.id });
  prisma.ragIndexJob.updateMany = async (args) => {
    updateManyCalls += 1;
    assert.deepEqual(args.where, {
      id: job.id,
      status: "queued",
      runAfter: args.where.runAfter,
    });
    return { count: updateManyCalls === 1 ? 1 : 0 };
  };
  prisma.ragIndexJob.findUnique = async () => {
    findUniqueCalls += 1;
    return findUniqueCalls % 2 === 1 ? job : { payloadJson: null };
  };
  prisma.ragIndexJob.update = async () => job;

  try {
    const results = await Promise.all([
      service.claimNextRunnableJob("worker-a"),
      service.claimNextRunnableJob("worker-b"),
    ]);

    assert.equal(updateManyCalls, 2);
    assert.equal(results.filter(Boolean).length, 1);
  } finally {
    prisma.ragIndexJob.findFirst = originalFindFirst;
    prisma.ragIndexJob.updateMany = originalUpdateMany;
    prisma.ragIndexJob.findUnique = originalFindUnique;
    prisma.ragIndexJob.update = originalUpdate;
  }
});

test("clearFinishedJobs deletes only terminal job records", async () => {
  const service = new RagJobCleanupService();
  const originalTransaction = prisma.$transaction;
  const originalCount = prisma.ragIndexJob.count;
  const originalDeleteMany = prisma.ragIndexJob.deleteMany;
  const calls = [];

  prisma.$transaction = async (operations) => Promise.all(operations);
  prisma.ragIndexJob.count = async (args) => {
    calls.push(["count", args]);
    return 2;
  };
  prisma.ragIndexJob.deleteMany = async (args) => {
    calls.push(["deleteMany", args]);
    return { count: 7 };
  };

  try {
    const result = await service.clearFinishedJobs();

    assert.deepEqual(result, {
      deletedCount: 7,
      activeCount: 2,
    });
    assert.deepEqual(calls[0], [
      "count",
      {
        where: {
          status: {
            in: ["queued", "running"],
          },
        },
      },
    ]);
    assert.deepEqual(calls[1], [
      "deleteMany",
      {
        where: {
          status: {
            in: ["succeeded", "failed", "cancelled"],
          },
        },
      },
    ]);
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.ragIndexJob.count = originalCount;
    prisma.ragIndexJob.deleteMany = originalDeleteMany;
  }
});

test("deleteFinishedJob keeps active job records", async () => {
  const service = new RagJobCleanupService();
  const originalFindUnique = prisma.ragIndexJob.findUnique;
  const originalDelete = prisma.ragIndexJob.delete;
  let deleteCalled = false;

  prisma.ragIndexJob.findUnique = async () => ({ status: "running" });
  prisma.ragIndexJob.delete = async () => {
    deleteCalled = true;
    return {};
  };

  try {
    const result = await service.deleteFinishedJob("rag-job-running");

    assert.deepEqual(result, {
      deletedCount: 0,
      status: "running",
    });
    assert.equal(deleteCalled, false);
  } finally {
    prisma.ragIndexJob.findUnique = originalFindUnique;
    prisma.ragIndexJob.delete = originalDelete;
  }
});
