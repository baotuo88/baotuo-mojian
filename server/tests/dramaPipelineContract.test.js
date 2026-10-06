const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
require("./fixtures/dramaTestDatabase.cjs")();
const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "drama-pipeline-media-"));
let imageInput;
const promptRunnerPath = require.resolve("../dist/prompting/core/promptRunner.js");
require.cache[promptRunnerPath] = { id: promptRunnerPath, filename: promptRunnerPath, loaded: true, exports: {
      runStructuredPrompt: async ({ asset }) => {
        if (asset.id === "drama.episode.script") {
          return {
            output: {
              content: "【场景】公司大厅\n林澈被拦下。\n林澈：让董事长下来见我。",
              durationSec: 72,
              sceneCount: 2,
              opening3s: "主角被保安拦下并被嘲讽",
              endingCliffhanger: "董事长称他为少爷",
              newlyIntroducedFacts: [{ text: "董事长认识林澈", category: "revealed" }],
              episodeSummary: "林澈隐藏身份进入公司，被羞辱后身份露出端倪。",
            },
          };
        }
        if (asset.id === "drama.episode.quality") {
          return {
            output: {
              status: "repairable",
              score: { hook: 82, density: 76, paywall: 70, emotion: 78, duration: 80, consistency: 88, overall: 79 },
              flags: [{
                severity: "medium",
                code: "weak_payoff",
                evidence: "结尾身份提示还不够强。",
                suggestion: "增强董事长出场反应。",
              }],
              repairPlan: { mode: "patch", instruction: "强化结尾打脸和董事长称呼。" },
            },
          };
        }
        if (asset.id === "drama.episode.compliance") {
          return {
            output: {
              level: "pass",
              items: [],
            },
          };
        }
        if (asset.id === "drama.episode.repair") {
          return {
            output: {
              content: "【场景】公司大厅\n林澈：让董事长下来。\n董事长冲出电梯：少爷，您终于来了。",
              durationSec: 68,
              sceneCount: 2,
              opening3s: "保安当众羞辱林澈",
              endingCliffhanger: "董事长跪迎少爷",
              newlyIntroducedFacts: [],
              episodeSummary: "林澈被羞辱后，董事长公开确认他的身份。",
            },
          };
        }
        if (asset.id === "drama.storyboard") {
          return {
            output: {
              summary: "大厅羞辱到董事长反转的竖屏镜头。",
              shots: [{
                order: 1,
                shotSize: "中近景",
                cameraMove: "轻微推进",
                durationSec: 5,
                location: "公司大厅",
                action: "林澈被保安拦住，周围员工围观。",
                dialogue: "林澈：让董事长下来。",
                characterRefs: ["林澈"],
                visualPrompt: "黑色西装青年在现代公司大厅被拦住。",
              }],
            },
          };
        }
        if (asset.id === "drama.video.prompt") {
          return {
            output: {
              prompt: "9:16 vertical drama, modern company lobby, restrained young man in black suit being blocked by security, tense close shot",
              negativePrompt: "low quality, blurry, extra fingers",
              aspectRatio: "9:16",
              durationSec: 5,
            },
          };
        }
        throw new Error(`Unexpected prompt asset: ${asset.id}`);
      },
    },
  };

const imageProviderPath = require.resolve("../dist/services/image/provider.js");
require.cache[imageProviderPath] = { id: imageProviderPath, filename: imageProviderPath, loaded: true, exports: {
  generateImagesByProvider: async (input) => {
    imageInput = input;
    return { provider: input.provider, model: input.model, images: [{ url: "data:image/png;base64,iVBORw0KGgo=" }] };
  },
  isImageProviderSupported: () => true,
  resolveImageModel: async () => "gpt-image-test",
} };
const appPathsPath = require.resolve("../dist/runtime/appPaths.js");
const realAppPaths = require(appPathsPath);
require.cache[appPathsPath] = { id: appPathsPath, filename: appPathsPath, loaded: true, exports: {
  ...realAppPaths, resolveGeneratedImagesRoot: () => mediaRoot,
} };
const { prisma } = require("../dist/db/prisma.js");
test.after(() => prisma.$disconnect());

test("drama production runs through script, review, repair, storyboard, media and export with real persistence", async () => {
  process.env.DRAMA_COST_CURRENCY = "CNY";
  process.env.DRAMA_IMAGE_COST_PER_IMAGE_OPENAI = "1.25";
  process.env.DRAMA_VIDEO_MOCK_COST_PER_SECOND = "0.4";
  process.env.DRAMA_TTS_MOCK_COST_PER_SECOND = "0.2";
  await prisma.dramaProject.create({ data: { id: "project_1", title: "逆袭短剧", track: "hidden_identity", targetEpisodes: 12,
    strategy: JSON.stringify({ mainPleasureLine: "身份揭露" }),
    episodes: { create: { id: "episode_1", order: 1, title: "身份反转" } },
    characters: { create: { id: "character_1", name: "林澈", persona: "克制", voiceProfile: JSON.stringify({ voiceId: "lin-voice" }) } },
    facts: { create: { episodeOrder: 0, text: "主角真实身份是集团继承人", category: "revealed", source: "auto" } },
  } });
  const { DramaScriptService } = require("../dist/services/drama/DramaScriptService.js");
  const { DramaQualityGate } = require("../dist/services/drama/DramaQualityGate.js");
  const { DramaRepairService } = require("../dist/services/drama/DramaRepairService.js");
  const { DramaStoryboardService } = require("../dist/services/drama/DramaStoryboardService.js");
  const { DramaBatchOrchestrator } = require("../dist/services/drama/production/DramaBatchOrchestrator.js");
  const episode = () => prisma.dramaEpisode.findUniqueOrThrow({ where: { id: "episode_1" } });
  await new DramaScriptService().generateEpisodeScript("project_1", 1);
  assert.equal((await episode()).revision, 1);
  assert.equal((await episode()).status, "scripted");
  assert.equal(await prisma.dramaFact.count({ where: { source: "script", stale: false } }), 1);
  const quality = await new DramaQualityGate().reviewEpisode("project_1", 1);
  assert.equal(quality.status, "repairable");
  assert.equal((await episode()).status, "needs_repair");
  await new DramaRepairService().repairEpisode("project_1", 1);
  assert.equal((await episode()).revision, 2);
  assert.equal((await episode()).qualityFlags, null);
  const board = await new DramaStoryboardService().generateStoryboard("project_1", 1);
  assert.equal(board.sourceRevision, 2);
  assert.equal(board.shots.length, 1);
  const shotId = board.shots[0].id;
  const batches = new DramaBatchOrchestrator();
  for (const [type, provider, expectedCost] of [["keyframes", "openai", 1.25], ["videos", "mock", 2], ["tts", "mock", 0.4]]) {
    const job = await batches.createEpisodeBatchJob("project_1", 1, { type, provider }, { autoStart: false });
    const done = await batches.runBatchJob(job.id);
    assert.equal(done.status, "done", done.error);
    const progress = JSON.parse(done.progress);
    assert.equal(progress.done, 1);
    assert.equal(progress.cost.actual, expectedCost);
  }
  assert.equal(imageInput.size, "1024x1536");
  const shot = await prisma.dramaShot.findUniqueOrThrow({ where: { id: shotId } });
  const audio = JSON.parse(shot.dialogueAudioData);
  assert.equal(audio.items[0].voiceId, "lin-voice");
  assert.equal(audio.items[0].durationSec, 2);
  const { DramaExportService } = require("../dist/services/drama/DramaExportService.js");
  const exports = new DramaExportService();
  const srt = await exports.exportEpisode("project_1", 1, "srt");
  assert.match(srt.body, /00:00:00,000 --> 00:00:02,000/);
  assert.match(srt.body, /林澈：让董事长下来。/);
  const timeline = JSON.parse((await exports.exportEpisode("project_1", 1, "timeline-json")).body);
  assert.equal(timeline.storyboardId, board.id);
  assert.equal(timeline.sourceRevision, 2);
  assert.equal(timeline.tracks.video[0].status, "queued");
  assert.equal(timeline.tracks.video[0].sourceUrl, null);
  assert.equal(timeline.tracks.audio[0].voiceId, "lin-voice");
  const { DramaVideoPromptService } = require("../dist/services/drama/DramaVideoPromptService.js");
  const video = new DramaVideoPromptService();
  await assert.rejects(video.generateVideoPromptForShot("project_1", shotId), /尚未结束/);
  const prompt = await prisma.dramaVideoPrompt.findFirstOrThrow({ where: { shotId } });
  await prisma.dramaVideoPrompt.update({ where: { id: prompt.id }, data: { status: "succeeded", resultUrl: "https://example.test/video.mp4" } });
  const next = await video.generateVideoPromptForShot("project_1", shotId);
  assert.equal(next.version, 2);
  await assert.rejects(video.createProviderTask(prompt.id, "mock"), /已有新版/);
  const { DramaShotKeyframeService } = require("../dist/services/drama/visual/DramaShotKeyframeService.js");
  const images = new DramaShotKeyframeService();
  const regenerated = await images.generateKeyframe(shotId, "openai");
  assert.equal(regenerated.version, 2);
  assert.equal(regenerated.history[0].version, 1);
  assert.ok(await images.resolveArchivedKeyframePath(shotId, 1));
});
