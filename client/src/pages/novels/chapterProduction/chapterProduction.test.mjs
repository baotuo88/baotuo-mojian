import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { rewriteChapterWithBackup } from "./application/rewriteChapter.ts";
import { bindChapterReview, reviewForChapter } from "./domain/chapterReviewIdentity.ts";

test("rewrite awaits a confirmed backup before calling generation", async () => {
  let completeBackup;
  const events = [];
  const work = rewriteChapterWithBackup({
    backup: () => new Promise((resolve) => { completeBackup = () => { events.push("backup"); resolve({ data: { id: "snapshot" } }); }; }),
    generate: async () => { events.push("generate"); throw new Error("provider unavailable"); },
  });
  assert.deepEqual(events, []);
  completeBackup();
  await assert.rejects(work, /provider unavailable/);
  assert.deepEqual(events, ["backup", "generate"]);
});

test("an unconfirmed backup prevents rewriting", async () => {
  let generated = false;
  await assert.rejects(rewriteChapterWithBackup({ backup: async () => ({}), generate: () => { generated = true; } }), /备份/);
  assert.equal(generated, false);
});

test("the real chapter action never clears the original before a failed rewrite", async () => {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const source = fs.readFileSync(new URL("../hooks/useChapterExecutionActions.ts", import.meta.url), "utf8");
  let persisted = "完整原稿";
  let backedUp = null;
  const writes = [];
  const modules = {
    react: { useEffect() {}, useRef: (current) => ({ current }), useState: (value) => [value, () => {}] },
    "@tanstack/react-query": { useMutation: (options) => ({ mutate: options.mutationFn, isPending: false }) },
    "@/api/novel": {
      updateNovelChapter: async (_novel, _chapter, payload) => { writes.push(payload); if (payload.content !== undefined) persisted = payload.content; },
      createNovelSnapshot: async () => { backedUp = persisted; return { data: { id: "snapshot" } }; },
    },
    "../chapterProduction": { rewriteChapterWithBackup },
    "../novelWorkflow.client": { syncNovelWorkflowStageSilently: async () => {} },
  };
  const sandbox = { exports: {}, require: (id) => modules[id] ?? {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  const action = sandbox.exports.useChapterExecutionActions({
    novelId: "novel", selectedChapterId: "A", selectedChapter: { id: "A", content: persisted },
    strategy: {}, reviewIssues: [], onGenerateChapter: () => { throw new Error("provider unavailable"); },
    onReviewChapter() {}, onStartRepair() {}, onMessage() {},
    isGeneratingChapter: false, isRepairingChapter: false, invalidateNovelDetail: async () => {},
  });
  await action.rewriteChapter();
  assert.equal(backedUp, "完整原稿");
  assert.equal(persisted, "完整原稿");
  assert.deepEqual(writes, []);
});

test("review results are usable only for the reviewed book chapter and exact content", () => {
  const source = { novelId: "novel", chapterId: "A", content: "A正文" };
  const result = bindChapterReview({ score: {}, issues: [{ evidence: "A章问题" }] }, source);
  source.chapterId = "B";
  assert.equal(reviewForChapter(result, source), null);
  assert.equal(reviewForChapter(result, { novelId: "other", chapterId: "A", content: "A正文" }), null);
  assert.equal(reviewForChapter(result, { novelId: "novel", chapterId: "A", content: "修改后正文" }), null);
  assert.equal(reviewForChapter(result, { novelId: "novel", chapterId: "A", content: "A正文" }), result);
});

test("the chapter runtime does not pass another chapter's review into repair actions", () => {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const source = fs.readFileSync(new URL("../hooks/useNovelEditChapterRuntime.ts", import.meta.url), "utf8");
  let receivedIssues;
  const modules = {
    react: { useState: (value) => [value, () => {}] },
    "@tanstack/react-query": { useMutation: () => ({}) },
    "../chapterProduction": { bindChapterReview, reviewForChapter },
    "./useChapterExecutionActions": { useChapterExecutionActions: (args) => { receivedIssues = args.reviewIssues; return {}; } },
  };
  const sandbox = { exports: {}, require: (id) => modules[id] ?? {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  sandbox.exports.useNovelEditChapterRuntime({
    novelId: "novel", selectedChapterId: "B", selectedChapter: { id: "B", content: "B正文" },
    reviewResult: bindChapterReview({ score: {}, issues: [{ evidence: "A问题" }] }, { novelId: "novel", chapterId: "A", content: "A正文" }),
    chapterSSE: {}, repairSSE: {},
  });
  assert.equal(receivedIssues.length, 0);
});
