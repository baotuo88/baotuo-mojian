const test = require("node:test");
const assert = require("node:assert/strict");
const { ChapterExecutionStageRunner } = require("../dist/services/novel/production/ChapterExecutionStageRunner.js");

function input(payload, advanceMode = "auto_to_execution") {
  return {
    novelId: "novel-e2e",
    stage: "chapter_execution",
    policy: { kickoffMode: "manual_start", advanceMode, reviewCheckpoints: [] },
    payload,
  };
}

test("auto-director chapter execution delegates single chapter work to the unified runtime", async () => {
  const calls = [];
  const runner = new ChapterExecutionStageRunner({
    getCore: () => ({
      findActivePipelineJobForRange: async () => null,
      resumePipelineJob: async () => {},
      createNovelSnapshot: async () => {},
      startPipelineJob: async () => ({ id: "unused" }),
    }),
    getCoordinator: () => ({
      createChapterStream: async (...args) => {
        calls.push(args);
        return { content: "Mock LLM chapter content", generationState: "approved" };
      },
    }),
  });

  const result = await runner.run(input({
    mode: "single_chapter_stream",
    chapterId: "chapter-e2e-1",
    includeRuntimePackage: true,
    options: { autoReview: true, autoRepair: true },
  }));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "novel-e2e",
    "chapter-e2e-1",
    { autoReview: true, autoRepair: true },
    { includeRuntimePackage: true },
  ]);
  assert.equal(result.status, "completed");
  assert.equal(result.nextStage, "quality_repair");
  assert.equal(result.payload.content, "Mock LLM chapter content");
});

test("auto-director starts a new pipeline only after creating a before-pipeline snapshot", async () => {
  const calls = [];
  const runner = new ChapterExecutionStageRunner({
    getCore: () => ({
      findActivePipelineJobForRange: async () => null,
      resumePipelineJob: async () => calls.push(["resume"]),
      createNovelSnapshot: async (...args) => calls.push(["snapshot", ...args]),
      startPipelineJob: async (...args) => {
        calls.push(["start", ...args]);
        return { id: "pipeline-new" };
      },
    }),
    getCoordinator: () => ({ createChapterStream: async () => ({}) }),
  });

  const result = await runner.run(input({
    mode: "pipeline_job",
    options: { startOrder: 2, endOrder: 3, runMode: "full_book_autopilot" },
  }));

  assert.equal(calls[0][0], "snapshot");
  assert.equal(calls[0][1], "novel-e2e");
  assert.equal(calls[0][2], "before_pipeline");
  assert.match(calls[0][3], /^before-pipeline-/);
  assert.deepEqual(calls[1], ["start", "novel-e2e", { startOrder: 2, endOrder: 3, runMode: "full_book_autopilot" }]);
  assert.equal(result.payload.id, "pipeline-new");
});

test("auto-director pipeline execution resumes an active job and never starts a duplicate job", async () => {
  const calls = [];
  const runner = new ChapterExecutionStageRunner({
    getCore: () => ({
      findActivePipelineJobForRange: async (...args) => {
        calls.push(["find", ...args]);
        return { id: "pipeline-existing", status: "running" };
      },
      resumePipelineJob: async (id) => calls.push(["resume", id]),
      createNovelSnapshot: async (...args) => calls.push(["snapshot", ...args]),
      startPipelineJob: async (...args) => {
        calls.push(["start", ...args]);
        return { id: "pipeline-new" };
      },
    }),
    getCoordinator: () => ({ createChapterStream: async () => ({}) }),
  });

  const result = await runner.run(input({
    mode: "pipeline_job",
    options: { startOrder: 1, endOrder: 1, runMode: "full_book_autopilot" },
  }));

  assert.deepEqual(calls, [
    ["find", "novel-e2e", 1, 1],
    ["resume", "pipeline-existing"],
  ]);
  assert.equal(result.payload.id, "pipeline-existing");
  assert.match(result.summary, /unified production orchestrator/);
});
