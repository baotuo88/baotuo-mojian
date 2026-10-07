const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");

function loadService() {
  let content = "original";
  const effects = [];
  const prisma = {
    chapter: {
      findFirst: async () => ({ id: "chapter" }),
      update: async ({ where, data }) => {
        if (Object.hasOwn(where, "content") && where.content !== content) {
          throw Object.assign(new Error("No matching revision"), { code: "P2025" });
        }
        if (data.content !== undefined) content = data.content;
        return { id: "chapter", content, order: 1, title: data.title ?? "chapter" };
      },
    },
  };
  class AppError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/novel/novelCoreCrudService.ts"),
    "utf8",
  );
  const sandbox = {
    exports: {},
    require: (id) => {
      if (id === "../../db/prisma") return { prisma };
      if (id === "../../middleware/errorHandler") return { AppError };
      if (id === "./novelChapterArtifacts")
        return { syncChapterArtifacts: async () => effects.push("artifacts") };
      if (id === "./novelCoreSupport") return { queueRagUpsert: () => effects.push("rag") };
      return {};
    },
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    sandbox,
  );
  const service = Object.create(sandbox.exports.NovelCoreCrudService.prototype);
  service.volumeService = { mirrorChapterIntoWorkspace: async () => effects.push("volume") };
  return {
    service,
    effects,
    get content() {
      return content;
    },
  };
}

test("a stale editor save returns conflict without replacing content or scheduling side effects", async () => {
  const f = loadService();
  await f.service.updateChapter("novel", "chapter", {
    content: "newer",
    expectedContent: "original",
  });
  const effectCount = f.effects.length;
  await assert.rejects(
    f.service.updateChapter("novel", "chapter", { content: "older", expectedContent: "original" }),
    (error) => error.statusCode === 409,
  );
  assert.equal(f.content, "newer");
  assert.equal(f.effects.length, effectCount);
});

test("non-content chapter patches remain compatible without an expected revision", async () => {
  const f = loadService();
  const result = await f.service.updateChapter("novel", "chapter", { title: "renamed" });
  assert.equal(result.title, "renamed");
  assert.equal(f.content, "original");
  assert.equal(f.effects.includes("artifacts"), false);
});

test("core chapter writes reject a missing baseline even when HTTP validation is bypassed", async () => {
  const f = loadService();
  await assert.rejects(
    f.service.updateChapter("novel", "chapter", { content: "unversioned" }),
    (error) => error.statusCode === 409,
  );
  assert.equal(f.content, "original");
  assert.deepEqual(f.effects, []);
});

test("HTTP validation requires a baseline for content including empty drafts but permits null baselines", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/modules/novel/http/novelHttpSchemas.ts"),
    "utf8",
  );
  const ast = ts.createSourceFile("schemas.ts", source, ts.ScriptTarget.Latest, true);
  const statement = ast.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => declaration.name.getText(ast) === "updateChapterSchema",
      ),
  );
  const sandbox = { exports: {}, z };
  vm.runInNewContext(
    ts.transpileModule(statement.getText(ast), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    sandbox,
  );
  const schema = sandbox.exports.updateChapterSchema;
  assert.equal(schema.safeParse({ content: "" }).success, false);
  assert.equal(schema.safeParse({ content: "draft", expectedContent: null }).success, true);
  assert.equal(schema.safeParse({ title: "new title" }).success, true);
});
