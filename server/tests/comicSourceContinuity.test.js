const test = require("node:test");
const assert = require("node:assert/strict");
const { load, fixture, sqliteFixture } = require("./comicPlanningReliability.test");

test("original and text projects can build source material with registered AI", async () => {
  for (const sourceType of ["original", "text_import"]) {
    const f = fixture();
    f.project.sourceType = sourceType;
    f.project.sourceInput = "少年带着破损地图寻找失落的城邦，最终决定守护故乡。";
    let usedPrompt;
    let persisted;
    f.prompt = async (input) => {
      usedPrompt = input.asset;
      return {
        output: {
          synopsis: "少年寻找城邦的故事",
          beats: [{ order: 1, summary: "踏上寻找城邦的旅程" }],
          characters: [{ name: "少年", gender: "male" }],
          hardFacts: [],
        },
      };
    };
    f.db.comicSourceBundle.upsert = async (input) => {
      persisted = JSON.parse(input.create.bundleJson);
    };
    const { ComicProjectService } = load("services/comic/ComicProjectService.ts", f);
    await new ComicProjectService().importSourceBundle("p");
    assert.equal(usedPrompt.id, "comic.sourceBundle");
    assert.equal(persisted.characters[0].name, "少年");
    if (sourceType === "text_import") assert.equal(persisted.rawText, f.project.sourceInput);
  }
});

test("continuing outline planning includes earlier plot and following boundaries", async () => {
  const f = fixture();
  const neighbors = [
    {
      id: "earlier",
      order: 1,
      title: "地图碎片",
      outline: "主角取得地图并离开故乡",
      cliffhanger: "抵达城门",
      scriptConfig: JSON.stringify({ sourceRange: { start: 1, end: 2 } }),
    },
    {
      id: "later",
      order: 3,
      title: "最终抉择",
      outline: "主角决定守护故乡",
      cliffhanger: "",
      scriptConfig: JSON.stringify({ sourceRange: { start: 3, end: 3 } }),
    },
  ];
  f.db.comicEpisode.findMany = async (input) => (input.where.order ? [] : neighbors);
  let rendered;
  f.prompt = async (input) => {
    rendered = input.asset
      .render(input.promptInput)
      .map((m) => m.content)
      .join("\n");
    return {
      output: {
        episodes: [
          {
            order: 2,
            title: "入城",
            synopsis: "主角入城并遭遇守卫阻拦",
            isPaywalled: false,
            sourceChapterStart: 2,
            sourceChapterEnd: 3,
          },
        ],
      },
    };
  };
  const { ComicEpisodePlanService } = load("services/comic/ComicEpisodePlanService.ts", f);
  await new ComicEpisodePlanService().generateOutline("p", { startOrder: 2, count: 1 });
  assert.ok(rendered.includes("主角取得地图并离开故乡"));
  assert.ok(rendered.includes("主角决定守护故乡"));
});

test("real novel adapter rejects blank or missing chapters instead of using chapter headings as prose", async () => {
  const f = fixture();
  f.db.chapter = { findMany: async () => [{ order: 1, title: "尚未撰写", content: null }] };
  const { NovelSourceAdapter } = load("services/adaptation/source/NovelSourceAdapter.ts", f);
  await assert.rejects(
    new NovelSourceAdapter().loadChapterText({ type: "novel_import", ref: "n" }, 1, 1),
    /正文/,
  );
  f.db.chapter.findMany = async () => [{ order: 1, title: "首章", content: "真实正文" }];
  await assert.rejects(
    new NovelSourceAdapter().loadChapterText({ type: "novel_import", ref: "n" }, 1, 2),
    /章节/,
  );
  assert.match(
    await new NovelSourceAdapter().loadChapterText({ type: "novel_import", ref: "n" }, 1, 1),
    /真实正文/,
  );
});

test("novel bundles keep planned chapters for drama while manuscript reads validate content", async () => {
  const f = fixture();
  f.db.novel = {
    findUnique: async () => ({ id: "n", title: "原著", description: "完整小说梗概" }),
  };
  f.db.chapter = {
    findMany: async () => [
      { order: 1, title: "计划章节", expectation: "尚未撰写的计划情节", content: null },
    ],
  };
  f.db.character = { findMany: async () => [] };
  f.db.novelFactEntry = { findMany: async () => [] };
  const { NovelSourceAdapter } = load("services/adaptation/source/NovelSourceAdapter.ts", f);
  const bundle = await new NovelSourceAdapter().loadBundle({ type: "novel_import", ref: "n" });
  assert.equal(bundle.beats.length, 1);
  assert.equal(bundle.beats[0].sourceChapterStart, 1);
  assert.match(bundle.beats[0].summary, /尚未撰写的计划情节/);
  const dramaFacade = load("services/drama/source/NovelSourceAdapter.ts", {
    ...f,
    realNovelAdapter: true,
  });
  const dramaBundle = await new dramaFacade.NovelSourceAdapter().loadBundle({
    type: "novel_import",
    ref: "n",
  });
  assert.equal(JSON.stringify(dramaBundle), JSON.stringify(bundle));
});

test("a changed neighboring outline rejects stale planning without modifying the manuscript", async () => {
  const f = fixture();
  let title = "原前话";
  f.db.comicEpisode.findMany = async (input) =>
    input.where.order
      ? []
      : [
          {
            id: "prior",
            order: 1,
            title,
            outline: "前话情节",
            cliffhanger: null,
            scriptConfig: null,
          },
        ];
  f.prompt = async () => {
    title = "用户修改的前话";
    return {
      output: {
        episodes: [
          {
            order: 2,
            title: "续话",
            synopsis: "主角跟随前话展开新旅程",
            isPaywalled: false,
            sourceChapterStart: 2,
            sourceChapterEnd: 3,
          },
        ],
      },
    };
  };
  const { ComicEpisodePlanService } = load("services/comic/ComicEpisodePlanService.ts", f);
  await assert.rejects(
    new ComicEpisodePlanService().generateOutline("p", { startOrder: 2, count: 1 }),
    (error) => error.statusCode === 409,
  );
  assert.deepEqual(f.saved, []);
  assert.deepEqual(f.deleted, []);
});

test("outline contract enables AI semantic retry for incomplete requested orders", () => {
  const { comicEpisodeOutlinePrompt } = load("prompting/prompts/comic/comic.prompts.ts");
  assert.equal(comicEpisodeOutlinePrompt.semanticRetryPolicy.maxAttempts, 1);
  assert.throws(
    () =>
      comicEpisodeOutlinePrompt.postValidate(
        { episodes: [{ order: 1 }] },
        { startOrder: 1, endOrder: 2 },
      ),
    /遗漏/,
  );
});

test("unsupported or empty creation sources fail before writing a project", async () => {
  const f = fixture();
  let writes = 0;
  f.db.comicProject.create = async () => {
    writes += 1;
  };
  const { ComicProjectService } = load("services/comic/ComicProjectService.ts", f);
  for (const sourceType of ["original", "text_import", "novel_import", "comic_import"]) {
    await assert.rejects(
      new ComicProjectService().createProject({ title: "故事", sourceType }),
      (error) => error.statusCode === 400,
    );
  }
  assert.equal(writes, 0);
});

test("source prompt is discoverable in registry and retains the final imported event", () => {
  const { getRegisteredPromptAsset } = load("prompting/registry.ts");
  const asset = getRegisteredPromptAsset("comic.sourceBundle", "v1");
  assert.ok(asset.management.productPrompt);
  assert.ok(asset.outputSchema);
  const text = "中段情节".repeat(10000) + "最终主角回到故乡";
  assert.ok(
    asset
      .render({ title: "故事", sourceType: "text_import", sourceInput: text })
      .some((message) => message.content.includes("最终主角回到故乡")),
  );
});

test("real SQLite novel adapter preserves source chapters and reads complete manuscript range", async (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");
  const Database = require("better-sqlite3");
  const { PrismaClient } = require("@prisma/client");
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  const filename = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "comic-novel-source-")),
    "fixture.sqlite",
  );
  const sqlite = new Database(filename);
  sqlite.exec(`
    CREATE TABLE Novel (id TEXT PRIMARY KEY, title TEXT, description TEXT);
    CREATE TABLE Chapter (id TEXT PRIMARY KEY, novelId TEXT, "order" INTEGER, title TEXT, expectation TEXT, content TEXT);
    CREATE TABLE Character (id TEXT PRIMARY KEY, novelId TEXT, name TEXT, gender TEXT, role TEXT, personality TEXT, background TEXT, appearance TEXT, physique TEXT, attireStyle TEXT, signatureDetail TEXT);
    CREATE TABLE NovelFactEntry (id TEXT PRIMARY KEY, novelId TEXT, chapterOrder INTEGER, text TEXT, category TEXT);
    INSERT INTO Novel VALUES ('n', '真实源小说', '三章完整故事');
    INSERT INTO Chapter VALUES ('c1', 'n', 1, '开场', '踏上旅程', '第一章正文'), ('c2', 'n', 2, '相遇', '遇到同伴', '第二章正文'), ('c3', 'n', 3, '返乡', '结束旅程', '第三章结局正文');
    INSERT INTO Character VALUES ('character1', 'n', '主角', 'male', '主人公', '勇敢', '故乡居民', '黑发', '修长', '灰衣', '红绳');
    INSERT INTO NovelFactEntry VALUES ('fact1', 'n', 2, '取得地图', 'completed');
  `);
  sqlite.close();
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${filename}` }) });
  t.after(() => db.$disconnect());
  const { NovelSourceAdapter } = load("services/adaptation/source/NovelSourceAdapter.ts", { db });
  const adapter = new NovelSourceAdapter();
  const bundle = await adapter.loadBundle({ type: "novel_import", ref: "n" });
  assert.equal(bundle.characters[0].sourceCharacterRef, "character1");
  assert.equal(bundle.beats.length, 3);
  assert.equal(bundle.beats[2].sourceChapterEnd, 3);
  const text = await adapter.loadChapterText({ type: "novel_import", ref: "n" }, 2, 3);
  assert.ok(!text.includes("第一章正文"));
  assert.ok(text.includes("第二章正文"));
  assert.ok(text.includes("第三章结局正文"));
});

test("editing dialogue archives and invalidates stale facts without calling AI", async () => {
  const f = fixture();
  const panel = {
    id: "panel",
    episodeId: "e",
    order: 1,
    action: "交谈",
    visualPrompt: "两个人谈话",
    dialogues: '[{"speaker":"主角","text":"钥匙给了甲"}]',
    imageData: null,
    letteredData: null,
  };
  f.episode.panels = [panel];
  f.db.comicPanel.findUnique = async () => panel;
  f.db.comicPanel.updateMany = async () => ({ count: 1 });
  f.db.comicFact.findMany = async () => [
    { id: "oldfact", projectId: "p", episodeOrder: 1, text: "甲拿到钥匙", category: "completed" },
  ];
  let invalidated = false;
  let calls = 0;
  f.db.comicFact.deleteMany = async () => {
    invalidated = true;
    return { count: 1 };
  };
  f.prompt = async () => {
    calls += 1;
    throw new Error("Manual save must not invoke paid AI");
  };
  const { ComicPanelScriptService } = load("services/comic/ComicPanelScriptService.ts", f);
  await new ComicPanelScriptService().updatePanelDialogues("panel", [
    { speaker: "主角", text: "钥匙仍在我手里" },
  ]);
  assert.equal(invalidated, true);
  assert.equal(calls, 0);
  const archive = JSON.parse(f.backups[0].progress);
  assert.equal(archive.facts[0].text, "甲拿到钥匙");
  assert.equal(JSON.parse(archive.episodes[0].panels[0].dialogues)[0].text, "钥匙给了甲");
});

test("fact extraction includes dialogue-only revelations and edited visual content", async () => {
  const f = fixture();
  delete f.factService;
  f.episode.panels = [
    {
      id: "panel",
      order: 1,
      panelType: "close_up",
      action: "主角开口说话",
      visualPrompt: "主角手里持有钥匙",
      dialogues: '[{"speaker":"主角","text":"城门密语是春晓"}]',
      characterRefs: null,
    },
  ];
  let summary;
  f.prompt = async (input) => {
    summary = input.promptInput.panelSummary;
    return { output: { facts: [] } };
  };
  const { ComicFactService } = load("services/comic/ComicFactService.ts", f);
  await new ComicFactService().extractAndSave("e");
  assert.ok(summary.includes("城门密语是春晓"));
  assert.ok(summary.includes("主角手里持有钥匙"));
});

test("real SQLite manual edit archives previous facts before invalidating them", async (t) => {
  const { db } = await sqliteFixture(t);
  const { ComicPanelScriptService } = load("services/comic/ComicPanelScriptService.ts", { db });
  await new ComicPanelScriptService().updatePanelDialogues("panel", [
    { speaker: "主角", text: "新的台词" },
  ]);
  assert.equal(await db.comicFact.count(), 0);
  const panel = await db.comicPanel.findUnique({ where: { id: "panel" } });
  assert.equal(JSON.parse(panel.dialogues)[0].text, "新的台词");
  assert.equal(panel.imageData, null);
  const backup = await db.comicBatchJob.findFirst({ where: { type: "planning_backup" } });
  assert.equal(JSON.parse(backup.progress).facts[0].text, "原事实");
});

test("real SQLite backup failure preserves old dialogue, image and facts during manual edit", async (t) => {
  const { db } = await sqliteFixture(t);
  await db.$executeRawUnsafe(
    "CREATE TRIGGER reject_comic_backup BEFORE INSERT ON ComicBatchJob BEGIN SELECT RAISE(ABORT, 'backup unavailable'); END",
  );
  const { ComicPanelScriptService } = load("services/comic/ComicPanelScriptService.ts", { db });
  await assert.rejects(
    new ComicPanelScriptService().updatePanelDialogues("panel", [
      { speaker: "主角", text: "不应保存" },
    ]),
  );
  const panel = await db.comicPanel.findUnique({ where: { id: "panel" } });
  assert.equal(panel.dialogues, null);
  assert.ok(panel.imageData.includes("original.png"));
  assert.equal(await db.comicFact.count(), 1);
  assert.equal(await db.comicBatchJob.count(), 0);
});
