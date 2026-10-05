import test from "node:test";
import assert from "node:assert/strict";
import { buildNextStep } from "../../src/pages/drama/production/nextStep.ts";
import {
  batchCompletion, canRefreshVideoTask, currentVideoPrompts, hasEpisodeProduction, isBatchStoryboardCurrent,
  latestBatchJobs, latestEpisodeBatch, nextOutlineRange, parseBatchProgress, pollingVideoPrompts,
  shouldPollProduction, summarizeDramaStages,
} from "../../src/pages/drama/production/projection.ts";

function episode(order = 1) {
  return {
    id: `e${order}`, order, content: "台本", status: "approved",
    storyboards: [{ id: `b${order}`, version: 2, shots: [{ id: `s${order}`, order: 1 }] }],
  };
}
function prompt(overrides = {}) {
  return { id: "v1", episodeId: "e1", shotId: "s1", version: 2, status: "succeeded", providerTaskId: "p1", resultUrl: "https://example.com/video.mp4", ...overrides };
}
function project(overrides = {}) {
  return { id: "project", sourceBundle: {}, strategy: "{}", targetEpisodes: 1, episodes: [episode()], videoPrompts: [prompt()], ...overrides };
}
function job(overrides = {}) {
  return {
    id: "job", episodeId: "e1", type: "videos", status: "paused", createdAt: "2026-10-05T01:00:00Z",
    progress: JSON.stringify({ total: 3, done: 1, failed: 0, failedShotIds: [], completedShotIds: ["s1"], storyboardId: "b1", provider: "original-provider" }), ...overrides,
  };
}

for (const status of ["queued", "running", "failed", "submitting", "submission_unknown"]) {
  test(`${status} video remains in production instead of claiming export completion`, () => {
    const item = prompt({ status, providerTaskId: ["submitting", "submission_unknown"].includes(status) ? null : "p1", resultUrl: null });
    const step = buildNextStep(project({ videoPrompts: [item] }));
    assert.equal(step.kind, "videoStatus");
    assert.equal(step.episodeOrder, 1);
  });
}

test("a provider success without a usable video still directs users to the task", () => {
  assert.equal(buildNextStep(project({ videoPrompts: [prompt({ resultUrl: null })] })).kind, "videoStatus");
});

test("only complete current storyboard results lead to export", () => {
  const current = episode();
  current.storyboards.push({ id: "old-board", shots: [{ id: "old-shot" }] });
  const data = project({ episodes: [current], videoPrompts: [prompt({ id: "old-video", shotId: "old-shot", status: "failed" }), prompt()] });
  assert.equal(buildNextStep(data).kind, "export");
  assert.deepEqual(currentVideoPrompts(data).map((item) => item.id), ["v1"]);
});

test("prompt versions are selected by revision rather than response array position", () => {
  const data = project({ videoPrompts: [prompt({ id: "old", version: 1, status: "running" }), prompt()] });
  assert.deepEqual(currentVideoPrompts(data).map((item) => item.id), ["v1"]);
  assert.deepEqual(pollingVideoPrompts(data), []);
});

test("paused tasks without failed IDs remain recoverable after a page reload", () => {
  const data = JSON.parse(JSON.stringify(project({ batchJobs: [job()] })));
  assert.equal(buildNextStep(data).kind, "production");
  assert.equal(hasEpisodeProduction(data.batchJobs, data.episodes[0], "videos"), true);
  assert.deepEqual(parseBatchProgress(data.batchJobs[0].progress).completedShotIds, ["s1"]);
  assert.equal(parseBatchProgress(data.batchJobs[0].progress).provider, "original-provider");
});

test("a task for an older storyboard cannot be resumed or block new production", () => {
  const old = job({ progress: JSON.stringify({ storyboardId: "old-board" }) });
  assert.equal(isBatchStoryboardCurrent(old, episode()), false);
  assert.equal(hasEpisodeProduction([old], episode(), "videos"), false);
  assert.equal(buildNextStep(project({ batchJobs: [old] })).kind, "export");
});

test("live older tasks still block duplicate production even if a newer record exists", () => {
  const active = job({ id: "active", status: "running", createdAt: "2026-10-04" });
  const finished = job({ id: "finished", status: "done", createdAt: "2026-10-05" });
  assert.equal(hasEpisodeProduction([active, finished], episode(), "videos"), true);
  assert.equal(latestEpisodeBatch([active, finished], "e1", "videos").id, "finished");
});

test("an older paused task keeps its recovery entry when later jobs exist", () => {
  const interrupted = job({ id: "interrupted", createdAt: "2026-10-04" });
  const finished = job({ id: "finished", status: "done", createdAt: "2026-10-05" });
  assert.deepEqual(latestBatchJobs([interrupted, finished]).map((item) => item.id), ["finished", "interrupted"]);
  assert.equal(buildNextStep(project({ batchJobs: [interrupted, finished] })).kind, "production");
});

test("project polling observes in-flight submissions without refreshing an unknown provider task", () => {
  assert.equal(shouldPollProduction(project({ batchJobs: [job({ status: "running" })] })), true);
  assert.equal(shouldPollProduction(project({ videoPrompts: [prompt({ status: "queued" })] })), true);
  const submitting = project({ videoPrompts: [prompt({ status: "submitting", providerTaskId: null })] });
  assert.equal(shouldPollProduction(submitting), true);
  assert.deepEqual(pollingVideoPrompts(submitting), []);
  for (const status of ["failed", "submission_unknown", "succeeded"]) {
    const data = project({ batchJobs: [job()], videoPrompts: [prompt({ status })] });
    assert.equal(shouldPollProduction(data), false);
    assert.deepEqual(pollingVideoPrompts(data), []);
  }
});

test("manual refresh cannot replace an uncertain resubmission with the old provider task result", () => {
  for (const status of ["submitting", "submission_unknown"]) {
    assert.equal(canRefreshVideoTask(prompt({ status, providerTaskId: "old-failed-task" })), false);
  }
  assert.equal(canRefreshVideoTask(prompt({ status: "running", providerTaskId: null })), false);
  for (const status of ["queued", "running", "failed", "succeeded"]) {
    assert.equal(canRefreshVideoTask(prompt({ status })), true);
  }
});

test("an 80 episode project with 12 completed episodes continues from episode 13", () => {
  const episodes = Array.from({ length: 12 }, (_, index) => episode(index + 1));
  const videoPrompts = episodes.map((item) => prompt({ id: `v${item.order}`, episodeId: item.id, shotId: `s${item.order}` }));
  const data = project({ targetEpisodes: 80, episodes, videoPrompts });
  const step = buildNextStep(data);
  assert.equal(step.kind, "outline");
  assert.deepEqual(step.outlineRange, { startOrder: 13, count: 12 });
  assert.deepEqual(summarizeDramaStages(data), { outlined: 12, scripted: 12, reviewed: 12 });
});

test("outline continuation fills only the first gap and respects target end", () => {
  assert.deepEqual(nextOutlineRange({ targetEpisodes: 5, episodes: [episode(1), episode(4)] }), { startOrder: 2, count: 2 });
  assert.deepEqual(nextOutlineRange({ targetEpisodes: 2, episodes: [] }), { startOrder: 1, count: 2 });
  assert.equal(nextOutlineRange({ targetEpisodes: 1, episodes: [episode()] }), undefined);
});

test("a missing provider leads to setup instead of a mock generation task", () => {
  const step = buildNextStep(project({ videoPrompts: [prompt({ status: "draft", providerTaskId: null, resultUrl: null })] }), false);
  assert.equal(step.kind, "settings");
});

test("one completed episode does not mark the target project stages complete", () => {
  assert.deepEqual(summarizeDramaStages(project({ targetEpisodes: 80 })), { outlined: 1, scripted: 1, reviewed: 1 });
});

test("processed progress counts completed and failed items, with reuse included in completed", () => {
  const result = batchCompletion(job({ status: "failed", progress: JSON.stringify({ total: 4, done: 3, failed: 1, skipped: 2 }) }));
  assert.deepEqual(result, { total: 4, done: 3, processed: 4, percent: 100 });
});

test("reusing a shot cannot advance unfinished production progress twice", () => {
  const result = batchCompletion(job({ status: "running", progress: JSON.stringify({ total: 3, done: 1, failed: 0, skipped: 1 }) }));
  assert.deepEqual(result, { total: 3, done: 1, processed: 1, percent: 33 });
});
