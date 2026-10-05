const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { saveImageToDisk } = require('../dist/services/image/runtime');
const { runWithExecutionScope } = require('../dist/platform/execution');

async function fixture(t, fetcher) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'image-download-'));
  const savedFetch = global.fetch;
  global.fetch = fetcher; t.after(() => { global.fetch = savedFetch; });
  return path.join(root, 'image.png');
}

test('execution cancellation stops a pending generated image download', async t => {
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const dest = await fixture(t, async (_url, init) => {
    entered();
    return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  });
  const controller = new AbortController();
  const result = runWithExecutionScope({ signal: controller.signal }, () => saveImageToDisk('https://image.test/x', dest));
  await ready; controller.abort(new Error('cancelled download'));
  const verdict = await Promise.race([result.then(() => 'saved', e => e.message), new Promise(resolve => setTimeout(() => resolve('still pending'), 60))]);
  assert.equal(verdict, 'cancelled download');
  await assert.rejects(fs.access(dest));
});

test('download rejects oversized responses with or without Content-Length before saving a file', async t => {
  for (const withHeader of [true, false]) {
    await t.test(String(withHeader), async subtest => {
    const dest = await fixture(subtest, async () => new Response(new Uint8Array(64), {
      headers: withHeader ? { 'Content-Length': '64' } : {},
    }));
    await assert.rejects(saveImageToDisk('https://image.test/x', dest, { maxBytes: 32 }), /过大|exceed/i);
    await assert.rejects(fs.access(dest));
    });
  }
});

test('data images obey the same size bound and a cancelled scope never writes them', async t => {
  const dest = await fixture(t, async () => { throw new Error('should not fetch'); });
  await assert.rejects(saveImageToDisk('data:image/png;base64,' + Buffer.alloc(64).toString('base64'), dest, { maxBytes: 32 }), /过大|exceed/i);
  const controller = new AbortController(); controller.abort(new Error('already cancelled'));
  await assert.rejects(runWithExecutionScope({ signal: controller.signal }, () => saveImageToDisk('data:image/png;base64,AQ==', dest)), /cancelled/);
  await assert.rejects(fs.access(dest));
});

test('bounded downloads preserve bytes and do not leak signed URLs in HTTP errors', async t => {
  const dest = await fixture(t, async () => new Response(Uint8Array.from([1, 2, 3])));
  await saveImageToDisk('https://image.test/x', dest, { maxBytes: 8 });
  assert.deepEqual(await fs.readFile(dest), Buffer.from([1, 2, 3]));
  global.fetch = async () => new Response('', { status: 403 });
  await assert.rejects(saveImageToDisk('https://image.test/x?private-token=hidden', dest), error => !error.message.includes('hidden') && error.message.includes('403'));
});
