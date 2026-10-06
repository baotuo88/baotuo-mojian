const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
const source = path.resolve(__dirname, '../src');
const png = text => ({ images: [{ url: 'data:image/png;base64,' + Buffer.from(text).toString('base64') }] });
function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

// Actual service, revision transactions, image runner and disk adapter. Only
// external paid providers and the per-test filesystem root are injected.
function loadSource(f, relative) {
  const filename = path.resolve(source, relative);
  f.modules ??= new Map();
  if (f.modules.has(filename)) return f.modules.get(filename).exports;
  const module = { exports: {} }; f.modules.set(filename, module);
  const sandbox = { module, exports: module.exports, console, process: { env: { NODE_ENV: f.nodeEnv ?? 'test' } },
    Date, Set, Map, JSON, URL, Buffer, AbortSignal, Error, setTimeout, clearTimeout,
    require(id) {
      if (id.endsWith('/db/prisma')) return { prisma: f.db };
      if (id.endsWith('/middleware/errorHandler')) return { AppError };
      if (id.endsWith('/runtime/appPaths')) return { resolveGeneratedImagesRoot: () => f.root };
      if (id.endsWith('/platform/execution')) return { getExecutionAbortSignal: () => undefined, throwIfExecutionAborted() {} };
      if (id === './TTSProviderPort') return { ttsProviderRegistry: { resolve: () => ({ synthesize: input => f.tts(input) }), listProviders: () => [{ provider: 'paid' }] } };
      if (id === '../provider') return { isImageProviderSupported: () => true, resolveImageModel: async () => 'fixture', generateImagesByProvider: input => f.image(input) };
      if (id.endsWith('/image/runtime')) return { ...loadSource(f, 'services/image/runtime/runner.ts'), filterImageGenerationReferences: input => input };
      if (id === '../infrastructure') return loadSource(f, 'services/image/infrastructure/GeneratedImageDownload.ts');
      if (id.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), id);
        return loadSource(f, path.relative(source, fs.existsSync(target + '.ts') ? target + '.ts' : target + '/index.ts'));
      }
      return require(id);
    },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, sandbox, { filename });
  return module.exports;
}
async function fixture(t, fields = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-media-revision-'));
  const filename = path.join(root, 'fixture.sqlite');
  const sqlite = new Database(filename);
  try {
    sqlite.pragma('journal_mode = WAL');
    for (const name of ['20260609120000_drama_forge_pipeline', '20260609170000_drama_video_task_projection',
      '20260610090000_drama_shot_keyframes', '20260610130000_drama_dialogue_audio',
      '20260610143000_drama_generation_versions', '20261006090000_drama_revision_render']) {
      sqlite.exec(fs.readFileSync(path.join(source, 'prisma/migrations.sqlite', name, 'migration.sql'), 'utf8'));
    }
  } finally { sqlite.close(); }
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:' + filename }) });
  t.after(() => db.$disconnect());
  await db.dramaProject.create({ data: { id: 'p', title: '媒体保护' } });
  await db.dramaEpisode.create({ data: { id: 'e', projectId: 'p', order: 1, title: '首集', content: '原稿' } });
  await db.dramaStoryboard.create({ data: { id: 'b', projectId: 'p', episodeId: 'e' } });
  await db.dramaShot.create({ data: { id: 's', storyboardId: 'b', order: 1, action: '开门', dialogue: '主角：你好', ...fields } });
  const f = { db, root, imageCalls: 0, ttsCalls: 0 };
  f.image = async () => { f.imageCalls++; return png('image-' + f.imageCalls); };
  f.tts = async () => { f.ttsCalls++; return { audioUrl: '/audio-' + f.ttsCalls + '.wav', durationSec: 1 }; };
  f.keyframes = new (loadSource(f, 'services/drama/visual/DramaShotKeyframeService.ts').DramaShotKeyframeService)();
  f.audio = new (loadSource(f, 'services/drama/audio/DramaDialogueAudioService.ts').DramaDialogueAudioService)();
  f.read = () => db.dramaShot.findUnique({ where: { id: 's' } });
  f.edit = () => db.dramaEpisode.update({ where: { id: 'e' }, data: { revision: { increment: 1 }, content: '人工新稿' } });
  return f;
}

test('first-frame generations publish immutable files and retain readable version history', async t => {
  const f = await fixture(t);
  const first = await f.keyframes.generateKeyframe('s');
  const firstPath = (await f.keyframes.resolveArchivedKeyframePath('s', 1)).filePath;
  const second = await f.keyframes.generateKeyframe('s');
  const secondPath = (await f.keyframes.resolveExistingKeyframePath('s')).filePath;
  assert.notEqual(first.fileName, second.fileName);
  assert.notEqual(firstPath, secondPath);
  assert.equal(first.url, '/api/drama/shot-images/s/keyframe/v1');
  assert.equal(second.url, '/api/drama/shot-images/s/keyframe/v2');
  assert.equal(fs.readFileSync(firstPath, 'utf8'), 'image-1');
  assert.equal(fs.readFileSync(secondPath, 'utf8'), 'image-2');
  assert.equal((await f.keyframes.resolveArchivedKeyframePath('s', 1)).filePath, firstPath);
  for (let version = 3; version <= 7; version++) await f.keyframes.generateKeyframe('s');
  assert.equal((await f.keyframes.resolveArchivedKeyframePath('s', 1)).filePath, firstPath);
});

test('duplicate first-frame requests cannot issue another paid request', async t => {
  const f = await fixture(t); const entered = gate(); const release = gate();
  f.image = async () => { f.imageCalls++; entered.resolve(); await release.promise; return png('one'); };
  const pending = f.keyframes.generateKeyframe('s'); await entered.promise;
  await assert.rejects(f.keyframes.generateKeyframe('s'), error => error.statusCode === 409);
  assert.equal(f.imageCalls, 1);
  release.resolve(); await pending;
});

test('late first-frame results cannot overwrite published bytes after a script edit', async t => {
  const f = await fixture(t);
  await f.keyframes.generateKeyframe('s');
  const publishedPath = (await f.keyframes.resolveExistingKeyframePath('s')).filePath;
  f.image = async () => { f.imageCalls++; await f.edit(); return png('stale-result'); };
  await assert.rejects(f.keyframes.generateKeyframe('s'), error => error.statusCode === 409);
  assert.equal(fs.readFileSync(publishedPath, 'utf8'), 'image-1');
  const state = JSON.parse((await f.read()).keyframeData);
  assert.notEqual(state.status, 'done');
  assert.equal((await f.keyframes.resolveArchivedKeyframePath('s', 1)).filePath, publishedPath);
  await assert.rejects(f.keyframes.generateKeyframe('s'), error => error.statusCode === 409);
  assert.equal(f.imageCalls, 2);
});

test('failed and concurrent TTS attempts preserve the successful audio', async t => {
  const f = await fixture(t);
  const first = await f.audio.synthesizeShotDialogue('s');
  const entered = gate(); const release = gate();
  f.tts = async () => { f.ttsCalls++; entered.resolve(); await release.promise; throw new Error('provider failed'); };
  const pending = f.audio.synthesizeShotDialogue('s'); await entered.promise;
  assert.equal(JSON.parse((await f.read()).dialogueAudioData).items[0].audioUrl, first.items[0].audioUrl);
  await assert.rejects(f.audio.synthesizeShotDialogue('s'), error => error.statusCode === 409);
  release.resolve(); await assert.rejects(pending, /provider failed/);
  const saved = JSON.parse((await f.read()).dialogueAudioData);
  assert.equal(saved.status, 'error');
  assert.equal(saved.items[0].audioUrl, first.items[0].audioUrl);
  assert.equal(f.ttsCalls, 2);
});

test('a script edit between TTS lines stops additional paid work and rejects late output', async t => {
  const f = await fixture(t, { dialogue: '主角：第一句\n主角：第二句' });
  f.tts = async () => { f.ttsCalls++; await f.edit(); return { audioUrl: '/stale.wav', durationSec: 1 }; };
  await assert.rejects(f.audio.synthesizeShotDialogue('s'), error => error.statusCode === 409);
  assert.equal(f.ttsCalls, 1);
  assert.notEqual(JSON.parse((await f.read()).dialogueAudioData).status, 'done');
});

test('production TTS never silently uses mock and forbids explicit mock before claiming the shot', async t => {
  const f = await fixture(t); f.nodeEnv = 'production'; f.modules = new Map();
  const audio = new (loadSource(f, 'services/drama/audio/DramaDialogueAudioService.ts').DramaDialogueAudioService)();
  await assert.rejects(audio.synthesizeShotDialogue('s', 'mock'), error => error.statusCode === 400);
  assert.equal((await f.read()).dialogueAudioData, null);
  const result = await audio.synthesizeShotDialogue('s');
  assert.equal(result.provider, 'paid'); assert.equal(f.ttsCalls, 1);
});
