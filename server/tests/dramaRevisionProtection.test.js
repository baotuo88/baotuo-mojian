const test = require("node:test");
const assert = require("node:assert/strict");
require("./fixtures/dramaTestDatabase.cjs")();
let answerPrompt = async () => ({ output: { facts: [] } });
const runnerPath = require.resolve("../dist/prompting/core/promptRunner.js");
require.cache[runnerPath] = {
  id: runnerPath,
  filename: runnerPath,
  loaded: true,
  exports: {
    runStructuredPrompt: (input) => answerPrompt(input),
  },
};
const { prisma } = require("../dist/db/prisma.js");
const {
  commitEpisodeEdit,
  assertCurrentStoryboard,
  withCurrentShot,
  saveEpisodeAssessment,
} = require("../dist/services/drama/revisions/index.js");
const { DramaScriptService } = require("../dist/services/drama/DramaScriptService.js");
const { DramaStoryboardService } = require("../dist/services/drama/DramaStoryboardService.js");
const { DramaContextAssembler } = require("../dist/services/drama/DramaContextAssembler.js");
test.after(() => prisma.$disconnect());

async function fixture() {
  const project = await prisma.dramaProject.create({
    data: {
      title: "版本保护",
      episodes: {
        create: [
          { order: 1, title: "初稿", content: "原台本" },
          { order: 2, title: "次集" },
          { order: 3, title: "未来" },
        ],
      },
    },
    include: { episodes: { orderBy: { order: "asc" } } },
  });
  const episode = project.episodes[0];
  const board = await prisma.dramaStoryboard.create({
    data: {
      projectId: project.id,
      episodeId: episode.id,
      shots: {
        create: { order: 1, action: "原镜头", keyframeData: '{"status":"done","url":"old.png"}' },
      },
    },
    include: { shots: true },
  });
  return {
    project,
    episode,
    board,
    edit: (changes, revision = 0) =>
      commitEpisodeEdit({
        episodeId: episode.id,
        expectedRevision: revision,
        changes,
        source: "manual",
      }),
  };
}

test("edits archive both revisions, invalidate downstream, retain historical media and reject stale saves", async () => {
  const { project, episode, board, edit } = await fixture();
  await prisma.dramaFact.createMany({
    data: [
      { projectId: project.id, episodeOrder: 1, text: "旧稿事实", source: "script" },
      { projectId: project.id, episodeOrder: 0, text: "源事实", source: "auto" },
    ],
  });
  const saved = await edit({ content: "人工新稿" });
  assert.equal(saved.revision, 1);
  const snapshots = await prisma.dramaEpisodeRevision.findMany({
    where: { episodeId: episode.id },
    orderBy: { revision: "asc" },
  });
  assert.deepEqual(
    snapshots.map((s) => s.content),
    ["原台本", "人工新稿"],
  );
  assert.equal(
    (await prisma.dramaStoryboard.findUnique({ where: { id: board.id } })).status,
    "stale",
  );
  assert.equal(
    (await prisma.dramaShot.findUnique({ where: { id: board.shots[0].id } })).keyframeData,
    board.shots[0].keyframeData,
  );
  assert.equal(await prisma.dramaFact.count({ where: { projectId: project.id, stale: true } }), 1);
  await assert.rejects(edit({ content: "过期客户端" }), (e) => e.statusCode === 409);
  await assert.rejects(assertCurrentStoryboard(board.id), (e) => e.statusCode === 409);
  await assert.rejects(
    withCurrentShot(board.shots[0].id, (tx) =>
      tx.dramaShot.update({ where: { id: board.shots[0].id }, data: { keyframeData: "bad" } }),
    ),
    (e) => e.statusCode === 409,
  );
  assert.equal(
    (await prisma.dramaShot.findUnique({ where: { id: board.shots[0].id } })).keyframeData,
    board.shots[0].keyframeData,
  );
});

test("identical saves preserve revision and media; metadata changes invalidate downstream", async () => {
  const { board, edit } = await fixture();
  await prisma.dramaFact.create({
    data: { projectId: board.projectId, episodeOrder: 1, text: "标题编辑应保留", source: "script" },
  });
  assert.equal((await edit({ content: "原台本" })).revision, 0);
  await assertCurrentStoryboard(board.id);
  assert.equal((await edit({ hookOpening: "新开场" })).revision, 1);
  assert.equal(
    await prisma.dramaFact.count({
      where: {
        projectId: board.projectId,
        text: "标题编辑应保留",
        stale: false,
        sourceRevision: 1,
      },
    }),
    1,
  );
  await assert.rejects(assertCurrentStoryboard(board.id), (e) => e.statusCode === 409);
});

function deferredPrompt() {
  let release, started;
  const ready = new Promise((r) => {
    started = r;
  });
  answerPrompt = () => {
    started();
    return new Promise((r) => {
      release = r;
    });
  };
  return { ready, finish: (output) => release({ output }) };
}

test("late AI script and storyboard cannot commit over a manual edit", async () => {
  for (const kind of ["script", "storyboard"]) {
    const { project, episode, edit } = await fixture();
    const pending = deferredPrompt();
    const task =
      kind === "script"
        ? new DramaScriptService().generateEpisodeScript(project.id, 1)
        : new DramaStoryboardService().generateStoryboard(project.id, 1);
    await pending.ready;
    await edit({ content: "保留这段人工稿" });
    const rejected = assert.rejects(task, (e) => e.statusCode === 409);
    pending.finish(
      kind === "script"
        ? {
            content: "过期AI",
            durationSec: 12,
            newlyIntroducedFacts: [{ text: "不能写入", category: "revealed" }],
          }
        : { summary: "过期分镜", shots: [{ order: 1, action: "旧镜头" }] },
    );
    await rejected;
    assert.equal(
      (await prisma.dramaEpisode.findUnique({ where: { id: episode.id } })).content,
      "保留这段人工稿",
    );
    assert.equal(
      await prisma.dramaFact.count({ where: { projectId: project.id, text: "不能写入" } }),
      0,
    );
    assert.equal(await prisma.dramaStoryboard.count({ where: { episodeId: episode.id } }), 1);
  }
});

test("late and concurrent assessments cannot restore obsolete quality flags", async () => {
  const { episode, edit } = await fixture();
  await saveEpisodeAssessment(episode.id, 0, null, {
    status: "reviewed",
    qualityFlags: '{"new":true}',
  });
  await assert.rejects(
    saveEpisodeAssessment(episode.id, 0, null, { status: "needs_repair", qualityFlags: "old" }),
    (e) => e.statusCode === 409,
  );
  await edit({ content: "修改后无需旧审校" });
  await assert.rejects(
    saveEpisodeAssessment(episode.id, 0, '{"new":true}', {
      status: "needs_repair",
      qualityFlags: "old",
    }),
    (e) => e.statusCode === 409,
  );
  assert.equal(
    (await prisma.dramaEpisode.findUnique({ where: { id: episode.id } })).qualityFlags,
    null,
  );
});

test("context excludes stale and future episode facts", async () => {
  const { project } = await fixture();
  await prisma.dramaFact.createMany({
    data: [
      { projectId: project.id, episodeOrder: 0, text: "源设定" },
      { projectId: project.id, episodeOrder: 1, text: "前集当前事实", source: "script" },
      { projectId: project.id, episodeOrder: 1, text: "废弃事实", source: "script", stale: true },
      { projectId: project.id, episodeOrder: 3, text: "未来事实", source: "script" },
    ],
  });
  const context = await new DramaContextAssembler().buildEpisodeContext(project.id, 2);
  assert.match(context.factsDigest, /源设定/);
  assert.match(context.factsDigest, /前集当前事实/);
  assert.doesNotMatch(context.factsDigest, /废弃|未来/);
});
