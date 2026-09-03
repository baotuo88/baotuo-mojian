const test = require("node:test");
const assert = require("node:assert/strict");

const {
  renderVolumeOutcomeSummary,
} = require("../dist/services/novel/runtime/context/bookAndVolumeRewardContext.js");

const {
  buildVolumeWindowContext,
} = require("../dist/prompting/prompts/novel/chapterLayeredContext.js");

const {
  volumeOutcomeSummaryOutputSchema,
} = require("../dist/prompting/prompts/novel/volume/volumeOutcomeSummary.prompts.js");

test("renderVolumeOutcomeSummary 把 JSON 结果摘要渲染为可承接文本", () => {
  const json = JSON.stringify({
    narrativeProgress: "主角夺回据点，站稳脚跟。",
    characterStateChanges: ["主角升至队长", "女二从利用转向信任"],
    unresolvedThreads: ["幕后黑手尚未现身"],
    irreversibleFacts: ["旧据点已被焚毁"],
    continuityMusts: ["下一卷开篇承接信任关系"],
  });
  const text = renderVolumeOutcomeSummary(json);
  assert.ok(text.includes("主角夺回据点"), "应包含叙事进展");
  assert.ok(text.includes("角色变化："), "应包含角色变化分组标题");
  assert.ok(text.includes("未解线索："), "应包含未解线索分组标题");
  assert.ok(text.includes("不可逆事实："), "应包含不可逆事实分组标题");
  assert.ok(text.includes("续写要点："), "应包含续写要点分组标题");
});

test("renderVolumeOutcomeSummary 对空/非法 JSON 返回空串", () => {
  assert.equal(renderVolumeOutcomeSummary(null), "");
  assert.equal(renderVolumeOutcomeSummary(""), "");
  assert.equal(renderVolumeOutcomeSummary("{broken json"), "");
});

test("renderVolumeOutcomeSummary 空数组分组不会渲染空标题", () => {
  const text = renderVolumeOutcomeSummary(JSON.stringify({
    narrativeProgress: "事件推进。",
    characterStateChanges: [],
    unresolvedThreads: [],
    irreversibleFacts: [],
    continuityMusts: [],
  }));
  assert.ok(text.includes("事件推进。"), "应保留叙事进展");
  assert.ok(!text.includes("角色变化："), "空数组不渲染分组标题");
  assert.ok(!text.includes("续写要点："), "空数组不渲染分组标题");
});

test("buildVolumeWindowContext 把上一卷结果摘要注入 previousVolumeOutcome", () => {
  const rendered = "主角夺回据点。\n未解线索：\n- 幕后黑手未现身";
  const volume = buildVolumeWindowContext({
    currentVolume: {
      id: "volume-2",
      sortOrder: 2,
      title: "第二卷",
      mainPromise: "继续推进",
    },
    previousVolume: {
      title: "第一卷",
      summary: "第一卷计划摘要",
      completedSummary: rendered,
    },
  });
  assert.equal(volume.previousVolumeOutcome, rendered, "上一卷结果摘要应原样透传");
});

test("buildVolumeWindowContext 无上一卷结果摘要时返回空串", () => {
  const volume = buildVolumeWindowContext({
    currentVolume: { id: "volume-1", sortOrder: 1, title: "第一卷" },
    previousVolume: null,
  });
  assert.equal(volume.previousVolumeOutcome, "", "无上一卷时结果摘要为空");
});

test("volumeOutcomeSummaryOutputSchema 校验并默认空数组", () => {
  const parsed = volumeOutcomeSummaryOutputSchema.parse({ narrativeProgress: "进展" });
  assert.equal(parsed.narrativeProgress, "进展");
  assert.deepEqual(parsed.characterStateChanges, []);
  assert.deepEqual(parsed.unresolvedThreads, []);
  assert.deepEqual(parsed.irreversibleFacts, []);
  assert.deepEqual(parsed.continuityMusts, []);
});