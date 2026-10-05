const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const os = require('node:os');
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
function loadService(f) {
  const file = path.resolve(__dirname, '../src/services/drama/DramaVideoPromptService.ts');
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, process: { env: { NODE_ENV: f.nodeEnv ?? 'test' } }, console, Date, Set, Map, JSON, require(id) {
    if (id.endsWith('/db/prisma')) return { prisma: f.db };
    if (id.endsWith('/middleware/errorHandler')) return { AppError };
    if (id.endsWith('/prompting/core/promptRunner')) return { runStructuredPrompt: (...args) => f.prompt(...args) };
    if (id.endsWith('/prompts/drama/drama.prompts')) return { dramaVideoPromptPrompt: { id: 'drama.video.prompt' } };
    if (id === './DramaContextAssembler') return { dramaContextAssembler: { buildEpisodeContext: async () => ({ charactersDigest: '主角' }) } };
    if (id === './utils/json') return { safeJsonParse: (raw, fallback) => { try { return JSON.parse(raw) ?? fallback; } catch { return fallback; } } };
    if (id === './video/VideoProviderPort') return { videoProviderRegistry: { resolve: () => f.adapter } };
    return require(id);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox, { filename: file });
  return new module.exports.DramaVideoPromptService();
}
function matches(row, where) {
  return Object.entries(where ?? {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'OR') return value.some(part => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('not' in value) return row[key] !== value.not;
      if ('in' in value) return value.in.includes(row[key]);
      return false;
    }
    return row[key] instanceof Date ? Number(row[key]) === Number(value) : row[key] === value;
  });
}
function fixture() {
  const row = { id: 'vp', projectId: 'p', episodeId: 'e', shotId: 's', provider: 'paid', prompt: '镜头画面', negativePrompt: null, aspectRatio: '9:16', durationSec: 5, status: 'prompted', version: 1, supersededById: null, providerTaskId: null, resultUrl: null, failureReason: null, providerResult: null, updatedAt: new Date(0), createdAt: new Date(0) };
  const f = { rows: [row], calls: 0, promptCalls: 0, shot: { id: 's', storyboardId: 'storyboard', order: 1, action: '主角打开门', dialogue: null, visualPrompt: '开门', characterRefs: null, keyframeData: null, durationSec: 5, updatedAt: new Date(0), storyboard: { id: 'storyboard', projectId: 'p', episodeId: 'e', episode: { id: 'e', projectId: 'p', order: 1 } } } };
  f.adapter = { supportsRefImages: false, createTask: async () => { f.calls++; return { providerTaskId: `task-${f.calls}`, status: 'queued' }; }, getTask: async id => ({ providerTaskId: id, status: 'queued' }) };
  f.prompt = async () => { f.promptCalls++; return { output: { prompt: '新镜头画面', aspectRatio: '9:16', durationSec: 5 } }; };
  f.db = {
    dramaVideoPrompt: {
      findUnique: async ({ where }) => structuredClone(f.rows.find(row => matches(row, where)) ?? null),
      findFirst: async ({ where }) => structuredClone(f.rows.filter(row => matches(row, where)).sort((a, b) => b.version - a.version)[0] ?? null),
      updateMany: async ({ where, data }) => { const rows = f.rows.filter(row => matches(row, where)); for (const row of rows) Object.assign(row, data, { updatedAt: data.updatedAt ?? new Date(row.updatedAt.getTime() + 1) }); return { count: rows.length }; },
      update: async ({ where, data }) => { const row = f.rows.find(row => matches(row, where)); assert.ok(row); Object.assign(row, data); return structuredClone(row); },
      create: async ({ data }) => { const row = { ...data, id: `vp-${f.rows.length + 1}`, updatedAt: new Date(), createdAt: new Date() }; f.rows.push(row); return structuredClone(row); },
    },
    dramaShot: { findUnique: async () => structuredClone(f.shot), updateMany: async ({ where }) => ({ count: matches(f.shot, where) ? 1 : 0 }) },
    dramaCharacter: { findMany: async () => [] },
  };
  f.db.$transaction = async work => work(f.db);
  f.service = loadService(f);
  return f;
}

async function sqliteFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-video-lifecycle-'));
  const filename = path.join(root, 'fixture.sqlite');
  const sqlite = new Database(filename);
  try {
    sqlite.pragma('journal_mode = WAL');
    for (const migration of ['20260609120000_drama_forge_pipeline', '20260609170000_drama_video_task_projection',
      '20260610090000_drama_shot_keyframes', '20260610130000_drama_dialogue_audio', '20260610143000_drama_generation_versions']) {
      sqlite.exec(fs.readFileSync(path.resolve(__dirname, '../src/prisma/migrations.sqlite', migration, 'migration.sql'), 'utf8'));
    }
  } finally { sqlite.close(); }
  const connect = () => {
    const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:' + filename }) });
    t.after(() => db.$disconnect());
    return db;
  };
  const f = fixture(); f.db = connect();
  await f.db.dramaProject.create({ data: { id: 'p', title: '测试短剧' } });
  await f.db.dramaEpisode.create({ data: { id: 'e', projectId: 'p', order: 1, title: '第一集' } });
  await f.db.dramaStoryboard.create({ data: { id: 'storyboard', projectId: 'p', episodeId: 'e' } });
  await f.db.dramaShot.create({ data: { id: 's', storyboardId: 'storyboard', order: 1, action: '开门', durationSec: 5 } });
  await f.db.dramaVideoPrompt.create({ data: f.rows[0] });
  f.service = loadService(f);
  return f;
}

test('duplicate create calls claim once and reuse queued or completed provider tasks', async () => {
  const f = fixture(); let finish; let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.adapter.createTask = async () => { f.calls++; entered(); return f.calls === 1 ? new Promise(resolve => { finish = resolve; }) : { providerTaskId: 'duplicate-task', status: 'queued' }; };
  const first = f.service.createProviderTask('vp', 'paid'); await ready;
  await assert.rejects(f.service.createProviderTask('vp', 'paid'), error => error.statusCode === 409);
  assert.equal(f.calls, 1);
  finish({ providerTaskId: 'task-1', status: 'queued' }); await first;
  assert.equal((await f.service.createProviderTask('vp', 'another-provider')).providerTaskId, 'task-1');
  Object.assign(f.rows[0], { status: 'succeeded', resultUrl: 'https://video.test/saved.mp4' });
  assert.equal((await f.service.createProviderTask('vp')).resultUrl, 'https://video.test/saved.mp4'); assert.equal(f.calls, 1);
});

test('uncertain submission cannot create another paid task without explicit confirmation', async () => {
  const f = fixture(); f.adapter.createTask = async () => { f.calls++; throw new Error('network response lost'); };
  await assert.rejects(f.service.createProviderTask('vp', 'paid'));
  assert.equal(f.rows[0].status, 'submission_unknown');
  await assert.rejects(f.service.createProviderTask('vp', 'paid'), error => error.statusCode === 409); assert.equal(f.calls, 1);
  f.adapter.createTask = async () => { f.calls++; return { providerTaskId: 'confirmed-second-task', status: 'queued' }; };
  await f.service.createProviderTask('vp', 'paid', { confirmResubmit: true }); assert.equal(f.calls, 2);
});

test('refresh never revives superseded prompts or erases a successful result', async () => {
  const f = fixture(); Object.assign(f.rows[0], { status: 'superseded', supersededById: 'new-prompt', providerTaskId: 'old-task', resultUrl: 'https://video.test/saved.mp4' });
  await f.service.refreshProviderTask('vp');
  assert.equal(f.rows[0].status, 'superseded'); assert.equal(f.rows[0].supersededById, 'new-prompt'); assert.equal(f.rows[0].resultUrl, 'https://video.test/saved.mp4');
  Object.assign(f.rows[0], { status: 'succeeded', supersededById: null });
  await f.service.refreshProviderTask('vp'); assert.equal(f.rows[0].status, 'succeeded'); assert.equal(f.rows[0].resultUrl, 'https://video.test/saved.mp4');
});

test('late refresh of an older task cannot overwrite a newly submitted task', async () => {
  const f = fixture(); Object.assign(f.rows[0], { status: 'queued', providerTaskId: 'old-task' });
  f.adapter.getTask = async () => { Object.assign(f.rows[0], { status: 'queued', providerTaskId: 'new-task', updatedAt: new Date(99) }); return { providerTaskId: 'old-task', status: 'failed', failureReason: 'stale' }; };
  await f.service.refreshProviderTask('vp'); assert.equal(f.rows[0].providerTaskId, 'new-task'); assert.equal(f.rows[0].status, 'queued');
});

test('cross-project shots fail before prompt generation or provider calls', async () => {
  const f = fixture(); f.shot.storyboard.projectId = 'other'; f.shot.storyboard.episode.projectId = 'other';
  await assert.rejects(f.service.generateVideoPromptForShot('p', 's'), error => error.statusCode === 404 || error.statusCode === 409);
  await assert.rejects(f.service.createProviderTask('vp', 'paid'), error => error.statusCode === 404 || error.statusCode === 409);
  assert.equal(f.promptCalls, 0); assert.equal(f.calls, 0);
});

test('video prompt generation cannot supersede a task submitted during its AI call', async () => {
  const f = fixture(); f.prompt = async () => { Object.assign(f.rows[0], { status: 'running', providerTaskId: 'paid-task', updatedAt: new Date(33) }); return { output: { prompt: '过时的新提示词', aspectRatio: '9:16' } }; };
  await assert.rejects(f.service.generateVideoPromptForShot('p', 's'), error => error.statusCode === 409);
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].status, 'running');
});

test('startup recovery makes abandoned submissions visible without resubmitting them', async () => {
  const f = fixture(); Object.assign(f.rows[0], { status: 'submitting', providerResult: '{"submissionId":"lost-response"}' });
  await f.service.recoverInterruptedSubmissions();
  assert.equal(f.rows[0].status, 'submission_unknown'); assert.equal(f.calls, 0);
});

test('production requests never silently select mock and reject explicitly selected mock', async () => {
  const f = fixture(); f.nodeEnv = 'production'; f.service = loadService(f); f.rows[0].provider = 'mock';
  await assert.rejects(f.service.createProviderTask('vp'), error => error.statusCode === 400);
  await assert.rejects(f.service.createProviderTask('vp', 'mock'), error => error.statusCode === 400); assert.equal(f.calls, 0);
});

test('unknown retry never mistakes a previous failed task id for the new submission', async () => {
  const f = fixture(); Object.assign(f.rows[0], { status: 'failed', providerTaskId: 'failed-old-task', providerResult: '{"providerTaskId":"failed-old-task","status":"failed"}' });
  f.adapter.createTask = async () => { f.calls++; throw new Error('lost response for retry'); };
  await assert.rejects(f.service.createProviderTask('vp', 'paid'));
  assert.equal(f.rows[0].providerTaskId, null);
  await assert.rejects(f.service.createProviderTask('vp', 'paid'), error => error.statusCode === 409);
  assert.equal(f.calls, 1);
  assert.equal(JSON.parse(f.rows[0].providerResult).previousAttempt.providerTaskId, 'failed-old-task');
});

test('a refresh preserves the original published URL even if an old prompt reports a different URL', async () => {
  const f = fixture(); Object.assign(f.rows[0], { status: 'superseded', supersededById: 'newer', providerTaskId: 'old-task', resultUrl: 'https://video.test/original.mp4' });
  f.adapter.getTask = async () => ({ providerTaskId: 'old-task', status: 'succeeded', resultUrl: 'https://video.test/replacement.mp4' });
  await f.service.refreshProviderTask('vp'); assert.equal(f.rows[0].resultUrl, 'https://video.test/original.mp4');
});

test('refresh cannot clear uncertain or in-flight submissions using an old task id', async () => {
  for (const status of ['submitting', 'submission_unknown']) {
    const f = fixture(); Object.assign(f.rows[0], { status, providerTaskId: 'previous-task', providerResult: '{"submissionId":"new-attempt"}' });
    const before = structuredClone(f.rows[0]); let queries = 0;
    f.adapter.getTask = async () => { queries++; return { providerTaskId: 'previous-task', status: 'failed' }; };
    await assert.rejects(f.service.refreshProviderTask('vp'), error => error.statusCode === 409);
    assert.equal(queries, 0); assert.deepEqual(f.rows[0], before);
  }
});

test('a legacy unknown submission with an old task id still requires confirmation', async () => {
  const f = fixture(); Object.assign(f.rows[0], { status: 'submission_unknown', providerTaskId: 'previous-task', providerResult: '{"submissionId":"unknown-attempt"}' });
  await assert.rejects(f.service.createProviderTask('vp', 'paid'), error => error.statusCode === 409);
  assert.equal(f.calls, 0); assert.equal(f.rows[0].status, 'submission_unknown');
  f.adapter.createTask = async () => {
    f.calls++;
    assert.equal(f.rows[0].providerTaskId, null);
    assert.equal(JSON.parse(f.rows[0].providerResult).previousAttempt.providerTaskId, 'previous-task');
    return { providerTaskId: 'confirmed-task', status: 'queued' };
  };
  await f.service.createProviderTask('vp', 'paid', { confirmResubmit: true });
  assert.equal(f.calls, 1); assert.equal(f.rows[0].providerTaskId, 'confirmed-task');
});

test('SQLite CAS prevents duplicate paid requests across service instances sharing a stale snapshot', async t => {
  const f = await sqliteFixture(t);
  let readers = 0; let release;
  const captured = new Promise(resolve => { release = resolve; });
  const gated = db => ({
    dramaShot: db.dramaShot,
    dramaCharacter: db.dramaCharacter,
    dramaVideoPrompt: new Proxy(db.dramaVideoPrompt, { get(target, key) {
      if (key !== 'findUnique') return target[key];
      return async args => {
        const row = await target.findUnique(args);
        if (readers < 2) { readers++; if (readers === 2) release(); await captured; }
        return row;
      };
    } }),
  });
  const first = loadService({ ...f, db: gated(f.db) }); const second = loadService({ ...f, db: gated(f.db) });
  const results = await Promise.allSettled([first.createProviderTask('vp', 'paid'), second.createProviderTask('vp', 'paid')]);
  assert.equal(f.calls, 1); assert.ok(results.some(result => result.status === 'fulfilled'));
  for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.statusCode, 409, String(result.reason));
  const row = await f.db.dramaVideoPrompt.findUnique({ where: { id: 'vp' } });
  assert.equal(row.status, 'queued'); assert.equal(row.providerTaskId, 'task-1');
});

test('SQLite prompt version transaction retains a completed asset and guards a concurrent submission', async t => {
  const f = await sqliteFixture(t);
  await f.db.dramaVideoPrompt.update({ where: { id: 'vp' }, data: { status: 'succeeded', providerTaskId: 'saved-task', resultUrl: 'https://video.test/saved.mp4' } });
  const generated = await f.service.generateVideoPromptForShot('p', 's');
  assert.equal(generated.version, 2); assert.equal(generated.provider, '');
  const old = await f.db.dramaVideoPrompt.findUnique({ where: { id: 'vp' } });
  assert.equal(old.status, 'superseded'); assert.equal(old.supersededById, generated.id); assert.equal(old.resultUrl, 'https://video.test/saved.mp4');
  f.prompt = async () => {
    await f.service.createProviderTask(generated.id, 'paid');
    return { output: { prompt: '过时提示词', aspectRatio: '9:16' } };
  };
  await assert.rejects(f.service.generateVideoPromptForShot('p', 's'), error => error.statusCode === 409);
  assert.equal(await f.db.dramaVideoPrompt.count(), 2);
  assert.equal((await f.db.dramaVideoPrompt.findUnique({ where: { id: generated.id } })).status, 'queued');
});
