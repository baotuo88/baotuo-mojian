const test = require("node:test");
const assert = require("node:assert/strict");

const { ragConfig } = require("../dist/config/rag.js");
const { RagWorker } = require("../dist/services/rag/RagWorker.js");

function createJob(overrides = {}) {
  return {
    id: "rag-worker-job",
    jobType: "rebuild",
    ownerType: "novel",
    ownerId: "novel-1",
    tenantId: "default",
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    ...overrides,
  };
}

test("RAG worker requeues a failed job with exponential backoff", async () => {
  const job = createJob({ attempts: 2, maxAttempts: 4 });
  const updates = [];
  const service = {
    claimNextRunnableJob: async () => job,
    processJob: async () => {
      throw new Error("embedding unavailable");
    },
    updateJobStatus: async (id, input) => updates.push({ id, input }),
  };
  const worker = new RagWorker(service);
  const originalBase = ragConfig.workerRetryBaseMs;
  ragConfig.workerRetryBaseMs = 100;

  try {
    await worker.tick();
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, job.id);
    assert.equal(updates[0].input.status, "queued");
    assert.equal(updates[0].input.attempts, 2);
    assert.equal(updates[0].input.lastError, "embedding unavailable");
    assert.ok(updates[0].input.runAfter instanceof Date);
    assert.ok(updates[0].input.runAfter.getTime() >= Date.now() + 190);
  } finally {
    ragConfig.workerRetryBaseMs = originalBase;
  }
});

test("RAG worker permanently fails a job at max attempts", async () => {
  const job = createJob({ attempts: 3, maxAttempts: 3 });
  const updates = [];
  const service = {
    claimNextRunnableJob: async () => job,
    processJob: async () => {
      throw new Error("invalid vector response");
    },
    updateJobStatus: async (id, input) => updates.push({ id, input }),
  };
  const worker = new RagWorker(service);

  await worker.tick();

  assert.deepEqual(updates, [{
    id: job.id,
    input: {
      status: "failed",
      attempts: 3,
      lastError: "invalid vector response",
    },
  }]);
});

test("RAG worker requeues running jobs during restart recovery", async () => {
  const updates = [];
  const runningJobs = [createJob({ id: "interrupted-job", lastError: null })];
  const service = {
    listJobs: async (limit, status) => {
      assert.equal(limit, 500);
      assert.equal(status, "running");
      const result = runningJobs.splice(0);
      return result;
    },
    updateJobStatus: async (id, input) => updates.push({ id, input }),
  };
  const worker = new RagWorker(service);

  await worker.requeueInterruptedJobs();

  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "interrupted-job");
  assert.equal(updates[0].input.status, "queued");
  assert.ok(updates[0].input.runAfter instanceof Date);
  assert.equal(updates[0].input.lastError, "RAG worker restarted; interrupted job requeued.");
});
