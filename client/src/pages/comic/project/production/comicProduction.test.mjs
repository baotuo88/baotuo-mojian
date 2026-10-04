import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { batchPercent, parseBatchProgress, remainingBatchPanels, selectEpisodeBatchJob } from "./batchProjection.ts";
import { resolveProductionStep } from "./productionGuide.ts";
import { missingPanelOrders, parseExportArtifacts } from "../export/exportProjection.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const makeJob = (id, episodeId, status = "partial", date = "2026-10-04T00:00:00Z") => ({
  id, projectId: "project", type: "episode_image_batch", status, createdAt: date,
  progress: JSON.stringify({ version: 1, episodeId, provider: "configured-provider", concurrency: 3, targetPanelIds: ["p1", "p2", "p3"], completedPanelIds: ["p1"], total: 3, done: 1, failed: 2, failedPanelIds: ["p2", "p3"], status }),
});

function componentHarness(filename, api, initialQueries, confirm = () => false) {
  let position = 0;
  const cells = [];
  const queries = new Map();
  const invalidated = [];
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useRef: (value) => { const index = position++; return cells[index] ??= { current: value }; },
      useState: (value) => {
        const index = position++;
        if (!(index in cells)) cells[index] = typeof value === "function" ? value() : value;
        return [cells[index], (next) => { cells[index] = typeof next === "function" ? next(cells[index]) : next; }];
      },
      useEffect() {},
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@tanstack/react-query": {
      useQuery: (options) => {
        queries.set(options.queryKey.join("/"), options);
        const data = options.queryKey[0] === "settings"
          ? { data: ["selected-provider", "configured-provider", "provider", "different-current-provider", "new-selection-after-confirmation-opened"].map((provider) => ({ provider, currentImageModel: "gpt-image-2" })) }
          : initialQueries(options.queryKey);
        return { isSuccess: true, isPending: false, isError: false, data, refetch: async () => {} };
      },
      useQueryClient: () => ({ invalidateQueries: async (filter) => invalidated.push(filter.queryKey.join("/")) }),
      useMutation: (options) => {
        const run = async (input) => {
          await options.onMutate?.(input);
          try { const result = await options.mutationFn(input); await options.onSuccess?.(result); return result; }
          catch (error) { await options.onError?.(error); throw error; }
          finally { await options.onSettled?.(); }
        };
        return { isPending: false, mutateAsync: run, mutate: (input) => { void run(input).catch(() => {}); } };
      },
    },
    "lucide-react": {},
    "@/api/comic": api,
    "@/api/settings": { getAPIKeySettings: async () => ({ data: [] }) },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/badge": { Badge: "badge" },
    "@/components/ui/card": { Card: "card", CardContent: "card-content", CardHeader: "card-header", CardTitle: "card-title" },
    "@/components/ui/dialog": { Dialog: "dialog", AppDialogContent: "dialog-content" },
    "@/components/ui/toast": { toast: { error() {}, success() {} } },
    "@/components/common/SelectControl": { default: "select" },
    "./batchProjection": { batchPercent, parseBatchProgress, remainingBatchPanels, selectEpisodeBatchJob },
    "./exportProjection": { missingPanelOrders, parseExportArtifacts },
    "./productionGuide": { resolveProductionStep, hasReadyCharacterSheet: () => true },
  };
  const sandbox = { exports: {}, window: { confirm }, require: (name) => {
    assert.ok(name in modules, `Unmocked dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, sandbox);
  return { queries, invalidated, render(name, props) { position = 0; return sandbox.exports[name](props); } };
}

function nodes(tree) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];
}
function textContent(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  return textContent(tree.props?.children);
}
function button(tree, text) {
  const result = nodes(tree).find((node) => node.type === "button" && textContent(node).includes(text));
  assert.ok(result, `Missing button: ${text}`);
  return result;
}

test("persisted jobs are restored only for their own episode, never by project alone", () => {
  const a = makeJob("a-running", "A", "running");
  const b = makeJob("b-complete", "B", "completed", "2026-10-04T01:00:00Z");
  const old = makeJob("b-old", "B", "partial");
  const legacy = makeJob("legacy", undefined, "running");
  assert.equal(selectEpisodeBatchJob([a, old, legacy, b], "B"), b);
  assert.equal(selectEpisodeBatchJob([a, old, legacy, b], "A"), a);
  assert.equal(selectEpisodeBatchJob([a, legacy], "C"), null);
});

test("invalid progress does not crash the workspace or become another episode's recovery", () => {
  assert.equal(parseBatchProgress("{"), null);
  assert.equal(parseBatchProgress(JSON.stringify({ total: 1, done: 0, failed: 1, status: "partial", failedPanelIds: [null] })), null);
  const valid = JSON.parse(makeJob("job", "A").progress);
  assert.equal(parseBatchProgress(JSON.stringify({ ...valid, provider: {} })), null);
  assert.equal(parseBatchProgress(JSON.stringify({ ...valid, errors: { p2: {} } })), null);
  assert.equal(batchPercent({ ...valid, done: 12 }), 100);
  assert.equal(remainingBatchPanels(valid), 2);
});

test("batch creation waits for confirmation and ignores duplicate confirms before rerender", async () => {
  const starts = [];
  let finish;
  const harness = componentHarness("./BatchBar.tsx", {
    startEpisodeBatch: (episodeId, payload) => { starts.push({ episodeId, payload }); return new Promise((resolve) => { finish = resolve; }); },
  }, (key) => key[1] === "batch-jobs" ? [] : { pendingPanels: 3, totalPanels: 3, imageModel: "gpt-image-2", scopeFingerprint: "confirmed-scope", estimatedCentsCost: null, providerNote: "费用未知" });
  const props = { projectId: "project", episodeId: "A", provider: "selected-provider" };
  let tree = harness.render("BatchBar", props);
  button(tree, "生成未完成").props.onClick();
  assert.equal(starts.length, 0);
  tree = harness.render("BatchBar", { ...props, provider: "new-selection-after-confirmation-opened" });
  const confirm = button(tree, "确认并开始");
  assert.equal(confirm.props.disabled, false);
  assert.ok(textContent(tree).includes("gpt-image-2"));
  confirm.props.onClick();
  confirm.props.onClick();
  await Promise.resolve();
  assert.equal(starts.length, 1);
  assert.equal(starts[0].episodeId, "A");
  assert.equal(starts[0].payload.provider, "selected-provider");
  assert.equal(starts[0].payload.skipDone, true);
  assert.equal(starts[0].payload.expectedScopeFingerprint, "confirmed-scope");
  finish({ jobId: "accepted" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(harness.invalidated.includes("comic/batch-jobs/project"));
  assert.ok(harness.invalidated.includes("comic/panels/A"));
});

for (const interruptedStatus of ["interrupted", "cancelled"]) test(`${interruptedStatus} recovery keeps the persisted provider and same-job polling resumes`, async () => {
  const retries = [];
  const job = makeJob("same-job", "A", interruptedStatus);
  const harness = componentHarness("./BatchBar.tsx", {
    retryBatchJob: async (...args) => { retries.push(args); return { jobId: "same-job" }; },
  }, (key) => key[1] === "batch-jobs" ? [job] : { pendingPanels: 2, estimatedCentsCost: null });
  const props = { projectId: "project", episodeId: "A", provider: "different-current-provider" };
  let tree = harness.render("BatchBar", props);
  button(tree, "继续未完成").props.onClick();
  tree = harness.render("BatchBar", props);
  assert.ok(textContent(tree).includes("configured-provider"));
  button(tree, "确认并开始").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(retries, [["same-job"]]);
  const query = harness.queries.get("comic/batch-jobs/project");
  assert.equal(query.refetchInterval({ state: { data: [makeJob("same-job", "A", "running")] } }), 2500);
  assert.equal(query.refetchInterval({ state: { data: [job] } }), false);
});

test("a restored running batch disables creation immediately", () => {
  const harness = componentHarness("./BatchBar.tsx", {}, (key) => key[1] === "batch-jobs" ? [makeJob("active", "A", "running")] : { pendingPanels: 2 });
  const tree = harness.render("BatchBar", { projectId: "project", episodeId: "A", provider: "provider" });
  assert.equal(button(tree, "正在生成本话").props.disabled, true);
  assert.ok(button(tree, "停止后续生成"));
});

test("unrecoverable and outdated batches never block a newly confirmed generation", () => {
  const job = makeJob("old-job", "A", "interrupted");
  job.progress = JSON.stringify({ ...JSON.parse(job.progress), recoverable: false });
  const harness = componentHarness("./BatchBar.tsx", {}, (key) => key[1] === "batch-jobs" ? [job] : { pendingPanels: 2 });
  const tree = harness.render("BatchBar", { projectId: "project", episodeId: "A", provider: "provider" });
  assert.equal(button(tree, "生成未完成").props.disabled, false);
  assert.equal(nodes(tree).some((node) => node.type === "button" && textContent(node).includes("继续未完成图片")), false);
  const partial = makeJob("changed-script", "A", "partial");
  const partialHarness = componentHarness("./BatchBar.tsx", {}, (key) => key[1] === "batch-jobs" ? [partial] : { pendingPanels: 2 });
  assert.equal(button(partialHarness.render("BatchBar", { projectId: "project", episodeId: "A", provider: "provider" }), "生成未完成").props.disabled, false);
});

test("first-episode guidance uses saved artifacts and does not ask to overwrite existing panels", () => {
  const base = { hasSource: true, episodes: [{ id: "ep", order: 1, _count: { panels: 0 } }], characters: [], panels: [] };
  assert.equal(resolveProductionStep({ ...base, hasSource: false }), "import");
  assert.equal(resolveProductionStep({ ...base, episodes: [] }), "outline");
  assert.equal(resolveProductionStep(base), "script");
  assert.equal(resolveProductionStep({ ...base, panels: [{ id: "p", imageData: null }] }), "panels");
  assert.equal(resolveProductionStep({ ...base, panels: [{ id: "p", imageData: '{"status":"done"}' }] }), "export");
});

test("failed redraws retain usable images for the guide and complete export", () => {
  const panels = [{ id: "p", order: 1, imageData: JSON.stringify({ status: "error", previousImage: { status: "done", revision: "confirmed" } }) }];
  assert.deepEqual(missingPanelOrders(panels), []);
  assert.equal(resolveProductionStep({ hasSource: true, episodes: [{ id: "ep", order: 1 }], characters: [], panels }), "export");
  assert.deepEqual(missingPanelOrders([{ ...panels[0], imageData: null }]), [1]);
});

test("replacing a storyboard requires confirmation and sends explicit replacement authorization", async () => {
  for (const approved of [false, true]) {
    const generated = []; let confirmations = 0;
    const episode = { id: "ep", order: 3, _count: { panels: 20 } };
    const harness = componentHarness("../EpisodeListPanel.tsx", {
      generateComicPanelScript: async (id, payload) => { generated.push({ id, payload }); return episode; },
    }, () => [episode], () => { confirmations++; return approved; });
    const tree = harness.render("EpisodeListPanel", { projectId: "project", project: { characters: [], sourceBundle: {} } });
    const card = nodes(tree).find(node => node.props?.ep?.id === "ep");
    assert.ok(card); card.props.onGenerateScript(episode);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(confirmations, 1); assert.equal(generated.length, approved ? 1 : 0);
    if (approved) assert.equal(generated[0].payload.replaceExisting, true);
    assert.ok(textContent(button(tree, "话大纲")).includes("第 4-15 话"));
  }
});

test("a stale first-episode guide rechecks the source before an import can replace it", async () => {
  let imports = 0;
  const harness = componentHarness("./FirstEpisodeGuide.tsx", {
    getComicProject: async () => ({ id: "project", sourceBundle: { id: "preserved" }, episodes: [] }),
    importComicSourceBundle: async () => { imports++; },
  }, () => []);
  const tree = harness.render("FirstEpisodeGuide", { project: { id: "project", sourceBundle: null, characters: [] }, episodes: [], onNavigate() {} });
  button(tree, "导入故事资料").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(imports, 0);
  assert.ok(harness.invalidated.includes("comic/project/project"));
});

test("a stale first-episode guide never regenerates a newly saved storyboard", async () => {
  let generations = 0;
  const harness = componentHarness("./FirstEpisodeGuide.tsx", {
    getComicProject: async () => ({ id: "project", sourceBundle: { id: "bundle" }, episodes: [{ id: "A" }] }),
    listComicPanels: async () => [{ id: "kept-panel", imageData: '{"status":"done"}' }],
    generateComicPanelScript: async () => { generations++; },
  }, () => []);
  const tree = harness.render("FirstEpisodeGuide", { project: { id: "project", sourceBundle: { id: "bundle" }, characters: [] }, episodes: [{ id: "A", order: 1, _count: { panels: 0 } }], onNavigate() {} });
  button(tree, "AI 生成第一话分镜").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(generations, 0);
});

test("export blocks incomplete episodes and preserves every downloadable slice", () => {
  const panels = [{ order: 2, imageData: '{"status":"error"}' }, { order: 1, imageData: '{"status":"done"}' }, { order: 3, imageData: "bad" }];
  assert.deepEqual(missingPanelOrders(panels), [2, 3]);
  const artifacts = [1, 2, 3].map((index) => ({ index, url: `/api/comic/export-jobs/job/artifacts/${index}.png` }));
  assert.deepEqual(parseExportArtifacts(JSON.stringify(artifacts)), artifacts);
  assert.deepEqual(parseExportArtifacts('{"error":"missing images"}'), []);
  assert.deepEqual(parseExportArtifacts('[{"url":"javascript:alert(1)"}]'), []);
  const harness = componentHarness("../export/ExportPanel.tsx", {}, (key) => key[1] === "panels" ? panels : [{ id: "job", episodeId: "A", format: "sliced", status: "done", createdAt: "2026-10-04T00:00:00Z", artifacts: JSON.stringify(artifacts) }]);
  const tree = harness.render("ExportPanel", { projectId: "project", episodes: [{ id: "A", order: 1 }], onShowPanels() {} });
  assert.equal(button(tree, "生成下载图片").props.disabled, true);
  assert.equal(nodes(tree).filter((node) => node.type === "a").length, 3);
});
