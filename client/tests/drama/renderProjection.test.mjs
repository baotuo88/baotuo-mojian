import test from "node:test";
import assert from "node:assert/strict";
import { isActiveRender, isCurrentRender, renderProgress, renderReadiness, renderStatusLabel } from "../../src/pages/drama/render/projection.ts";

function data() {
  const episode = { id: "e", revision: 2, storyboards: [{ id: "b", version: 1, sourceRevision: 2, status: "ready", shots: [{ id: "s1", order: 1 }, { id: "s2", order: 2 }] }] };
  const project = { episodes: [episode], videoPrompts: ["s1", "s2"].map((shotId) => ({ id: shotId, shotId, status: "succeeded", resultUrl: `https://example.com/${shotId}.mp4` })) };
  return { episode, project };
}

test("renders need all current video results; provider success alone is insufficient", () => {
  const { episode, project } = data();
  assert.equal(renderReadiness(project, episode).ready, true);
  project.videoPrompts[1].resultUrl = null;
  assert.deepEqual(renderReadiness(project, episode), { ready: false, total: 2, missingShotOrders: [2] });
});

test("previous script videos cannot enable rendering a new revision", () => {
  const { episode, project } = data();
  episode.revision++;
  assert.deepEqual(renderReadiness(project, episode), { ready: false, total: 0, missingShotOrders: [] });
});

test("render results are historical when either script revision or storyboard changes", () => {
  const { episode } = data();
  const job = { episodeId: "e", sourceRevision: 2, storyboardId: "b" };
  assert.equal(isCurrentRender(job, episode), true);
  assert.equal(isCurrentRender({ ...job, sourceRevision: 1 }, episode), false);
  assert.equal(isCurrentRender({ ...job, storyboardId: "old" }, episode), false);
  assert.equal(isCurrentRender({ ...job, isCurrent: false }, episode), false);
});

test("completion without a file is not shown as downloadable; progress is bounded", () => {
  assert.equal(renderProgress({ status: "running", progress: 100 }), 99);
  assert.equal(renderProgress({ status: "running", progress: -5 }), 0);
  assert.equal(renderProgress({ status: "running", progress: NaN }), 0);
  assert.equal(renderProgress({ status: "succeeded", progress: 100, resultUrl: "/api/media/assets/video/a.mp4" }), 100);
  assert.equal(renderStatusLabel({ status: "succeeded" }), "成片链接缺失");
});

test("queued and running renders keep polling; interrupted and complete jobs stop", () => {
  for (const status of ["queued", "running"]) assert.equal(isActiveRender({ status }), true);
  for (const status of ["succeeded", "failed", "cancelled"]) assert.equal(isActiveRender({ status }), false);
});
