import test from "node:test";
import assert from "node:assert/strict";
import { ChapterSaveSession } from "./ChapterSaveSession.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(options = {}) {
  const calls = [];
  let cache = null;
  let persisted = options.content ?? "original";
  const session = new ChapterSaveSession({
    content: persisted, normalize: (value) => value,
    persist: (value) => { cache = value; },
    write: (content, expected) => new Promise((resolve, reject) => calls.push({
      content, expected,
      finish() { assert.equal(persisted, expected); persisted = content; resolve(content); },
      fail: reject,
    })),
    ...options,
  });
  return { session, calls, get cache() { return cache; }, get persisted() { return persisted; } };
}

test("automatic and explicit saves serialize and coalesce waiting drafts", async () => {
  const f = setup();
  f.session.setDraft("A");
  const first = f.session.save();
  f.session.setDraft("B");
  const second = f.session.save();
  f.session.setDraft("C");
  const third = f.session.save();
  assert.equal(f.calls.length, 1);
  f.calls[0].finish();
  await tick();
  assert.deepEqual(f.calls.map(({ content, expected }) => [content, expected]), [["A", "original"], ["C", "A"]]);
  f.calls[1].finish();
  await Promise.all([first, second, third]);
  assert.equal(f.persisted, "C");
  assert.equal(f.session.getSnapshot().draft, "C");
  assert.equal(f.session.getSnapshot().status, "saved");
  assert.equal(f.cache, null);
});

test("typing while a manual save completes retains the newer draft and recovery cache", async () => {
  const f = setup();
  f.session.setDraft("A");
  const saving = f.session.save();
  f.session.setDraft("B");
  f.calls[0].finish();
  await saving;
  f.session.receiveServer("A");
  assert.equal(f.session.getSnapshot().draft, "B");
  assert.equal(f.session.getSnapshot().dirty, true);
  assert.deepEqual(f.cache, { content: "B", baseContent: "A" });
});

test("a conflict preserves local text and stops queued writes until explicitly resolved", async () => {
  const f = setup();
  f.session.setDraft("A");
  const saving = f.session.save();
  f.session.setDraft("B");
  const queued = f.session.save();
  f.session.receiveServer("external draft");
  f.calls[0].fail(new Error("conflict"));
  await assert.rejects(saving, /conflict/);
  await assert.rejects(queued, /conflict/);
  await assert.rejects(f.session.save(), /conflict/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.session.getSnapshot().draft, "B");
  assert.equal(f.cache.content, "B");
});

test("a historical cached draft cannot silently overwrite a different server version", async () => {
  const f = setup({ content: "remote", cachedDraft: { content: "local", baseContent: "old" } });
  await assert.rejects(f.session.save());
  assert.equal(f.session.getSnapshot().draft, "local");
  assert.equal(f.session.getSnapshot().remoteContent, "remote");
  assert.equal(f.calls.length, 0);
});

test("conflict resolution cannot accept a newer remote version than the one backed up", async () => {
  const f = setup({ content: "remote", cachedDraft: { content: "local", baseContent: "old" } });
  f.session.receiveServer("newer remote");
  await assert.rejects(f.session.keepLocalVersion("remote"), /备份期间/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.session.getSnapshot().draft, "local");
  assert.equal(f.session.getSnapshot().remoteContent, "newer remote");
});
