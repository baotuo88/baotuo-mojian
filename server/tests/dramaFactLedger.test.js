const test = require("node:test");
const assert = require("node:assert/strict");
require("./fixtures/dramaTestDatabase.cjs")();
let answerPrompt;
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
  ensurePendingDramaFacts,
  commitEpisodeEdit,
} = require("../dist/services/drama/revisions/index.js");
const { DramaContextAssembler } = require("../dist/services/drama/DramaContextAssembler.js");
const {
  dramaEpisodeFactsOutputSchema,
  dramaEpisodeFactsPrompt,
} = require("../dist/prompting/prompts/drama/drama-facts.prompt.js");
test.after(() => prisma.$disconnect());

async function fixture() {
  const project = await prisma.dramaProject.create({
    data: {
      title: "事实保护",
      episodes: {
        create: [
          { order: 1, title: "前集", content: "主角交出了钥匙。", factsStatus: "pending" },
          { order: 2, title: "本集", content: "本集原稿", factsStatus: "ready" },
          { order: 3, title: "未来集", content: "未来稿", factsStatus: "pending" },
        ],
      },
    },
    include: { episodes: { orderBy: { order: "asc" } } },
  });
  const episode = project.episodes[0];
  await prisma.dramaFact.createMany({
    data: [
      { projectId: project.id, episodeOrder: 0, text: "源设定保留", source: "auto" },
      ...["script", "repair", "manual"].map((source) => ({
        projectId: project.id,
        episodeOrder: 1,
        text: `${source}的旧事实`,
        source,
        sourceRevision: 0,
      })),
    ],
  });
  return { project, episode };
}

async function readEpisode(episode) {
  return prisma.dramaEpisode.findUniqueOrThrow({ where: { id: episode.id } });
}

function deferredPrompt() {
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  answerPrompt = () => {
    calls++;
    entered();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  return {
    started,
    release: (output) => release({ output }),
    get calls() {
      return calls;
    },
  };
}

test("building the next episode context automatically reconstructs preceding manual facts and preserves historical rows", async () => {
  const { project, episode } = await fixture();
  const inputs = [];
  answerPrompt = async (input) => {
    inputs.push(input);
    return { output: { facts: [{ text: "主角把钥匙交给对方。", category: "state_changed" }] } };
  };
  const options = { provider: "openai", model: "fixture-facts", temperature: 0.2 };
  const context = await new DramaContextAssembler().buildEpisodeContext(project.id, 2, options);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].asset.id, "drama.episode.facts");
  assert.equal(inputs[0].promptInput.content, episode.content);
  assert.deepEqual(inputs[0].options, options);
  assert.match(context.factsDigest, /源设定保留/);
  assert.match(context.factsDigest, /钥匙交给对方/);
  assert.doesNotMatch(context.factsDigest, /旧事实|未来稿/);
  const current = await readEpisode(episode);
  assert.equal(current.factsStatus, "ready");
  assert.equal(current.revision, episode.revision);
  assert.equal(current.content, episode.content);
  const facts = await prisma.dramaFact.findMany({
    where: { projectId: project.id, episodeOrder: 1 },
  });
  assert.equal(facts.length, 4, "historical rows are retained");
  assert.equal(facts.filter((fact) => fact.stale).length, 3);
  assert.deepEqual(
    facts.filter((fact) => !fact.stale).map((fact) => [fact.source, fact.sourceRevision]),
    [["manual", 0]],
  );
  assert.equal(
    (await readEpisode(project.episodes[2])).factsStatus,
    "pending",
    "future episodes are not analyzed",
  );
  await new DramaContextAssembler().buildEpisodeContext(project.id, 2, options);
  assert.equal(inputs.length, 1, "ready ledgers do not invoke AI again");
});

test("failed or malformed AI output never completes pending facts or substitutes an empty ledger", async () => {
  const { project, episode } = await fixture();
  const before = await prisma.dramaFact.findMany({ where: { projectId: project.id } });
  for (const reply of [new Error("fixture provider unavailable"), { output: {} }]) {
    answerPrompt = async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    };
    await assert.rejects(
      ensurePendingDramaFacts(project.id, 2),
      (error) => error.statusCode === 502 && /第 1 集/.test(error.message),
    );
    assert.equal((await readEpisode(episode)).factsStatus, "pending");
    assert.deepEqual(await prisma.dramaFact.findMany({ where: { projectId: project.id } }), before);
  }
  answerPrompt = async () => ({ output: { facts: [] } });
  await ensurePendingDramaFacts(project.id, 2);
  assert.equal(
    (await readEpisode(episode)).factsStatus,
    "ready",
    "only an explicit valid empty result may complete extraction",
  );
  assert.equal(
    await prisma.dramaFact.count({
      where: { projectId: project.id, episodeOrder: 1, stale: false },
    }),
    0,
  );
});

test("late fact extraction cannot publish facts from a discarded script revision", async () => {
  const { project, episode } = await fixture();
  const pending = deferredPrompt();
  const task = ensurePendingDramaFacts(project.id, 2);
  await pending.started;
  await commitEpisodeEdit({
    episodeId: episode.id,
    expectedRevision: episode.revision,
    source: "manual",
    changes: { content: "主角保留钥匙，没有交出去。" },
  });
  const rejected = assert.rejects(task, (error) => error.statusCode === 409);
  pending.release({ facts: [{ text: "过时的交钥匙事实", category: "completed" }] });
  await rejected;
  const current = await readEpisode(episode);
  assert.equal(current.factsStatus, "pending");
  assert.equal(current.revision, 1);
  assert.equal(current.content, "主角保留钥匙，没有交出去。");
  assert.equal(
    await prisma.dramaFact.count({ where: { projectId: project.id, text: "过时的交钥匙事实" } }),
    0,
  );
});

test("concurrent next-episode actions share extraction for the same script revision", async () => {
  const { project } = await fixture();
  const pending = deferredPrompt();
  const first = ensurePendingDramaFacts(project.id, 2);
  await pending.started;
  const second = ensurePendingDramaFacts(project.id, 3);
  const complete = Promise.all([first, second]);
  pending.release({ facts: [{ text: "一次整理的事实", category: "completed" }] });
  await complete;
  assert.equal(pending.calls, 1);
  assert.equal(
    await prisma.dramaFact.count({ where: { projectId: project.id, text: "一次整理的事实" } }),
    1,
  );
});

test("empty scripts, current episodes, future episodes and ready ledgers do not trigger paid AI calls", async () => {
  const { project, episode } = await fixture();
  await prisma.dramaEpisode.update({ where: { id: episode.id }, data: { content: "  \n  " } });
  let calls = 0;
  answerPrompt = async () => {
    calls++;
    throw new Error("must not invoke");
  };
  await ensurePendingDramaFacts(project.id, 2);
  assert.equal(calls, 0);
  assert.equal((await readEpisode(project.episodes[2])).factsStatus, "pending");
});

test("metadata edits keep the existing ledger usable and bind it to the new revision", async () => {
  const { project, episode } = await fixture();
  answerPrompt = async () => ({
    output: { facts: [{ text: "仍然有效的剧情事实", category: "revealed" }] },
  });
  await ensurePendingDramaFacts(project.id, 2);
  await commitEpisodeEdit({
    episodeId: episode.id,
    expectedRevision: 0,
    source: "manual",
    changes: { title: "新标题", durationSec: 60 },
  });
  const current = await readEpisode(episode);
  assert.equal(current.factsStatus, "ready");
  assert.equal(current.revision, 1);
  const facts = await prisma.dramaFact.findMany({
    where: { projectId: project.id, episodeOrder: 1, stale: false },
  });
  assert.deepEqual(
    facts.map((fact) => [fact.text, fact.sourceRevision]),
    [["仍然有效的剧情事实", 1]],
  );
});

test("the registered fact contract requires a complete explicit list and known fact categories", () => {
  assert.equal(dramaEpisodeFactsPrompt.management.productPrompt, true);
  assert.equal(dramaEpisodeFactsOutputSchema.safeParse({}).success, false);
  assert.equal(
    dramaEpisodeFactsOutputSchema.safeParse({ facts: [{ text: "计划", category: "future" }] })
      .success,
    false,
  );
  assert.equal(dramaEpisodeFactsOutputSchema.safeParse({ facts: [] }).success, true);
});
