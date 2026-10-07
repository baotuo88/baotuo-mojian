const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");

function installQueue() {
  const originals = {};
  const jobs = [];
  let sequence = 0;
  let transactionTail = Promise.resolve();
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (key === "AND") return value.every((clause) => matches(row, clause));
      if (key === "OR") return value.some((clause) => matches(row, clause));
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if (value.in) return value.in.includes(row[key]);
        if ("lte" in value) return row[key] <= value.lte;
        if ("not" in value) return row[key] !== value.not;
      }
      return row[key] === value;
    });
  const copy = (row) => (row ? { ...row } : null);
  const find = (args) =>
    jobs
      .filter((row) => matches(row, args.where))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const methods = {
    findMany: async (args) => find(args).map(copy),
    findFirst: async (args) => copy(find(args)[0]),
    findUnique: async (args) => copy(jobs.find((row) => row.id === args.where.id)),
    create: async ({ data }) => {
      const row = {
        id: `job-${++sequence}`,
        createdAt: new Date(sequence),
        updatedAt: new Date(),
        payloadJson: null,
        ...data,
      };
      jobs.push(row);
      return copy(row);
    },
    update: async ({ where, data }) => {
      const row = jobs.find((row) => matches(row, where));
      if (!row) throw new Error("Missing job");
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined)
          row[key] =
            value && typeof value === "object" && "increment" in value
              ? row[key] + value.increment
              : value;
      }
      return copy(row);
    },
    updateMany: async ({ where, data }) => {
      const rows = jobs.filter((row) => matches(row, where));
      for (const row of rows) await methods.update({ where: { id: row.id }, data });
      return { count: rows.length };
    },
  };
  for (const [key, value] of Object.entries(methods)) {
    originals[key] = prisma.ragIndexJob[key];
    prisma.ragIndexJob[key] = value;
  }
  const oldTransaction = prisma.$transaction;
  prisma.$transaction = (callback) => {
    const current = transactionTail.then(() => callback(prisma));
    transactionTail = current.catch(() => {});
    return current;
  };
  return {
    jobs,
    restore() {
      Object.assign(prisma.ragIndexJob, originals);
      prisma.$transaction = oldTransaction;
    },
  };
}

test("saving while an owner is indexing leaves a durable successor that reads the new source", async () => {
  const queue = installQueue();
  const service = new RagIndexService({}, {}, {});
  try {
    const first = await service.enqueueUpsert("chapter", "chapter-1");
    const running = await service.claimNextRunnableJob("worker-1");
    assert.equal(running.id, first.id);
    const successor = await service.enqueueUpsert("chapter", "chapter-1");
    assert.notEqual(successor.id, first.id);
    assert.equal(successor.status, "queued");
    assert.equal(await service.claimNextRunnableJob("worker-2"), null);
    await service.updateJobStatus(first.id, { status: "succeeded" });
    const followup = await service.claimNextRunnableJob("worker-2");
    assert.equal(followup.id, successor.id);
  } finally {
    queue.restore();
  }
});

test("concurrent owner updates coalesce without merging different owners", async () => {
  const queue = installQueue();
  const service = new RagIndexService({}, {}, {});
  try {
    const results = await Promise.all([
      service.enqueueUpsert("chapter", "one"),
      service.enqueueUpsert("chapter", "one"),
      service.enqueueUpsert("chapter", "two"),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.notEqual(results[0].id, results[2].id);
    assert.equal(queue.jobs.filter((row) => row.status === "queued").length, 2);
  } finally {
    queue.restore();
  }
});

test("delete waits for the running upsert and supersedes queued upserts for the same owner", async () => {
  const queue = installQueue();
  const service = new RagIndexService({}, {}, {});
  try {
    await service.enqueueUpsert("consistency_fact", "fact-1");
    const running = await service.claimNextRunnableJob("worker-1");
    await service.enqueueUpsert("consistency_fact", "fact-1");
    await service.enqueueDelete("consistency_fact", "fact-1");
    await service.enqueueUpsert("chapter", "independent");
    const independent = await service.claimNextRunnableJob("worker-2");
    assert.equal(independent.ownerId, "independent");
    await service.updateJobStatus(running.id, { status: "succeeded" });
    const deletion = await service.claimNextRunnableJob("worker-3");
    assert.equal(deletion.jobType, "delete");
    assert.equal(deletion.ownerId, "fact-1");
    assert.equal(
      queue.jobs.some((row) => row.status === "queued" && row.ownerId === "fact-1"),
      false,
    );
  } finally {
    queue.restore();
  }
});

test("concurrent claims never run two jobs for one owner while other owners can progress", async () => {
  const queue = installQueue();
  const service = new RagIndexService({}, {}, {});
  try {
    for (const [ownerId, jobType] of [
      ["one", "upsert"],
      ["one", "delete"],
      ["two", "upsert"],
    ]) {
      await prisma.ragIndexJob.create({
        data: {
          tenantId: "default",
          ownerType: "chapter",
          ownerId,
          jobType,
          status: "queued",
          attempts: 0,
          runAfter: new Date(0),
        },
      });
    }
    const claims = (
      await Promise.all([
        service.claimNextRunnableJob("a"),
        service.claimNextRunnableJob("b"),
        service.claimNextRunnableJob("c"),
      ])
    ).filter(Boolean);
    assert.equal(claims.length, 2);
    assert.equal(new Set(claims.map((row) => row.ownerId)).size, 2);
  } finally {
    queue.restore();
  }
});
