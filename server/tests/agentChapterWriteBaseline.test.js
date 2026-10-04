const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");

function source(relativePath, modules = {}) {
  const text = fs.readFileSync(path.join(__dirname, "../src", relativePath), "utf8");
  const sandbox = { exports: {}, require: (id) => id === "zod" ? { z } : modules[id] ?? {} };
  vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox.exports;
}

const primitives = source("agents/tools/toolSchemaPrimitives.ts");
const schemas = source("agents/tools/writeToolSchemas.ts", { "./toolSchemaPrimitives": primitives });
const readSchemas = source("agents/tools/novelToolShared.ts");
const contextApi = source("agents/runtime/executionContext.ts");
const runtimeHelpers = source("agents/runtime/runtimeHelpers.ts");
const workflowTypes = source("prompting/workflows/workflowTypes.ts");
const workflows = source("prompting/workflows/chapterWorkflowDefinitions.ts", { "./workflowTypes": workflowTypes });
const patchHelpers = source("agents/tools/shared.ts", {
  "../../services/novel/application/sharedNovelServices": { getSharedNovelServices: () => ({}) },
});

function fixture(initial = "原稿", beforeWrite = () => {}) {
  let content = initial;
  const calls = [];
  const chapter = () => ({ id: "chapter", novelId: "novel", title: "本章", order: 1, content });
  const shared = {
    ...patchHelpers,
    getChapter: async () => chapter(),
    getChapterByOrder: async () => chapter(),
    novelService: { updateChapter: async (_novel, _chapter, input) => {
      beforeWrite({ edit: (value) => { content = value; } });
      calls.push(input);
      if (input.expectedContent !== content) throw new Error("正文版本冲突");
      content = input.content;
      return { ...chapter(), updatedAt: new Date() };
    } },
  };
  return {
    calls,
    get content() { return content; },
    edit: (value) => { content = value; },
    write: source("agents/tools/writeTools.ts", { "./shared": shared, "./writeToolSchemas": schemas }).writeToolDefinitions,
    read: source("agents/tools/novelReadTools.ts", { "./shared": shared, "./novelToolShared": readSchemas }).novelReadToolDefinitions,
  };
}

test("chapter read tools retain null and raw whitespace as the write baseline", async () => {
  for (const content of [null, "  原稿\n"]) {
    const f = fixture(content);
    for (const tool of ["get_chapter_content", "get_chapter_content_by_order"]) {
      const result = await f.read[tool].execute({}, { novelId: "novel", chapterId: "chapter", chapterOrder: 1 });
      assert.equal(result.expectedContent, content);
    }
  }
});

test("a generated draft keeps its original baseline when another edit arrives before the save tool", async () => {
  const f = fixture();
  const read = await f.read.get_chapter_content.execute({}, { novelId: "novel", chapterId: "chapter" });
  f.edit("新稿");
  await assert.rejects(f.write.save_chapter_draft.execute({}, {
    novelId: "novel", chapterId: "chapter", content: "旧稿生成的结果", expectedContent: read.expectedContent,
  }), /版本冲突/);
  assert.equal(f.calls[0].expectedContent, "原稿");
  assert.equal(f.content, "新稿");
});

test("draft and whole-chapter replacement schemas require a baseline", () => {
  const input = { novelId: "novel", chapterId: "chapter", content: "新正文" };
  assert.equal(schemas.saveChapterDraftInputSchema.safeParse(input).success, false);
  assert.equal(schemas.saveChapterDraftInputSchema.safeParse({ ...input, expectedContent: null }).success, true);
  assert.equal(schemas.applyChapterPatchInputSchema.safeParse({ ...input, mode: "full_replace" }).success, false);
  assert.equal(schemas.applyChapterPatchInputSchema.safeParse({ ...input, mode: "append" }).success, true);
});

test("deterministic patch writes compare the exact text read before applying the patch", async () => {
  const f = fixture("原稿", ({ edit }) => edit("并发新稿"));
  await assert.rejects(f.write.apply_chapter_patch.execute({}, {
    novelId: "novel", chapterId: "chapter", content: "新增片段", mode: "append",
  }), /版本冲突/);
  assert.equal(f.calls[0].expectedContent, "原稿");
  assert.equal(f.content, "并发新稿");
});

test("draft workflows resolve chapter order and baseline from the prior read result", async () => {
  const workflow = workflows.chapterWorkflowDefinitions.find((item) => item.id === "save_chapter_draft");
  const actions = workflow.resolve({
    intent: { chapterSelectors: { orders: [1] }, content: "用户草稿" }, plannerInput: { novelId: "novel" },
  });
  assert.deepEqual(Array.from(actions, (item) => item.tool), ["get_chapter_content", "save_chapter_draft"]);
  const f = fixture();
  const read = await f.read[actions[0].tool].execute({}, actions[0].input);
  const context = contextApi.applyToolResultContext({ contextMode: "novel", novelId: "novel" }, actions[0], read);
  const writeInput = contextApi.resolveToolInput(context, actions[1].input);
  assert.equal(writeInput.chapterId, "chapter");
  assert.equal(writeInput.expectedContent, "原稿");
  f.edit("读取后到达的新稿");
  await assert.rejects(f.write.save_chapter_draft.execute(context, writeInput), /版本冲突/);
  assert.equal(f.content, "读取后到达的新稿");
});

test("saved read context cannot supply another chapter's baseline or replace an explicit baseline", () => {
  const context = { novelId: "novel", chapterDraftSource: { novelId: "novel", chapterId: "chapter", chapterOrder: 1, expectedContent: null } };
  assert.equal(contextApi.resolveToolInput(context, { novelId: "other", chapterId: "chapter", content: "text" }).expectedContent, undefined);
  assert.equal(contextApi.resolveToolInput(context, { chapterId: "other", content: "text" }).expectedContent, undefined);
  assert.equal(contextApi.resolveToolInput(context, { chapterId: "chapter", content: "text", expectedContent: "original" }).expectedContent, "original");
  const restored = runtimeHelpers.parseApprovalPayload(JSON.stringify({ goal: "save", context, plannedActions: [{
    agent: "Writer", reasoning: "save", calls: [{ tool: "save_chapter_draft", reason: "save", idempotencyKey: "save", input: { chapterId: "chapter", content: "text" } }],
  }] }));
  assert.equal(restored.context.chapterDraftSource.expectedContent, null);
});

test("rejecting chapter patch approval produces only a preview and cannot save a replacement draft", async () => {
  const actions = runtimeHelpers.buildAlternativePathFromRejectedApproval({ plannedActions: [{ calls: [{
    tool: "apply_chapter_patch", input: { novelId: "novel", chapterId: "chapter", content: "拒绝的整章结果", mode: "full_replace", expectedContent: "原稿" },
  }] }] });
  const call = actions[0].calls[0];
  assert.equal(call.tool, "diff_chapter_patch");
  assert.equal(call.input.mode, "full_replace");
  const f = fixture();
  await f.write[call.tool].execute({}, call.input);
  assert.equal(f.content, "原稿");
  assert.equal(f.calls.length, 0);
});
