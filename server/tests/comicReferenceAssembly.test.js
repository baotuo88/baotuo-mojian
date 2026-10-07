const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const { sourceLoader } = require("./helpers/comicAssetFixture.cjs");

async function png(width, height, color) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}
async function fixture({ propCount = 1, characterCount = 1 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comic-reference-assembly-"));
  const files = new Map();
  async function image(id, color, width = 24, height = 12) {
    const filePath = path.join(root, id + ".png");
    await fs.writeFile(filePath, await png(width, height, color));
    const result = { filePath, revision: id + "-revision", mimeType: "image/png" };
    files.set(id, result);
    return result;
  }
  const characters = [];
  for (let i = 0; i < characterCount; i++) {
    characters.push({
      id: "char-" + i,
      name: "角色" + i,
      gender: "unknown",
      visualAnchor: null,
      sheetData: '{"status":"done"}',
    });
    await image("char-" + i, "red");
  }
  const characterAssets = [
    { id: "costume", name: "战斗服", assetType: "costume", characterId: "char-0" },
  ];
  await image("costume", "blue");
  for (let i = 0; i < propCount; i++) {
    characterAssets.push({
      id: "prop-" + i,
      name: "道具" + i,
      assetType: "item",
      characterId: "char-0",
    });
    await image("prop-" + i, "green");
  }
  await image("scene", "purple");
  const refs = characters.map((char, i) => ({
    name: char.name,
    costume: i === 0 ? "战斗服" : "default",
    props:
      i === 0
        ? characterAssets.filter((asset) => asset.assetType === "item").map((asset) => asset.name)
        : [],
  }));
  const panel = {
    id: "panel",
    order: 1,
    visualPrompt: "角色进入大厅",
    dialogues: null,
    characterRefs: JSON.stringify(refs),
    sceneRef: "大厅",
    imageData: null,
    letteredData: null,
    episode: {
      project: {
        stylePreset: "{}",
        characters,
        characterAssets,
        scenes: [
          {
            id: "scene",
            name: "大厅",
            bible: '{"palette":"purple"}',
            sheetData: '{"status":"done"}',
          },
        ],
      },
    },
  };
  const sent = [];
  const load = sourceLoader({
    "/db/prisma": {
      prisma: {
        comicPanel: {
          findUnique: async () => structuredClone(panel),
          updateMany: async ({ where, data }) => {
            if (!Object.entries(where).every(([key, value]) => panel[key] === value))
              return { count: 0 };
            Object.assign(panel, data);
            return { count: 1 };
          },
        },
      },
    },
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
      generateImagesByProvider: async (input) => {
        sent.push(input);
        return {
          images: [
            { url: "data:image/png;base64," + (await png(24, 12, "black")).toString("base64") },
          ],
        };
      },
    },
    "/comic/ComicCharacterImageService": {
      isCharacterExpressionId: () => true,
      describeCharacterExpression: () => "正常",
      comicCharacterImageService: {
        resolveSheetFile: async (id) => files.get(id),
        resolveExpressionFile: async () => null,
        resolveExpressionRegionFile: async () => null,
      },
    },
    "/comic/ComicCharacterAssetService": { resolveAssetFile: async (id) => files.get(id) },
    "/comic/ComicSceneService": { resolveSceneFile: async (id) => files.get(id) },
  });
  return {
    root,
    files,
    panel,
    sent,
    image,
    panelService: load(path.join(__dirname, "../src/services/comic/ComicPanelImageService.ts"))
      .comicPanelImageService,
    spriteService: load(path.join(__dirname, "../src/services/comic/ComicSpriteSheetService.ts"))
      .comicSpriteSheetService,
  };
}

test("sprite canvas follows encoded resized dimensions for small and tall source images", async () => {
  const f = await fixture();
  await f.image("costume", "blue", 40, 80);
  const result = await f.spriteService.buildSpriteSheet({
    characterId: "char-0",
    characterName: "角色",
    sheetFilePath: f.files.get("char-0").filePath,
    costumeAssets: [{ id: "costume", name: "战斗服" }],
    propAssets: [],
  });
  assert.ok(result);
  const meta = await sharp(result.filePath).metadata();
  assert.equal(meta.width, 1024 + 256);
  assert.equal(meta.height, 540);
  const pixels = await sharp(result.filePath).removeAlpha().raw().toBuffer();
  assert.equal(pixels[0], 255);
  assert.equal(pixels[1024 * 3 + 2], 255);
});

test("excluding a costume removes exactly that image while keeping the sheet, prop, and scene paired", async () => {
  const f = await fixture();
  const preview = await f.panelService.preparePanelImage("panel");
  assert.equal(preview.referenceImages.length, 4);
  assert.ok(preview.referenceImages.every((item) => item.url.includes("?revision=")));
  const excluded = preview.referenceImages.find((item) => item.url.includes("/costume/")).url;
  const result = await f.panelService.generatePanelImage("panel", "openai", {
    excludedReferenceImageUrls: [excluded],
  });
  assert.deepEqual(
    Array.from(f.sent[0].refImagePaths),
    ["char-0", "prop-0", "scene"].map((id) => f.files.get(id).filePath),
  );
  assert.deepEqual(
    Array.from(result.referenceImages, (item) => item.url),
    Array.from(
      preview.referenceImages.filter((item) => item.url !== excluded),
      (item) => item.url,
    ),
  );
});

test("all preview candidates remain selectable, then exclusions apply before the sixteen-image limit", async () => {
  const f = await fixture({ propCount: 14 });
  const preview = await f.panelService.preparePanelImage("panel");
  assert.equal(preview.referenceImages.length, 17);
  await assert.rejects(
    f.panelService.generatePanelImage("panel"),
    (e) => e.statusCode === 400 && /16/.test(e.message),
  );
  assert.equal(f.sent.length, 0);
  const excluded = preview.referenceImages[0].url;
  const filtered = await f.panelService.preparePanelImage("panel", "openai", {
    excludedReferenceImageUrls: [excluded],
  });
  assert.equal(filtered.referenceImages.length, 16);
  const result = await f.panelService.generatePanelImage("panel", "openai", {
    excludedReferenceImageUrls: [excluded],
  });
  assert.equal(f.sent[0].refImagePaths.length, 16);
  assert.equal(result.referenceImages.length, 16);
  assert.ok(!f.sent[0].refImagePaths.includes(f.files.get("char-0").filePath));
});

test("more than five structured characters keep their reference images and default costume uses the sheet", async () => {
  const f = await fixture({ characterCount: 6 });
  const refs = JSON.parse(f.panel.characterRefs);
  refs[0].costume = "default";
  f.panel.characterRefs = JSON.stringify(refs);
  const preview = await f.panelService.preparePanelImage("panel");
  assert.equal(preview.referenceImages.filter((item) => item.kind === "character_sheet").length, 6);
  assert.equal(
    preview.referenceImages.some((item) => item.url.includes("/costume/")),
    false,
  );
});
