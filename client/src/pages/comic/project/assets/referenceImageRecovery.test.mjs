import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as characterData from "../characters/data.ts";
import * as exportProjection from "../export/exportProjection.ts";
import * as referenceProjection from "./referenceImageProjection.ts";
import { hasReadyCharacterSheet } from "../production/productionGuide.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function harness(file, name, { api = {}, queries = () => [], flowBusy = false, modules: extra = {} } = {}) {
  const started = []; const cells = []; let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useEffect() {}, useRef: value => ({ current: value }), useState(value) { const index = cursor++; if (!(index in cells)) cells[index] = typeof value === "function" ? value() : value; return [cells[index], next => { cells[index] = next; }]; } },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries: async () => {} }), useQuery: options => ({ data: queries(options.queryKey), isSuccess: true, isPending: false, isError: false }), useMutation(options) { const run = async input => { const result = await options.mutationFn(input); await options.onSuccess?.(result); await options.onSettled?.(result, null, input); return result; }; return { isPending: false, mutateAsync: run, mutate: input => void run(input) }; } },
    "lucide-react": {}, "@/api/comic": { characterSheetImageUrl: id => `/sheet/${id}`, characterExpressionImageUrl: id => `/expression/${id}`, characterAssetImageUrl: id => `/asset/${id}`, comicSceneImageUrl: id => `/scene/${id}`, ...api },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/badge": { Badge: "badge" },
    "@/components/ui/input": { Input: "input" }, "@/components/ui/textarea": { Textarea: "textarea" },
    "@/components/ui/card": { Card: "card", CardHeader: "header", CardTitle: "title", CardDescription: "description", CardContent: "content" },
    "@/components/ui/toast": { toast: { success() {}, error() {} } }, "@/components/common/SelectControl": { default: "select" },
    "@/components/image/ImageGenerationConfirmDialog": { ImageGenerationConfirmDialog: "confirm-dialog" },
    "@/components/image/useImageGenerationFlow": { useImageGenerationFlow: () => ({ dialogProps: { loading: false, submitting: flowBusy }, start: input => started.push(input) }) },
    "@/components/comic/GeneratedImageCard": { GeneratedImageCard: "image-card" },
    "./data": characterData, "./CharacterVisualEditor": {}, "./CharacterAssets": {},
    "../assets": referenceProjection, "./assets": referenceProjection,
    "./exportProjection": exportProjection,
    "react-router-dom": { Link: "link", useNavigate: () => () => {} },
    "@/api/novel": {}, "@/api/novel/core": {}, "./ComicImageGenerationNotice": {}, "@/pages/comic/ComicImageGenerationNotice": {},
    ...extra,
  };
  const sandbox = { exports: {}, require: id => { assert.ok(id in modules, `Unmocked dependency ${id}`); return modules[id]; } };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`${source}\nexports.testComponent = ${name};`, sandbox);
  return { started, render(props) { cursor = 0; return sandbox.exports.testComponent(props); } };
}
function nodes(tree) { return tree == null || typeof tree !== "object" ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)]; }
function text(tree) { return tree == null || typeof tree === "boolean" ? "" : typeof tree !== "object" ? String(tree) : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children); }
function button(tree, label) { const result = nodes(tree).find(node => node.type === "button" && text(node).includes(label)); assert.ok(result, `Missing button ${label}`); return result; }

test("restored character generation permits confirmation while keeping its previous sheet", () => {
  const h = harness("../characters/CharacterDetail.tsx", "CharacterDetail");
  const tree = h.render({ character: { id: "c", name: "主角", sheetData: JSON.stringify({ status: "generating", previousImage: { status: "done", version: 2, revision: "kept" } }) }, provider: "p" });
  assert.ok(nodes(tree).some(node => node.type === "img" && node.props.src.includes("/sheet/c")));
  const retry = button(tree, "重新生成"); assert.equal(retry.props.disabled, false); retry.props.onClick();
  assert.equal(h.started.length, 1); assert.equal(typeof h.started[0].generate, "function");
});

test("restored scene generation permits confirmation but an active local request stays locked", () => {
  for (const flowBusy of [false, true]) {
    const h = harness("../ScenesPanel.tsx", "SceneDetail", { flowBusy });
    const tree = h.render({ scene: { id: "s", name: "城门", sceneType: "exterior", sheetData: '{"status":"generating"}' }, projectId: "p", provider: "model", onChanged() {} });
    const retry = button(tree, "重新生成"); assert.equal(retry.props.disabled, flowBusy);
    if (!flowBusy) { retry.props.onClick(); assert.equal(h.started.length, 1); }
  }
});

test("failed reference replacement keeps the old asset visible and permits retry", () => {
  const h = harness("../characters/CharacterAssets.tsx", "AssetCard");
  const tree = h.render({ asset: { id: "a", name: "钥匙", assetType: "item", imageData: '{"status":"error","error":"provider unavailable","previousImage":{"status":"done","revision":"saved"}}' }, provider: "p", onDeleted() {}, onUpdated() {} });
  const card = nodes(tree).find(node => node.type === "image-card");
  assert.equal(card.props.status, "done"); assert.ok(card.props.imageUrl.includes("/asset/a")); assert.equal(card.props.busy, false);
  assert.ok(text(card.props.footer).includes("provider unavailable"));
});

test("failed export displays the saved reason and retries the recorded episode", async () => {
  const calls = [];
  const h = harness("../export/ExportPanel.tsx", "ExportPanel", { api: { exportComicEpisode: async (...args) => { calls.push(args); } }, queries: key => key[1] === "panels" ? [{ order: 1, imageData: '{"status":"done"}' }] : [{ id: "job", episodeId: "B", status: "error", format: "sliced", artifacts: '{"error":"导出中断，请重新导出"}', createdAt: "2026-10-04" }] });
  const tree = h.render({ projectId: "p", episodes: [{ id: "A", order: 1 }, { id: "B", order: 2 }], onShowPanels() {} });
  assert.ok(text(tree).includes("导出中断，请重新导出"));
  button(tree, "重新导出").props.onClick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[0][0], "B"); assert.equal(calls[0][1].format, "sliced");
});

test("original and text project cards offer story preparation", () => {
  for (const sourceType of ["original", "text_import"]) {
    const h = harness("../../ComicWorkspacePage.tsx", "ProjectCard"); let imports = 0;
    const tree = h.render({ project: { id: "p", title: "故事", sourceType, status: "draft", sourceBundle: null }, busyId: "", onImport() { imports += 1; } });
    button(tree, "整理故事资料").props.onClick(); assert.equal(imports, 1);
  }
});

test("only confirmed previous images satisfy first-episode guidance", () => {
  const { parseReferenceImage, confirmedReferenceImage } = referenceProjection;
  for (const raw of [null, "null", "{", '{"status":"generating","previousImage":{"status":"error"}}']) {
    assert.equal(confirmedReferenceImage(parseReferenceImage(raw)), null);
    assert.equal(hasReadyCharacterSheet({ sheetData: raw }), false);
  }
  assert.equal(hasReadyCharacterSheet({ sheetData: '{"status":"error","previousImage":{"status":"done","revision":"kept"}}' }), true);
});

test("a local expression request stays locked while its confirmed image remains visible", () => {
  const h = harness("../characters/CharacterDetail.tsx", "CharacterDetail", { flowBusy: true });
  const tree = h.render({ character: { id: "c", name: "主角", sheetData: JSON.stringify({ status: "done", assets: { expression: { status: "generating", previousImage: { status: "done", revision: "expression-kept" } } } }) }, provider: "p" });
  assert.equal(button(tree, "生成中").props.disabled, true);
  assert.ok(nodes(tree).some(node => node.type === "img" && node.props.src === "/expression/c?revision=expression-kept"));
});

test("a failed scene replacement retains the published scene image", () => {
  const h = harness("../ScenesPanel.tsx", "SceneDetail");
  const tree = h.render({ scene: { id: "s", name: "城门", sceneType: "exterior", sheetData: '{"status":"error","error":"生成服务暂不可用","previousImage":{"status":"done","revision":"scene-kept"}}' }, projectId: "p", provider: "model", onChanged() {} });
  assert.ok(nodes(tree).some(node => node.type === "img" && node.props.src === "/scene/s?revision=scene-kept"));
  assert.ok(text(tree).includes("生成服务暂不可用"));
  assert.equal(button(tree, "重新生成").props.disabled, false);
});
