const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/comicProductionFixture.cjs');
const { ComicBatchOrchestrator } = require('../dist/services/comic/ComicBatchOrchestrator');
const { runWithExecutionScope } = require('../dist/platform/execution');

test('concurrent starts have a single persisted owner and keep the exact episode, provider and scope', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([f.service.startEpisodeBatch('episode', { provider: 'grok' }),
    f.service.startEpisodeBatch('episode', { provider: 'grok' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.pending.length, 1);
  const jobs = await f.raw.comicBatchJob.findMany(); assert.equal(jobs.length, 1);
  assert.equal(jobs[0].episodeId, 'episode');
  const p = await f.progress(jobs[0].id); assert.equal(p.provider, 'grok');
  assert.deepEqual(p.targetPanelIds, ['panel-1', 'panel-2', 'panel-3']);
  await f.pending.shift()();
  assert.equal((await f.service.getBatchJob(jobs[0].id)).status, 'completed');
  assert.equal((await f.progress(jobs[0].id)).done, 3);
});

test('restart projects recovery without spending and reuses an image published before the last progress write', async t => {
  const f = await fixture(t);
  const { jobId } = await f.service.startEpisodeBatch('episode', { provider: 'grok', concurrency: 2 });
  await f.publish('panel-1', f.raw); await f.expire(jobId); f.pending.length = 0;
  const restarted = new ComicBatchOrchestrator(f.deps);
  assert.equal((await restarted.getBatchJob(jobId)).status, 'interrupted');
  assert.equal(f.pending.length, 0); assert.equal(f.calls.length, 0);
  await restarted.retryFailed(jobId); await f.pending.shift()();
  assert.deepEqual(f.calls.map(c => c.id).sort(), ['panel-2', 'panel-3']);
  assert.ok(f.calls.every(c => c.provider === 'grok'));
  assert.equal((await f.progress(jobId)).done, 3);
});

test('partial retry preserves successful panels and rejects silently switching the paid provider', async t => {
  const f = await fixture(t); let fail = true;
  const service = new ComicBatchOrchestrator({ ...f.deps, generate: async (id, provider) => {
    f.calls.push({ id, provider }); if (id === 'panel-2' && fail) throw new Error('provider failed');
    await f.publish(id);
  } });
  const { jobId } = await service.startEpisodeBatch('episode', { provider: 'grok' });
  await f.pending.shift()(); assert.equal((await service.getBatchJob(jobId)).status, 'partial');
  await assert.rejects(service.retryFailed(jobId, { provider: 'openai' }), e => e.statusCode === 409);
  fail = false; f.calls.length = 0;
  await service.retryFailed(jobId); await f.pending.shift()();
  assert.deepEqual(f.calls, [{ id: 'panel-2', provider: 'grok' }]);
  assert.equal((await f.progress(jobId)).done, 3);
});

test('changed or replaced scripts cannot reuse the old confirmed batch scope', async t => {
  const f = await fixture(t);
  const { jobId } = await f.service.startEpisodeBatch('episode'); await f.expire(jobId);
  await f.raw.comicPanel.updateMany({ where: { id: 'panel-1' }, data: { dialogues: '[{"speaker":"甲","text":"修改"}]' } });
  await assert.rejects(f.service.retryFailed(jobId), e => e.statusCode === 409);
  assert.equal(f.calls.length, 0);
  await f.service.startEpisodeBatch('episode'); // A fresh user confirmation can start the changed scope.
});

test('stopping a batch fences late image publication and leaves it resumable', async t => {
  const f = await fixture(t); let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let lateError;
  const service = new ComicBatchOrchestrator({ ...f.deps, generate: async id => {
    entered(); await gate;
    try { await f.publish(id); } catch (e) { lateError = e; throw e; }
  } });
  const { jobId } = await service.startEpisodeBatch('episode', { concurrency: 1 });
  const running = f.pending.shift()(); await ready; await service.cancel(jobId); release(); await running;
  assert.equal(lateError.name, 'ExecutionStoppedError');
  assert.equal((await f.raw.comicPanel.findUnique({ where: { id: 'panel-1' } })).imageData, null);
  assert.equal((await service.getBatchJob(jobId)).status, 'cancelled');
  await f.service.retryFailed(jobId); await f.pending.shift()();
  assert.equal((await f.service.getBatchJob(jobId)).status, 'completed');
});

test('an expired or replaced batch lease rejects a worker even without a local cancellation signal', async t => {
  const f = await fixture(t);
  const { jobId } = await f.service.startEpisodeBatch('episode'); const old = await f.progress(jobId);
  await f.expire(jobId);
  await assert.rejects(runWithExecutionScope({ fence: { kind: 'comic_batch', jobId, leaseOwner: old.leaseOwner } },
    () => f.publish('panel-1')), { name: 'ExecutionStoppedError' });
  await f.service.retryFailed(jobId);
  await assert.rejects(runWithExecutionScope({ fence: { kind: 'comic_batch', jobId, leaseOwner: old.leaseOwner } },
    () => f.publish('panel-1')), { name: 'ExecutionStoppedError' });
});

test('legacy jobs cannot guess a source episode and planning archives are excluded from production', async t => {
  const f = await fixture(t);
  await f.raw.comicBatchJob.create({ data: { id: 'legacy', projectId: 'project', type: 'episode_image_batch', status: 'running', progress: '{}' } });
  await f.raw.comicBatchJob.create({ data: { id: 'backup', projectId: 'project', type: 'planning_backup', status: 'completed', progress: '{}' } });
  const jobs = await f.service.listBatchJobs('project'); assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'interrupted'); assert.equal(JSON.parse(jobs[0].progress).episodeId, undefined);
  await assert.rejects(f.service.retryFailed('legacy'), e => e.statusCode === 409);
  assert.equal(await f.service.getBatchJob('backup'), null);
});

test('estimate and skip-done reject stale images and do not invent a fixed price', async t => {
  const f = await fixture(t); await f.publish('panel-1', f.raw);
  await f.publish('panel-2', f.raw);
  await f.raw.comicPanel.updateMany({ where: { id: 'panel-2' }, data: { visualPrompt: 'edited prompt' } });
  const estimate = await f.service.estimateCost('episode', 'grok');
  assert.equal(estimate.pendingPanels, 2); assert.equal(estimate.estimatedCentsCost, null);
  const { jobId } = await f.service.startEpisodeBatch('episode');
  assert.deepEqual((await f.progress(jobId)).targetPanelIds, ['panel-2', 'panel-3']);
});

test('progress write failure stops further paid requests and exposes recoverable interruption', async t => {
  const f = await fixture(t);
  const db = new Proxy(f.client, { get(target, key) {
    if (key === 'comicBatchJob') return new Proxy(target.comicBatchJob, { get(delegate, method) {
      if (method === 'updateMany') return async args => {
        if (args.data.status === 'running') throw new Error('storage unavailable');
        return delegate.updateMany(args);
      };
      return delegate[method];
    } });
    return Reflect.get(target, key);
  } });
  const service = new ComicBatchOrchestrator({ ...f.deps, db });
  const { jobId } = await service.startEpisodeBatch('episode', { concurrency: 1 });
  await f.pending.shift()();
  assert.equal(f.calls.length, 1);
  assert.equal((await service.getBatchJob(jobId)).status, 'interrupted');
  await f.service.retryFailed(jobId); await f.pending.shift()();
  assert.equal(f.calls.length, 3, 'resume skips the already published first image');
});

test('batch publication validates ownership without extending heartbeat timestamps', async t => {
  const f = await fixture(t);
  const { jobId } = await f.service.startEpisodeBatch('episode'); const p = await f.progress(jobId);
  const before = await f.raw.comicBatchJob.findUnique({ where: { id: jobId } });
  await runWithExecutionScope({ fence: { kind: 'comic_batch', jobId, leaseOwner: p.leaseOwner } }, () => f.publish('panel-1'));
  const after = await f.raw.comicBatchJob.findUnique({ where: { id: jobId } });
  assert.equal(after.progress, before.progress);
  assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
});

test('a scope changed after cost confirmation cannot start a larger or different paid batch', async t => {
  const f = await fixture(t);
  const estimate = await f.service.estimateCost('episode');
  await f.raw.comicPanel.updateMany({ where: { id: 'panel-1' }, data: { visualPrompt: 'changed after confirmation' } });
  await assert.rejects(f.service.startEpisodeBatch('episode', { expectedScopeFingerprint: estimate.scopeFingerprint }), e => e.statusCode === 409);
  assert.equal(f.pending.length, 0); assert.equal(await f.raw.comicBatchJob.count(), 0);
});

test('changed model settings require renewed confirmation instead of silently changing retry costs', async t => {
  const f = await fixture(t);
  const { jobId } = await f.service.startEpisodeBatch('episode'); await f.expire(jobId);
  const changed = new ComicBatchOrchestrator({ ...f.deps, resolveModel: async () => 'different-model' });
  await assert.rejects(changed.retryFailed(jobId), e => e.statusCode === 409);
  assert.equal(f.calls.length, 0);
});
