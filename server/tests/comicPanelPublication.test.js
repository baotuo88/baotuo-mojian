const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { sourceLoader } = require("./helpers/comicAssetFixture.cjs");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comic-publication-"));
  const db = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: "file:" + path.join(root, "fixture.sqlite") }),
  });
  t.after(() => db.$disconnect());
  await db.$executeRawUnsafe(
    "CREATE TABLE ComicPanel (id TEXT PRIMARY KEY, visualPrompt TEXT, dialogues TEXT, characterRefs TEXT, sceneRef TEXT, imageData TEXT, letteredData TEXT, updatedAt DATETIME)",
  );
  const panel = {
    id: "panel",
    visualPrompt: "original",
    dialogues: null,
    characterRefs: null,
    sceneRef: null,
    imageData: null,
    letteredData: null,
  };
  await db.$executeRawUnsafe(
    "INSERT INTO ComicPanel (id, visualPrompt) VALUES ('panel', 'original')",
  );
  const load = sourceLoader({
    "/db/prisma": { prisma: db },
    "/runtime/appPaths": { resolveGeneratedImagesRoot: () => root },
    "/middleware/errorHandler": {
      AppError: class extends Error {
        constructor(message, statusCode) {
          super(message);
          this.statusCode = statusCode;
        }
      },
    },
    "/platform/execution": { throwIfExecutionAborted() {}, getExecutionAbortSignal() {} },
  });
  const { createPanelImageAdapter } = load(
    path.join(__dirname, "../src/services/comic/assets/PanelImagePublication.ts"),
  );
  const adapter = createPanelImageAdapter(panel);
  async function writeImage() {
    const filename = adapter.diskPath("png");
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } })
      .png()
      .toFile(filename);
  }
  return {
    db,
    adapter,
    writeImage,
    state: async () =>
      await db.comicPanel.findUnique({
        where: { id: "panel" },
        select: { imageData: true, letteredData: true },
      }),
  };
}

test("SQLite publication CAS rejects source edits between generation start and commit", async (t) => {
  const f = await fixture(t);
  await f.adapter.saveState({ status: "generating" });
  await f.writeImage();
  await f.db.comicPanel.updateMany({
    where: { id: "panel" },
    data: { visualPrompt: "new edit", imageData: null },
  });
  await assert.rejects(f.adapter.saveState({ status: "done" }), (e) => e.statusCode === 409);
  await f.adapter.saveState({ status: "error" });
  assert.equal((await f.state()).imageData, null);
});

test("SQLite publication atomically replaces image metadata and invalidates old lettering", async (t) => {
  const f = await fixture(t);
  await f.adapter.saveState({ status: "generating" });
  await f.writeImage();
  await f.db.comicPanel.updateMany({
    where: { id: "panel" },
    data: { letteredData: "old lettering" },
  });
  await f.adapter.saveState({ status: "done" });
  const state = await f.state();
  assert.equal(state.letteredData, null);
  assert.ok(JSON.parse(state.imageData).revision);
  assert.ok(JSON.parse(state.imageData).sourceFingerprint);
});
