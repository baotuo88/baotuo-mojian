const test = require("node:test");
const assert = require("node:assert/strict");
require("./fixtures/dramaTestDatabase.cjs")();
const { prisma } = require("../dist/db/prisma.js");
let outline = [];
let promptCalls = 0;
const runner = require.resolve("../dist/prompting/core/promptRunner.js");
require.cache[runner] = { id: runner, filename: runner, loaded: true, exports: {
  runStructuredPrompt: async () => { promptCalls += 1; return { output: { episodes: outline } }; },
} };
const { DramaProjectService } = require("../dist/services/drama/DramaProjectService.js");
const { DramaEpisodeOutlineService } = require("../dist/services/drama/DramaEpisodeOutlineService.js");
const { sourceContentRegistry } = require("../dist/services/drama/source/SourceContentPort.js");

test.after(async () => prisma.$disconnect());

test("initial source import and repeat requests preserve customized character assets", async () => {
  let calls = 0;
  sourceContentRegistry.register({ sourceType: "original", loadBundle: async () => {
    calls += 1;
    return { synopsis: "身世之谜", beats: [{ order: 1, summary: "回乡" }], characters: [{ name: "林澈", persona: "新设定" }], hardFacts: [] };
  } });
  const service = new DramaProjectService();
  const project = await service.createProject({ title: "来源保护", source: "original", inspiration: "回乡寻亲" });
  const character = await prisma.dramaCharacter.create({ data: {
    projectId: project.id, name: "林澈", persona: "手工设定", portraitData: '{"status":"done","url":"/portrait.png"}', voiceProfile: '{"voiceId":"voice-1"}',
  } });
  await service.assembleSourceBundle(project.id);
  await assert.rejects(service.assembleSourceBundle(project.id), /素材已整理/);
  assert.equal(calls, 1);
  const saved = await prisma.dramaCharacter.findUnique({ where: { id: character.id } });
  assert.equal(saved.portraitData, character.portraitData);
  assert.equal(saved.voiceProfile, character.voiceProfile);
  assert.equal(saved.persona, "手工设定");
  assert.equal(await prisma.dramaCharacter.count({ where: { projectId: project.id } }), 1);
});

test("outline continuation preserves existing episodes and rejects incomplete AI output atomically", async () => {
  const project = await prisma.dramaProject.create({ data: {
    title: "续分集保护", source: "original", track: "hidden_identity", strategy: "{}", targetEpisodes: 3,
  } });
  const existing = await prisma.dramaEpisode.create({ data: {
    projectId: project.id, order: 1, title: "保留标题", content: "完成的台本", status: "reviewed", qualityFlags: '{"status":"approved"}',
  } });
  const service = new DramaEpisodeOutlineService();
  const item = (order) => ({ order, title: `规划 ${order}`, hookOpening: "开场", hookType: "crisis", cliffhanger: "悬念", emotionNet: 1, conflict: "身世秘密" });
  outline = [item(1), item(2)];
  await service.generateOutline(project.id, { startOrder: 1, count: 2 });
  const saved = await prisma.dramaEpisode.findUnique({ where: { id: existing.id } });
  assert.equal(saved.title, existing.title);
  assert.equal(saved.content, existing.content);
  assert.equal(saved.qualityFlags, existing.qualityFlags);
  assert.equal(saved.status, existing.status);
  outline = [item(2), item(2)];
  await assert.rejects(service.generateOutline(project.id, { startOrder: 2, count: 2 }), /完整且连续/);
  assert.equal(await prisma.dramaEpisode.count({ where: { projectId: project.id } }), 2);
  outline = [];
  await assert.rejects(service.generateOutline(project.id, { startOrder: 3, count: 1 }), /完整且连续/);
  const calls = promptCalls;
  await assert.rejects(service.generateOutline(project.id, { startOrder: 4 }), /超出/);
  assert.equal(promptCalls, calls);
});

test("project projection retains recoverable tasks beyond the recent history window", async () => {
  const service = new DramaProjectService();
  const project = await service.createProject({ title: "恢复入口", source: "original" });
  const paused = await prisma.dramaBatchJob.create({ data: {
    projectId: project.id, type: "tts", status: "paused", createdAt: new Date("2020-01-01"),
  } });
  await prisma.dramaBatchJob.createMany({ data: Array.from({ length: 21 }, () => ({ projectId: project.id, type: "tts", status: "done" })) });
  const detail = await service.getProject(project.id);
  assert.equal(detail.batchJobs.some((job) => job.id === paused.id), true);
  assert.equal(detail.batchJobs.length, 21);
});
