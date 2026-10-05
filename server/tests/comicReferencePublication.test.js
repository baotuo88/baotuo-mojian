const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const { sourceLoader } = require('./helpers/comicAssetFixture.cjs');

async function image(color = 'red', encoding = 'png') {
  return sharp({ create: { width: 120, height: 60, channels: 3, background: color } })[encoding]().toBuffer();
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-reference-publication-'));
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:' + path.join(root, 'fixture.sqlite') }) });
  t.after(() => db.$disconnect());
  await db.$executeRawUnsafe('CREATE TABLE ComicProject (id TEXT PRIMARY KEY, stylePreset TEXT)');
  await db.$executeRawUnsafe('CREATE TABLE ComicCharacter (id TEXT PRIMARY KEY, projectId TEXT, name TEXT, gender TEXT, persona TEXT, visualAnchor TEXT, sheetData TEXT, sourceCharacterRef TEXT, createdAt DATETIME, updatedAt DATETIME)');
  await db.$executeRawUnsafe('CREATE TABLE ComicCharacterAsset (id TEXT PRIMARY KEY, projectId TEXT, characterId TEXT, name TEXT, assetType TEXT, description TEXT, imageData TEXT, sortOrder INTEGER, createdAt DATETIME, updatedAt DATETIME)');
  await db.$executeRawUnsafe('CREATE TABLE ComicScene (id TEXT PRIMARY KEY, projectId TEXT, name TEXT, sceneType TEXT, bible TEXT, sheetData TEXT, sortOrder INTEGER, createdAt DATETIME, updatedAt DATETIME)');
  await db.$executeRawUnsafe("INSERT INTO ComicProject VALUES ('project', '{}')");
  await db.$executeRawUnsafe("INSERT INTO ComicCharacter (id, projectId, name, gender, createdAt, updatedAt) VALUES ('char', 'project', '角色', 'unknown', 0, 0)");
  await db.$executeRawUnsafe("INSERT INTO ComicCharacterAsset (id, projectId, characterId, name, assetType, sortOrder, createdAt, updatedAt) VALUES ('asset', 'project', 'char', '服装', 'costume', 0, 0, 0)");
  await db.$executeRawUnsafe("INSERT INTO ComicScene (id, projectId, name, sceneType, sortOrder, createdAt, updatedAt) VALUES ('scene', 'project', '大厅', 'interior', 0, 0, 0)");
  let provider = async () => ({ images: [{ url: 'data:image/png;base64,' + (await image()).toString('base64') }] });
  const load = sourceLoader({ '/db/prisma': { prisma: db },
    '/runtime/appPaths': { resolveGeneratedImagesRoot: () => root },
    '/middleware/errorHandler': { AppError: class extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } } },
    '/platform/execution': { throwIfExecutionAborted() {}, getExecutionAbortSignal() {} },
    '/image/provider': { isImageProviderSupported: () => true, resolveImageModel: async () => 'fake', generateImagesByProvider: (input) => provider(input) },
  });
  return { root, db, load, setProvider(fn) { provider = fn; },
    characters: load(path.join(__dirname, '../src/services/comic/ComicCharacterImageService.ts')).comicCharacterImageService,
    assets: load(path.join(__dirname, '../src/services/comic/ComicCharacterAssetService.ts')).comicCharacterAssetService,
    scenes: load(path.join(__dirname, '../src/services/comic/ComicSceneService.ts')).comicSceneService,
  };
}

test('asset uploads publish the selected encoding and preserve the earlier immutable image', async t => {
  const f = await fixture(t);
  await f.assets.uploadAssetImage('asset', await image('red'), 'image/png');
  const old = await f.assets.serveAssetImage('asset');
  await f.assets.uploadAssetImage('asset', await image('blue', 'jpeg'), 'image/jpeg');
  const latest = await f.assets.serveAssetImage('asset');
  assert.equal(latest.mimeType, 'image/jpeg'); assert.notEqual(latest.filePath, old.filePath);
  assert.ok(await fs.stat(old.filePath));
  const firstRevision = path.basename(path.dirname(old.filePath));
  assert.equal((await f.assets.serveAssetImage('asset', firstRevision)).filePath, old.filePath);
  await assert.rejects(f.assets.serveAssetImage('asset', 'unpublished-revision'), e => e.statusCode === 404);
  const pixels = await sharp(latest.filePath).raw().toBuffer(); assert.ok(pixels[2] > 240);
  await assert.rejects(f.assets.uploadAssetImage('asset', Buffer.from('bad'), 'image/png'), e => e.statusCode === 400);
  assert.equal((await f.assets.serveAssetImage('asset')).filePath, latest.filePath);
});

test('late asset generation cannot overwrite a newer upload or publish an edited design', async t => {
  const f = await fixture(t);
  let started, finish;
  const began = new Promise(resolve => { started = resolve; });
  const release = new Promise(resolve => { finish = resolve; });
  f.setProvider(async () => { started(); await release; return { images: [{ url: 'data:image/png;base64,' + (await image('red')).toString('base64') }] }; });
  const old = f.assets.generateAssetImage('asset'); const rejected = assert.rejects(old, e => e.statusCode === 409);
  await began; await f.assets.uploadAssetImage('asset', await image('blue'), 'image/png');
  const winner = (await f.assets.getAsset('asset')).imageData;
  finish(); await rejected; assert.equal((await f.assets.getAsset('asset')).imageData, winner);
  f.setProvider(async () => { await f.assets.updateAsset('asset', { description: 'new design' });
    return { images: [{ url: 'data:image/png;base64,' + (await image()).toString('base64') }] }; });
  await assert.rejects(f.assets.generateAssetImage('asset'), e => e.statusCode === 409);
  await assert.rejects(f.assets.serveAssetImage('asset'), e => e.statusCode === 404);
});

test('failed scene replacement preserves the previous confirmed image', async t => {
  const f = await fixture(t); await f.scenes.uploadSceneImage('scene', await image(), 'image/png');
  const before = await f.scenes.serveSceneImage('scene');
  f.setProvider(async () => ({ images: [{ url: 'data:image/png;base64,' + Buffer.from('corrupt').toString('base64') }] }));
  await assert.rejects(f.scenes.generateSceneSheet('scene'));
  assert.equal((await f.scenes.serveSceneImage('scene')).filePath, before.filePath);
});

test('a sheet retry retains immutable history and refreshes derived face references', async t => {
  const f = await fixture(t); await f.characters.generateCharacterSheet('char');
  const first = await f.characters.resolveSheetFile('char'); const face = await f.characters.resolveFaceRegionFile('char');
  f.setProvider(async () => ({ images: [{ url: 'data:image/png;base64,' + (await image('blue')).toString('base64') }] }));
  await f.characters.generateCharacterSheet('char');
  assert.equal((await f.characters.resolveArchivedSheetFile('char', 1)).filePath, first.filePath);
  const nextFace = await f.characters.resolveFaceRegionFile('char');
  assert.notEqual(nextFace.filePath, face.filePath);
  const pixels = await sharp(nextFace.filePath).raw().toBuffer(); assert.equal(pixels[2], 255);
  f.setProvider(async () => { throw new Error('provider failure'); });
  await assert.rejects(f.characters.generateCharacterSheet('char'));
  assert.ok(await f.characters.resolveSheetFile('char'));
  assert.equal((await f.characters.resolveArchivedSheetFile('char', 1)).filePath, first.filePath);
});

test('expression publication never merges stale data over a replacement sheet', async t => {
  const f = await fixture(t); await f.characters.generateCharacterSheet('char');
  let started, finish;
  const began = new Promise(resolve => { started = resolve; }); const release = new Promise(resolve => { finish = resolve; });
  let count = 0;
  f.setProvider(async () => { if (++count === 1) { started(); await release; }
    return { images: [{ url: 'data:image/png;base64,' + (await image('blue')).toString('base64') }] }; });
  const expression = f.characters.generateExpressionSheet('char'); const rejected = assert.rejects(expression, e => e.statusCode === 409);
  await began; await f.characters.generateCharacterSheet('char');
  const winner = (await f.db.comicCharacter.findUnique({ where: { id: 'char' } })).sheetData;
  finish(); await rejected;
  assert.equal((await f.db.comicCharacter.findUnique({ where: { id: 'char' } })).sheetData, winner);
  assert.equal(await f.characters.resolveExpressionFile('char'), null);
});

test('reference resolution does not expose stray files without confirmed metadata', async t => {
  const f = await fixture(t);
  const dir = path.join(f.root, 'comic-scenes', 'scene'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'scene-sheet.png'), await image());
  await assert.rejects(f.scenes.serveSceneImage('scene'), e => e.statusCode === 404);
});

test('confirmed legacy sheets survive retries and remain available through registered history', async t => {
  const f = await fixture(t);
  const dir = path.join(f.root, 'comic-characters', 'char'); await fs.mkdir(dir, { recursive: true });
  const original = path.join(dir, 'character-sheet.png'); await fs.writeFile(original, await image());
  await f.db.comicCharacter.update({ where: { id: 'char' }, data: { sheetData: '{"status":"done","version":1}' } });
  await f.characters.generateCharacterSheet('char');
  const archived = await f.characters.resolveArchivedSheetFile('char', 1);
  assert.equal(archived.filePath, original);
  assert.equal(await f.characters.resolveArchivedSheetFile('char', 999), null);
});

test('a missing old archive never falls back to the different legacy current image', async t => {
  const f = await fixture(t);
  const dir = path.join(f.root, 'comic-characters', 'char'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'character-sheet.png'), await image());
  await f.db.comicCharacter.update({ where: { id: 'char' }, data: { sheetData: JSON.stringify({
    status: 'done', version: 2, history: [{ version: 1, url: '/api/comic/character-images/char/sheet/v1' }],
  }) } });
  assert.equal(await f.characters.resolveArchivedSheetFile('char', 1), null);
});

test('reference previews name the actual sheet revision and sheet replacement clears obsolete expressions', async t => {
  const f = await fixture(t); await f.characters.generateCharacterSheet('char');
  const sheet = await f.characters.resolveSheetFile('char');
  const preview = await f.assets.prepareAssetImage('asset');
  assert.ok(preview.referenceImages[0].url.endsWith('?revision=' + sheet.revision));
  const expression = await f.characters.generateExpressionSheet('char');
  assert.ok(expression.url.includes('/expressions?revision='));
  assert.ok(await f.characters.resolveExpressionFile('char'));
  await f.characters.generateCharacterSheet('char');
  assert.equal(await f.characters.resolveExpressionFile('char'), null);
});
