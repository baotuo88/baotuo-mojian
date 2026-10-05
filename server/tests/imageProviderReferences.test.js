const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const database = require('../dist/db/prisma');
const { generateImagesByProvider } = require('../dist/services/image/provider');
const { runWithExecutionScope } = require('../dist/platform/execution');

const input = { provider: 'openai', model: 'test-image', sceneType: 'character', prompt: 'test', size: '1024x1024', count: 1 };
const result = () => new Response(JSON.stringify({ data: [{ b64_json: 'AQ==' }] }), { headers: { 'content-type': 'application/json' } });
function secret(t) {
  const original = database.prisma;
  database.prisma = { aPIKey: { findUnique: async () => ({ isActive: true, key: 'test-only', baseURL: 'https://images.test/v1' }) } };
  t.after(() => { database.prisma = original; });
}

test('provider uploads every local and URL reference with generation settings intact', async t => {
  secret(t);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'image-provider-'));
  const refs = [];
  for (const color of ['red', 'blue']) {
    const file = path.join(root, `${color}.png`);
    await sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).png().toFile(file);
    refs.push(file);
  }
  const remote = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'green' } }).webp().toBuffer();
  let request;
  t.mock.method(global, 'fetch', async (url, init) => { request = { url, ...init }; return result(); });
  const generated = await generateImagesByProvider({ ...input, refImagePaths: refs, refImages: [`data:image/webp;base64,${remote.toString('base64')}`], quality: 'high', outputFormat: 'webp' });
  assert.ok(generated.images[0].url.startsWith('data:image/webp;base64,'));
  assert.equal(generated.images[0].mimeType, 'image/webp');
  assert.equal(request.url, 'https://images.test/v1/images/edits');
  const images = request.body.getAll('image[]');
  assert.equal(images.length, 3);
  for (let i = 0; i < refs.length; i++) assert.deepEqual(Buffer.from(await images[i].arrayBuffer()), await fs.readFile(refs[i]));
  assert.deepEqual(Buffer.from(await images[2].arrayBuffer()), remote);
  assert.equal(images[2].type, 'image/webp');
  assert.equal(request.body.get('quality'), 'high');
  assert.equal(request.body.get('output_format'), 'webp');
  await generateImagesByProvider({ ...input, refImagePaths: [refs[0]] });
  assert.equal(request.body.getAll('image').length, 1);
});

test('unsupported reference channels and excessive reference counts fail before network calls', async t => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => { requests++; return result(); });
  await assert.rejects(generateImagesByProvider({ ...input, provider: 'grok', refImagePaths: ['unused'] }), /参考图/);
  await assert.rejects(generateImagesByProvider({ ...input, refImagePaths: Array(17).fill('unused') }), /16/);
  assert.equal(requests, 0);
});

test('execution cancellation aborts an in-flight provider request', async t => {
  secret(t);
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  t.mock.method(global, 'fetch', async (_url, init) => {
    entered();
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  });
  const controller = new AbortController();
  const pending = runWithExecutionScope({ signal: controller.signal }, () => generateImagesByProvider(input));
  await ready;
  controller.abort(new Error('stopped by user'));
  await assert.rejects(pending, /stopped by user/);
});

test('reference download budgets account for local files before downloading and stop at 64 MiB', async t => {
  secret(t);
  const transfer = require('../dist/services/image/infrastructure/GeneratedImageDownload');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'image-reference-budget-'));
  const local = path.join(root, 'local.png');
  await fs.writeFile(local, ''); await fs.truncate(local, 20 * 1024 * 1024);
  const budgets = [];
  t.mock.method(transfer, 'saveImageToDisk', async (_url, filename, options) => {
    budgets.push(options.maxBytes);
    if (options.maxBytes < 20 * 1024 * 1024) throw new Error('remaining reference budget exceeded');
    await fs.writeFile(filename, ''); await fs.truncate(filename, 20 * 1024 * 1024);
  });
  t.mock.method(global, 'fetch', async () => { throw new Error('model must not be called'); });
  await assert.rejects(generateImagesByProvider({ ...input, refImagePaths: [local], refImages: Array(8).fill('https://images.test/ref') }), /remaining reference budget/);
  assert.deepEqual(budgets, [20, 20, 4].map(n => n * 1024 * 1024));
  budgets.length = 0;
  await assert.rejects(generateImagesByProvider({ ...input, refImagePaths: Array(4).fill(local), refImages: ['https://images.test/ref'] }), /64 MB/);
  assert.equal(budgets.length, 0);
});
