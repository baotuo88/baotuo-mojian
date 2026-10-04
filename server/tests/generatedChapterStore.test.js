const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const ts = require("typescript");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

async function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "generated-chapter-store-"));
  const raw = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${path.join(directory, "fixture.sqlite")}` }),
  });
  t.after(() => raw.$disconnect());
  await raw.$executeRawUnsafe(
    'CREATE TABLE Chapter (id TEXT PRIMARY KEY, novelId TEXT, title TEXT, "order" INTEGER, content TEXT, generationState TEXT, chapterStatus TEXT, updatedAt DATETIME)',
  );
  await raw.$executeRawUnsafe(
    "CREATE TABLE NovelSnapshot (id TEXT PRIMARY KEY, novelId TEXT, label TEXT, triggerType TEXT, snapshotData TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)",
  );
  await raw.$executeRawUnsafe(
    "INSERT INTO Chapter (id,novelId,title,\"order\",content) VALUES ('chapter','novel','章',1,'original')",
  );
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/novel/runtime/persistence/GeneratedChapterStore.ts"),
    "utf8",
  );
  class AppError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  const sandbox = {
    exports: {},
    require(id) {
      if (id.endsWith("/db/prisma")) return { prisma: raw };
      if (id.endsWith("/db/sqliteRetry")) return { withSqliteRetry: (fn) => fn() };
      if (id.endsWith("/middleware/errorHandler")) return { AppError };
      throw new Error(id);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    sandbox,
  );
  return {
    raw,
    save: (overrides = {}) =>
      sandbox.exports.commitGeneratedChapter({
        novelId: "novel",
        chapterId: "chapter",
        expectedContent: "original",
        content: "generated",
        generationState: "drafted",
        ...overrides,
      }),
    content: async () => (await raw.chapter.findFirst({ select: { content: true } })).content,
  };
}

test("generation cannot overwrite a manuscript edited while the model was running", async (t) => {
  const f = await setup(t);
  await f.raw.chapter.updateMany({ data: { content: "user edit" } });
  await assert.rejects(f.save(), (e) => e.statusCode === 409);
  assert.equal(await f.content(), "user edit");
  assert.equal(await f.raw.novelSnapshot.count(), 0);
});

test("successful generation durably backs up the exact replaced text in the same transaction", async (t) => {
  const f = await setup(t);
  await f.save();
  assert.equal(await f.content(), "generated");
  const backup = await f.raw.novelSnapshot.findFirst();
  assert.equal(JSON.parse(backup.snapshotData).chapters[0].content, "original");
  await assert.rejects(f.save({ content: "late second writer" }), (e) => e.statusCode === 409);
  assert.equal(await f.content(), "generated");
});

test("failed manuscript backup leaves the original text and state untouched", async (t) => {
  const f = await setup(t);
  await f.raw.$executeRawUnsafe(
    "CREATE TRIGGER reject_backup BEFORE INSERT ON NovelSnapshot BEGIN SELECT RAISE(ABORT, 'backup unavailable'); END",
  );
  // Prisma maps SQLite's constraint-trigger abort to P2003.
  await assert.rejects(f.save(), (error) => error.code === "P2003");
  assert.equal(await f.content(), "original");
  assert.equal(await f.raw.novelSnapshot.count(), 0);
});

test("null baselines allow first drafts; missing baselines never bypass version protection", async (t) => {
  const f = await setup(t);
  await assert.rejects(f.save({ expectedContent: undefined }), (e) => e.statusCode === 409);
  await f.raw.chapter.updateMany({ data: { content: null } });
  await f.save({ expectedContent: null });
  assert.equal(await f.content(), "generated");
  assert.equal(await f.raw.novelSnapshot.count(), 0);
});
