const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const { sourceLoader } = require("./helpers/comicAssetFixture.cjs");

const SRC = path.join(__dirname, "../src/services/comic");
async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comic-assets-"));
  // Temporary image fixtures only; retain for diagnosis, never touch application storage.
  const panel = {
    id: "panel-a",
    order: 1,
    visualPrompt: "画面",
    dialogues: null,
    characterRefs: null,
    sceneRef: null,
    imageData: JSON.stringify({ status: "done", version: 1 }),
    letteredData: null,
    episode: { project: { stylePreset: "{}", characters: [], characterAssets: [], scenes: [] } },
  };
  const panels = [panel];
  const jobs = new Map();
  const matches = (where) => Object.entries(where).every(([k, v]) => panel[k] === v);
  const prisma = {
    comicPanel: {
      findUnique: async () => structuredClone(panel),
      update: async ({ data }) => Object.assign(panel, data),
      updateMany: async ({ where, data }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(panel, data);
        return { count: 1 };
      },
    },
    comicEpisode: {
      findUnique: async () => ({
        id: "episode",
        projectId: "project",
        order: 1,
        panels: structuredClone(panels),
      }),
    },
    comicExportJob: {
      create: async ({ data }) => {
        const job = { id: "export-" + jobs.size, updatedAt: new Date(), ...data };
        jobs.set(job.id, job);
        return job;
      },
      update: async ({ where, data }) => Object.assign(jobs.get(where.id), data),
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const job of jobs.values()) {
          if (
            (where.id && job.id !== where.id) ||
            (where.projectId && job.projectId !== where.projectId) ||
            job.status !== where.status
          )
            continue;
          if (
            (where.updatedAt?.lt && !(job.updatedAt < where.updatedAt.lt)) ||
            (where.updatedAt?.gte && !(job.updatedAt >= where.updatedAt.gte))
          )
            continue;
          Object.assign(job, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      },
      findUnique: async ({ where }) => jobs.get(where.id),
    },
  };
  let provider = async () => ({
    images: [{ url: "data:image/png;base64," + (await png(40, 60, "red")).toString("base64") }],
  });
  const load = sourceLoader({
    "/db/prisma": { prisma },
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
    "/image/provider": {
      isImageProviderSupported: () => true,
      resolveImageModel: async () => "fake",
      generateImagesByProvider: (input) => provider(input),
    },
    "/comic/ComicCharacterImageService": { isCharacterExpressionId: () => false },
    "/comic/ComicCharacterAssetService": {},
    "/comic/ComicSpriteSheetService": {},
    "/comic/ComicSceneService": {},
    ...overrides,
  });
  return {
    root,
    panel,
    panels,
    jobs,
    prisma,
    load,
    setProvider(fn) {
      provider = fn;
    },
    service(name) {
      return load(path.join(SRC, name + ".ts"));
    },
  };
}
async function png(width, height, background) {
  return sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer();
}
async function legacyImage(f, id = "panel-a", color = "red", height = 60) {
  const dir = path.join(f.root, "comic-panels", id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "panel.png"), await png(40, height, color));
}

test("complete episode export rejects missing panels with their positions", async (t) => {
  const f = await fixture(t);
  await legacyImage(f);
  f.panels.push({ ...f.panel, id: "panel-b", order: 2, imageData: null });
  await assert.rejects(
    f.service("ComicExportService").comicExportService.exportEpisode("episode"),
    (e) => e.statusCode === 400 && /2/.test(e.message),
  );
  assert.equal(
    [...f.jobs.values()].some((j) => j.status === "done"),
    false,
  );
});

test("export refuses a stray raw file when imageData has no confirmed image", async (t) => {
  const f = await fixture(t);
  await legacyImage(f);
  f.panel.imageData = null;
  await assert.rejects(
    f.service("ComicExportService").comicExportService.exportEpisode("episode"),
    (e) => e.statusCode === 400,
  );
});

test("old lettered.png never appears in export or lettered HTTP reads without matching metadata", async (t) => {
  const f = await fixture(t);
  await legacyImage(f);
  const dir = path.join(f.root, "comic-panels-lettered", f.panel.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "lettered.png"), await png(40, 60, "blue"));
  assert.equal(
    await f
      .service("ComicBubbleLayoutService")
      .comicBubbleLayoutService.getLetteredImageFile(f.panel.id),
    null,
  );
  const result = await f
    .service("ComicExportService")
    .comicExportService.exportEpisode("episode", "long_image", { sliceWidth: 40 });
  const color = await sharp(result.artifacts[0].filePath).raw().toBuffer();
  assert.equal(color[0], 255);
  assert.equal(color[2], 0);
});

test("sliced export has a safe default height and freezes the exact input image versions", async (t) => {
  const f = await fixture(t);
  await legacyImage(f, "panel-a", "red", 24000);
  const result = await f
    .service("ComicExportService")
    .comicExportService.exportEpisode("episode", "sliced", { sliceWidth: 40 });
  assert.ok(result.artifacts.length > 1);
  assert.equal(
    result.artifacts.reduce((sum, a) => sum + a.height, 0),
    24000,
  );
  const saved = JSON.parse(f.jobs.get(result.jobId).spec);
  assert.equal(saved.inputSnapshot.panels[0].id, f.panel.id);
  assert.equal(saved.inputSnapshot.panels[0].imageData, f.panel.imageData);
});

test("late image generation cannot overwrite newer dialogue edits or their image metadata", async (t) => {
  const f = await fixture(t);
  await legacyImage(f);
  f.setProvider(async () => {
    f.panel.dialogues = '[{"text":"new"}]';
    f.panel.imageData = null;
    return {
      images: [{ url: "data:image/png;base64," + (await png(40, 60, "blue")).toString("base64") }],
    };
  });
  await assert.rejects(
    f.service("ComicPanelImageService").comicPanelImageService.generatePanelImage(f.panel.id),
    (e) => e.statusCode === 409,
  );
  assert.equal(f.panel.dialogues, '[{"text":"new"}]');
  assert.equal(f.panel.imageData, null);
  const old = await sharp(path.join(f.root, "comic-panels", f.panel.id, "panel.png"))
    .raw()
    .toBuffer();
  assert.equal(old[0], 255);
});

test("a replacement image lives in a unique revision and clears obsolete lettering only after commit", async (t) => {
  const f = await fixture(t);
  await legacyImage(f);
  f.panel.letteredData = '{"status":"done"}';
  const svc = f.service("ComicPanelImageService").comicPanelImageService;
  await svc.generatePanelImage(f.panel.id);
  const data = JSON.parse(f.panel.imageData);
  assert.ok(data.revision);
  assert.ok(data.sourceFingerprint);
  assert.equal(f.panel.letteredData, null);
  assert.ok(await svc.getPanelImageFile(f.panel.id));
  assert.ok(await fs.stat(path.join(f.root, "comic-panels", f.panel.id, "panel.png")));
});

test("a late worker writes only its own revision and cannot replace the winning worker image", async (t) => {
  const f = await fixture(t);
  await legacyImage(f);
  let started;
  const firstStarted = new Promise((resolve) => {
    started = resolve;
  });
  let release;
  const finishFirst = new Promise((resolve) => {
    release = resolve;
  });
  let count = 0;
  f.setProvider(async () => {
    const first = ++count === 1;
    if (first) {
      started();
      await finishFirst;
    }
    return {
      images: [
        {
          url:
            "data:image/png;base64," +
            (await png(40, 60, first ? "red" : "blue")).toString("base64"),
        },
      ],
    };
  });
  const svc = f.service("ComicPanelImageService").comicPanelImageService;
  const older = svc.generatePanelImage(f.panel.id);
  const rejected = assert.rejects(older, (e) => e.statusCode === 409);
  await firstStarted;
  await svc.generatePanelImage(f.panel.id);
  const winner = f.panel.imageData;
  release();
  await rejected;
  assert.equal(f.panel.imageData, winner);
  const image = await svc.getPanelImageFile(f.panel.id);
  const color = await sharp(image.buffer).raw().toBuffer();
  assert.equal(color[2], 255);
  assert.equal(color[0], 0);
});

test("failed or corrupt replacement retains a readable previously confirmed image and lettering", async (t) => {
  const f = await fixture(t);
  await legacyImage(f);
  f.panel.letteredData = '{"status":"done","marker":"keep"}';
  f.setProvider(async () => ({
    images: [{ url: "data:image/png;base64," + Buffer.from("not an image").toString("base64") }],
  }));
  const svc = f.service("ComicPanelImageService").comicPanelImageService;
  await assert.rejects(svc.generatePanelImage(f.panel.id));
  const image = await svc.getPanelImageFile(f.panel.id);
  assert.ok(image);
  assert.equal(JSON.parse(f.panel.imageData).status, "error");
  assert.equal(JSON.parse(f.panel.letteredData).marker, "keep");
});

test("lettering renders valid SVG and is usable only for its captured image and dialogue version", async (t) => {
  const f = await fixture(t);
  f.panel.dialogues = '[{"speaker":"A","text":"Hello","bubbleType":"round"}]';
  const dir = path.join(f.root, "comic-panels", f.panel.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "panel.png"), await png(800, 1200, "red"));
  const svc = f.service("ComicBubbleLayoutService").comicBubbleLayoutService;
  const result = await svc.letterPanel(f.panel.id);
  assert.equal(result.width, 800);
  const data = JSON.parse(f.panel.letteredData);
  assert.ok(data.revision);
  assert.ok(data.sourceFingerprint);
  assert.ok(await svc.getLetteredImageFile(f.panel.id));
  f.panel.dialogues = '[{"text":"New text"}]';
  assert.equal(await svc.getLetteredImageFile(f.panel.id), null);
});

test("lettering refuses to commit if dialogue changes during image rendering", async (t) => {
  let editOnWrite;
  const f = await fixture(t, {
    "fs/promises": {
      ...fs,
      async writeFile(filename, ...args) {
        if (String(filename).includes("comic-panels-lettered")) editOnWrite();
        return fs.writeFile(filename, ...args);
      },
    },
  });
  await legacyImage(f);
  editOnWrite = () => {
    f.panel.dialogues = '[{"text":"changed"}]';
  };
  await assert.rejects(
    f.service("ComicBubbleLayoutService").comicBubbleLayoutService.letterPanel(f.panel.id),
    (e) => e.statusCode === 409,
  );
  assert.equal(f.panel.letteredData, null);
});

test("slice boundaries retain panel order and crossing pixels without a complete episode canvas", async (t) => {
  const f = await fixture(t);
  await legacyImage(f, "panel-a", "red", 60);
  f.panels.push({ ...f.panel, id: "panel-b", order: 2 });
  await legacyImage(f, "panel-b", "blue", 60);
  const result = await f
    .service("ComicExportService")
    .comicExportService.exportEpisode("episode", "sliced", { sliceWidth: 40, sliceMaxHeight: 80 });
  assert.deepEqual(
    Array.from(result.artifacts, (a) => a.height),
    [80, 40],
  );
  const pixels = await sharp(result.artifacts[0].filePath).removeAlpha().raw().toBuffer();
  assert.equal(pixels[0], 255);
  assert.equal(pixels[40 * 60 * 3 + 2], 255);
  const frozen = await fs.readFile(
    path.join(f.root, "comic-exports", result.jobId, "inputs", "panel-1.png"),
  );
  assert.deepEqual(frozen, await png(40, 60, "red"));
});

test("invalid export dimensions fail before creating a job; unfinished files are not downloadable", async (t) => {
  const f = await fixture(t);
  const svc = f.service("ComicExportService").comicExportService;
  for (const spec of [
    { sliceWidth: 0 },
    { sliceWidth: 50000 },
    { sliceMaxHeight: -1 },
    { quality: 0 },
    { outputFormat: "tiff" },
  ]) {
    await assert.rejects(svc.exportEpisode("episode", "sliced", spec), (e) => e.statusCode === 400);
  }
  assert.equal(f.jobs.size, 0);
  f.jobs.set("incomplete", {
    id: "incomplete",
    status: "processing",
    artifacts: '[{"filePath":"slice-001.png"}]',
  });
  const dir = path.join(f.root, "comic-exports", "incomplete");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "slice-001.png"), await png(40, 60, "red"));
  assert.equal(await svc.getArtifactFile("incomplete", "slice-001.png"), null);
});
