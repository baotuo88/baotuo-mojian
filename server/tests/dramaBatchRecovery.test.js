const test = require("node:test");
const assert = require("node:assert/strict");
require("./fixtures/dramaTestDatabase.cjs")();
const { prisma } = require("../dist/db/prisma.js");
const { DramaBatchOrchestrator } = require("../dist/services/drama/production/index.js");

test.after(async () => prisma.$disconnect());

async function fixture(count = 3) {
  const project = await prisma.dramaProject.create({ data: { title: "短剧恢复回归", source: "original" } });
  const episode = await prisma.dramaEpisode.create({ data: { projectId: project.id, order: 1, title: "首集" } });
  const storyboard = await prisma.dramaStoryboard.create({ data: {
    projectId: project.id, episodeId: episode.id,
    shots: { create: Array.from({ length: count }, (_, index) => ({ order: index + 1, action: `镜头 ${index + 1}`, durationSec: 5 })) },
  }, include: { shots: { orderBy: { order: "asc" } } } });
  return { project, episode, storyboard };
}

const input = { type: "keyframes", provider: "openai" };
const manual = { autoStart: false };
const progress = (job) => JSON.parse(job.progress);

function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("duplicate creation shares one pending job and completed jobs never execute again", async () => {
  const { project } = await fixture(1);
  let calls = 0;
  const worker = new DramaBatchOrchestrator({ generateKeyframe: async () => { calls += 1; } });
  const [one, two] = await Promise.all([
    worker.createEpisodeBatchJob(project.id, 1, input, manual),
    worker.createEpisodeBatchJob(project.id, 1, input, manual),
  ]);
  assert.equal(one.id, two.id);
  await Promise.all([worker.runBatchJob(one.id), new DramaBatchOrchestrator({ generateKeyframe: async () => { calls += 1; } }).runBatchJob(one.id)]);
  assert.equal(calls, 1);
  const done = await worker.runBatchJob(one.id);
  assert.equal(done.status, "done");
  assert.equal(calls, 1);
});

test("pause finishes current shot; resume preserves completed shots and accumulated cost", async () => {
  process.env.DRAMA_IMAGE_COST_PER_IMAGE_OPENAI = "1.25";
  const { project } = await fixture();
  const started = gate();
  const release = gate();
  const calls = [];
  const worker = new DramaBatchOrchestrator({ generateKeyframe: async (id) => {
    calls.push(id);
    if (calls.length === 1) { started.resolve(); await release.promise; }
  } });
  const job = await worker.createEpisodeBatchJob(project.id, 1, input, manual);
  const running = worker.runBatchJob(job.id);
  await started.promise;
  const pausing = await worker.pauseBatchJob(project.id, job.id);
  assert.equal(progress(pausing).pauseRequested, true);
  release.resolve();
  const paused = await running;
  assert.equal(paused.status, "paused");
  assert.equal(progress(paused).done, 1);
  assert.equal(progress(paused).cost.actual, 1.25);
  await assert.rejects(worker.resumeBatchJob(project.id, job.id, false, manual), /确认/);
  await worker.resumeBatchJob(project.id, job.id, true, manual);
  const done = await worker.runBatchJob(job.id);
  assert.equal(done.status, "done");
  assert.equal(new Set(calls).size, 3);
  assert.equal(calls.length, 3);
  assert.equal(progress(done).cost.actual, 3.75);
  assert.equal(progress(done).done, 3);
});

test("restart exposes interrupted work without issuing provider requests", async () => {
  const { project, storyboard } = await fixture(2);
  let calls = 0;
  const worker = new DramaBatchOrchestrator({ generateKeyframe: async () => { calls += 1; } });
  const job = await worker.createEpisodeBatchJob(project.id, 1, input, manual);
  const saved = progress(job);
  saved.done = 1;
  saved.completedShotIds = [storyboard.shots[0].id];
  saved.currentShotId = storyboard.shots[1].id;
  await prisma.dramaBatchJob.update({ where: { id: job.id }, data: { status: "running", progress: JSON.stringify(saved) } });
  await worker.recoverInterruptedJobs();
  const paused = await prisma.dramaBatchJob.findUnique({ where: { id: job.id } });
  assert.equal(paused.status, "paused");
  assert.match(progress(paused).interruptionReason, /额外费用/);
  assert.equal(calls, 0);
  await worker.resumeBatchJob(project.id, job.id, true, manual);
  const done = await worker.runBatchJob(job.id);
  assert.equal(calls, 1);
  assert.equal(progress(done).done, 2);
});

test("changed storyboard prevents stale work and allows a new pinned task", async () => {
  const { project, episode } = await fixture(1);
  let calls = 0;
  const worker = new DramaBatchOrchestrator({ generateKeyframe: async () => { calls += 1; } });
  const job = await worker.createEpisodeBatchJob(project.id, 1, input, manual);
  await worker.pauseBatchJob(project.id, job.id);
  const newer = await prisma.dramaStoryboard.create({ data: {
    projectId: project.id, episodeId: episode.id, createdAt: new Date(Date.now() + 1000),
    shots: { create: [{ order: 1, action: "新分镜" }] },
  } });
  await assert.rejects(worker.resumeBatchJob(project.id, job.id, true, manual), /分镜已变化/);
  const replacement = await worker.createEpisodeBatchJob(project.id, 1, input, manual);
  assert.notEqual(replacement.id, job.id);
  assert.equal(progress(replacement).storyboardId, newer.id);
  assert.equal(calls, 0);
  await worker.pauseBatchJob(project.id, replacement.id);
  await worker.resumeBatchJob(project.id, replacement.id, true, manual);
  await worker.runBatchJob(replacement.id);
  assert.equal(calls, 1);
});

test("failed shots can resume without regenerating successful shots or resetting cost", async () => {
  const { project, storyboard } = await fixture(2);
  let shouldFail = true;
  const calls = [];
  const worker = new DramaBatchOrchestrator({ generateKeyframe: async (id) => {
    calls.push(id);
    if (id === storyboard.shots[1].id && shouldFail) throw new Error("供应商暂时不可用");
  } });
  const job = await worker.createEpisodeBatchJob(project.id, 1, input, manual);
  const failed = await worker.runBatchJob(job.id);
  assert.equal(failed.status, "failed");
  assert.deepEqual(progress(failed).failedShotIds, [storyboard.shots[1].id]);
  shouldFail = false;
  await worker.resumeBatchJob(project.id, job.id, true, manual);
  const done = await worker.runBatchJob(job.id);
  assert.equal(done.status, "done");
  assert.equal(progress(done).failed, 0);
  assert.equal(progress(done).done, 2);
  assert.deepEqual(calls, [storyboard.shots[0].id, storyboard.shots[1].id, storyboard.shots[1].id]);
  assert.equal(progress(done).cost.actual, 2.5);
});

test("project ownership and empty legacy targets cannot bypass recovery validation", async () => {
  const { project } = await fixture(1);
  const worker = new DramaBatchOrchestrator({ generateKeyframe: async () => assert.fail("must not invoke") });
  const job = await worker.createEpisodeBatchJob(project.id, 1, input, manual);
  await assert.rejects(worker.pauseBatchJob("another-project", job.id), /未找到/);
  await prisma.dramaBatchJob.update({ where: { id: job.id }, data: { progress: '{"provider":"openai"}' } });
  const result = await worker.runBatchJob(job.id);
  assert.equal(result.status, "failed");
  assert.match(progress(result).interruptionReason, /镜头缺失/);
});
