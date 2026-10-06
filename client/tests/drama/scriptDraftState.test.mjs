import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeDraftSave, createDraftState, draftAsText, isDraftDirty, parseStoredDrafts, reconcileDraft } from "../../src/pages/drama/script/draftState.ts";

const episode = (overrides = {}) => ({ id: "e1", revision: 2, title: "初稿", content: "原台本", ...overrides });
const edited = () => {
  const state = createDraftState(episode());
  return { ...state, draft: { ...state.draft, content: "我的修改" } };
};

test("background polling cannot discard unsaved content after another author saves", () => {
  const local = edited();
  const next = reconcileDraft(local, episode({ revision: 3, title: "另一作者", content: "远程修改" }));
  assert.equal(next.draft.content, "我的修改");
  assert.equal(next.baseRevision, 2);
  assert.equal(next.conflict, true);
  assert.equal(isDraftDirty(next), true);
});

test("clean editors follow generated scripts, while stale refetches cannot regress save revisions", () => {
  const clean = createDraftState(episode());
  const next = reconcileDraft(clean, episode({ revision: 3, content: "AI 修复稿" }));
  assert.equal(next.draft.content, "AI 修复稿");
  assert.equal(next.conflict, false);
  assert.equal(next.baseRevision, 3);
  assert.equal(reconcileDraft(next, episode()), next);
});

test("save responses preserve text typed while saving and advance only the submitted base", () => {
  const local = edited();
  const duringRequest = { ...local, draft: { ...local.draft, content: "保存期间继续写的内容" } };
  const next = acknowledgeDraftSave(duringRequest, local.draft, episode({ revision: 3, content: local.draft.content }));
  assert.equal(next.baseRevision, 3);
  assert.equal(next.base.content, "我的修改");
  assert.equal(next.draft.content, "保存期间继续写的内容");
  assert.equal(isDraftDirty(next), true);
});

test("acknowledged saves normalize server fields without creating false dirty state", () => {
  const local = edited();
  const next = acknowledgeDraftSave(local, local.draft, episode({ revision: 3, content: "我的修改" }));
  assert.equal(next.baseRevision, 3);
  assert.equal(next.conflict, false);
  assert.equal(isDraftDirty(next), false);
});

test("conflict drafts survive session serialization and retain their original expected revision", () => {
  const conflict = reconcileDraft(edited(), episode({ revision: 3 }));
  const restored = parseStoredDrafts(JSON.stringify({ e1: conflict }));
  assert.deepEqual(restored.e1, conflict);
  assert.equal(reconcileDraft(restored.e1, episode({ revision: 4 })).baseRevision, 2);
});

test("corrupt session draft data cannot replace editor fields", () => {
  assert.deepEqual(parseStoredDrafts("{bad"), {});
  assert.deepEqual(parseStoredDrafts(JSON.stringify({ e1: { baseRevision: 3, base: {}, draft: null, conflict: false } })), {});
  assert.deepEqual(parseStoredDrafts("null"), {});
});

test("downloadable local drafts include every editable field", () => {
  const draft = { title: "本地标题", content: "本地正文", hookOpening: "本地开场", cliffhanger: "本地结尾", durationSec: "90" };
  for (const value of Object.values(draft)) assert.ok(draftAsText(draft).includes(value));
});
