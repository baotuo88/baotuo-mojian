const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const { sourceLoader } = require('./helpers/comicAssetFixture.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-export-recovery-'));
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:' + path.join(root, 'fixture.sqlite') }) });
  t.after(() => db.$disconnect());
  await db.$executeRawUnsafe('CREATE TABLE ComicExportJob (id TEXT PRIMARY KEY, projectId TEXT, episodeId TEXT, format TEXT, spec TEXT, status TEXT, artifacts TEXT, createdAt DATETIME, updatedAt DATETIME)');
  let aborted = false;
  const load = sourceLoader({ '/db/prisma': { prisma: db },
    '/runtime/appPaths': { resolveGeneratedImagesRoot: () => root },
    '/middleware/errorHandler': { AppError: class extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } } },
    '/platform/execution': { throwIfExecutionAborted() { if (aborted) throw new Error('execution aborted'); } },
  });
  const { ExportJobLease, EXPORT_LEASE_MS } = load(path.join(__dirname, '../src/services/comic/export/ExportJobLease.ts'));
  const { comicExportService } = load(path.join(__dirname, '../src/services/comic/ComicExportService.ts'));
  async function job(id, stale = false) {
    await db.comicExportJob.create({ data: { id, projectId: 'project', status: 'processing', format: 'sliced',
      spec: JSON.stringify({ inputSnapshot: { panels: [{ id: 'panel' }] } }),
      updatedAt: new Date(Date.now() - (stale ? EXPORT_LEASE_MS + 1000 : 1000)) } });
  }
  return { db, ExportJobLease, service: comicExportService, job, abort() { aborted = true; } };
}

test('reading export history recovers interrupted work and retains frozen snapshot metadata', async t => {
  const f = await fixture(t); await f.job('stale', true); await f.job('active');
  const jobs = await f.service.listExportJobs('project');
  const failed = jobs.find(j => j.id === 'stale');
  assert.equal(failed.status, 'error'); assert.equal(JSON.parse(failed.artifacts).retryable, true);
  assert.equal(JSON.parse(failed.spec).inputSnapshot.panels[0].id, 'panel');
  assert.equal(jobs.find(j => j.id === 'active').status, 'processing');
});

test('an expired export cannot publish even if no reader has triggered recovery', async t => {
  const f = await fixture(t); await f.job('job', true); const lease = new f.ExportJobLease('job');
  await assert.rejects(lease.complete([{ filePath: 'partial.png' }]), e => e.statusCode === 409);
  await lease.fail(new Error('interrupted'));
  const job = await f.service.getExportJob('job'); assert.equal(job.status, 'error');
  assert.equal(await f.service.getArtifactFile('job', 'partial.png'), null);
});

test('active heartbeat extends the lease and terminal jobs cannot be resurrected', async t => {
  const f = await fixture(t); await f.job('job'); const lease = new f.ExportJobLease('job');
  const before = await f.service.getExportJob('job');
  await lease.heartbeat();
  const current = await f.service.getExportJob('job'); assert.ok(current.updatedAt > before.updatedAt);
  await lease.complete([{ filePath: 'complete.png' }]);
  await lease.fail(new Error('late callback'));
  assert.equal((await f.service.getExportJob('job')).status, 'done');
});

test('heartbeat cannot revive an expired export or overwrite its recovery result', async t => {
  const f = await fixture(t); await f.job('job', true); const lease = new f.ExportJobLease('job');
  await lease.heartbeat();
  assert.equal((await f.service.getExportJob('job')).status, 'error');
  await assert.rejects(lease.complete([]), e => e.statusCode === 409);
});

test('cancelled execution cannot publish an otherwise live export', async t => {
  const f = await fixture(t); await f.job('job'); const lease = new f.ExportJobLease('job');
  f.abort(); await assert.rejects(lease.complete([]), /execution aborted/);
  await lease.fail(new Error('execution aborted'));
  assert.equal((await f.service.getExportJob('job')).status, 'error');
});
