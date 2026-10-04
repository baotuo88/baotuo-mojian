import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  const cells = [], errors = [], cleanup = [];
  let position = 0;
  const sandbox = { exports: {}, require: name => {
    if (name === 'react') return {
      useRef(value) { const index = position++; return cells[index] ??= { current: value }; },
      useState(value) { const index = position++; if (!(index in cells)) cells[index] = value;
        return [cells[index], next => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; },
      useEffect(fn) { const index = position++; if (!(index in cells)) { cells[index] = true; cleanup.push(fn()); } },
    };
    if (name === '@/components/ui/toast') return { toast: { error: value => errors.push(value) } };
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('./useImageGenerationFlow.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, sandbox);
  return { errors, render() { position = 0; return sandbox.exports.useImageGenerationFlow(); },
    unmount() { cleanup.forEach(fn => fn?.()); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('late preparation cannot replace another image preview or submit its generation callback', async () => {
  const f = fixture(); const first = deferred(); const generated = [];
  const a = f.render().start({ prepare: () => first.promise, generate: async () => generated.push('A') });
  await f.render().start({ prepare: async () => ({ prompt: 'B' }), generate: async () => generated.push('B') });
  first.resolve({ prompt: 'A' }); await a;
  const flow = f.render(); assert.equal(flow.dialogProps.preview.prompt, 'B');
  flow.dialogProps.onConfirm({}); flow.dialogProps.onConfirm({}); await tick();
  assert.deepEqual(generated, ['B']);
  flow.dialogProps.onConfirm({}); await tick(); assert.deepEqual(generated, ['B']);
});

test('cancel and unmount invalidate pending previews without triggering a paid request', async () => {
  for (const unmount of [false, true]) {
    const f = fixture(); const pending = deferred(); let generated = 0;
    const work = f.render().start({ prepare: () => pending.promise, generate: async () => generated++ });
    if (unmount) f.unmount(); else f.render().dialogProps.onCancel();
    pending.resolve({ prompt: 'late' }); await work;
    const flow = f.render(); flow.dialogProps.onConfirm({});
    assert.equal(flow.dialogProps.preview, null); assert.equal(generated, 0);
  }
});

test('a failed old preparation cannot close or report an error in the active preview', async () => {
  const f = fixture(); const old = deferred();
  const work = f.render().start({ prepare: () => old.promise, generate: async () => {} });
  await f.render().start({ prepare: async () => ({ prompt: 'current' }), generate: async () => {} });
  old.reject(new Error('old failure')); await work;
  assert.equal(f.render().dialogProps.open, true); assert.deepEqual(f.errors, []);
});

test('submission is locked synchronously, preserves its target, and allows an explicit retry on failure', async () => {
  const f = fixture(); const pending = deferred(); let attempts = 0, otherPrepares = 0;
  await f.render().start({ prepare: async () => ({ prompt: 'A' }), generate: async () => {
    attempts++; if (attempts === 1) await pending.promise;
  } });
  let flow = f.render(); flow.dialogProps.onConfirm({}); flow.dialogProps.onConfirm({});
  flow.dialogProps.onCancel();
  await flow.start({ prepare: async () => { otherPrepares++; return { prompt: 'B' }; }, generate: async () => {} });
  assert.equal(attempts, 1); assert.equal(otherPrepares, 0); assert.equal(f.render().dialogProps.open, true);
  pending.reject(new Error('retryable failure')); await tick();
  flow = f.render(); assert.equal(flow.dialogProps.submitting, false);
  flow.dialogProps.onConfirm({}); await tick(); assert.equal(attempts, 2);
  assert.equal(f.render().dialogProps.open, false);
});

test('a stale confirmation cannot submit a newer image preview', async () => {
  const f = fixture(); const generated = [];
  await f.render().start({ prepare: async () => ({ prompt: 'A' }), generate: async () => generated.push('A') });
  const old = f.render().dialogProps.onConfirm;
  await f.render().start({ prepare: async () => ({ prompt: 'B' }), generate: async () => generated.push('B') });
  old({}); await tick(); assert.deepEqual(generated, []);
  f.render().dialogProps.onConfirm({}); await tick(); assert.deepEqual(generated, ['B']);
});
