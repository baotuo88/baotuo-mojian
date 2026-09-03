const test = require("node:test");
const assert = require("node:assert/strict");

const {
  selectHookContextWindow,
} = require("../dist/modules/timeline/timeline.repository.js");

function hook(overrides = {}) {
  return {
    id: "h",
    novelId: "novel-1",
    createdInChapterId: "c",
    createdInChapterIndex: 10,
    expectedResolveByChapterIndex: null,
    resolveMode: "long_arc",
    blocking: false,
    resolvedInChapterId: null,
    resolvedInChapterIndex: null,
    title: "钩子",
    description: "",
    status: "open",
    priority: "medium",
    relatedEventIds: [],
    participantIds: [],
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

test("selectHookContextWindow 保留最新 open 钩子而非最旧（弃旧保新）", () => {
  const hooks = [];
  // 生成 20 个 open 钩子，章节号越大越新
  for (let index = 1; index <= 20; index += 1) {
    hooks.push(hook({ id: `old-${index}`, createdInChapterIndex: index, title: `第${index}章钩子` }));
  }
  const selected = selectHookContextWindow(hooks);
  const openIds = selected.map((item) => item.id);
  assert.equal(openIds.length, 8, "open 窗口应截断到 8 条");
  // 最新钩子（章节 20）必须保留，最旧钩子（章节 1）必须被丢弃
  assert.ok(openIds.includes("old-20"), "最新钩子必须保留");
  assert.ok(!openIds.includes("old-1"), "最旧钩子不应挤占最新钩子窗口");
  // 保留的应是章节号最大的 8 个（同优先级下最新优先）
  const expectedNewest = ["old-20", "old-19", "old-18", "old-17", "old-16", "old-15", "old-14", "old-13"];
  assert.deepEqual(openIds, expectedNewest, "应在同优先级下按最新优先截取");
});

test("selectHookContextWindow blocking 钩子优先于普通 open 钩子", () => {
  const hooks = [
    hook({ id: "blocking-old", createdInChapterIndex: 2, blocking: true, title: "旧但阻塞" }),
    hook({ id: "normal-new-1", createdInChapterIndex: 10, title: "新普通1" }),
    hook({ id: "normal-new-2", createdInChapterIndex: 11, title: "新普通2" }),
  ];
  const selected = selectHookContextWindow(hooks);
  assert.equal(selected[0].id, "blocking-old", "blocking 钩子必须排在最前");
});

test("selectHookContextWindow open 与 addressed 分窗互不挤占", () => {
  const hooks = [
    // 4 个 open
    ...Array.from({ length: 4 }, (_item, index) => hook({ id: `open-${index}`, createdInChapterIndex: index + 1 })),
    // 6 个 addressed（超过 addressed 上限 5）
    ...Array.from({ length: 6 }, (_item, index) => hook({
      id: `add-${index}`,
      status: "addressed",
      createdInChapterIndex: index + 1,
      resolvedInChapterIndex: index + 1,
    })),
  ];
  const selected = selectHookContextWindow(hooks);
  const openCount = selected.filter((item) => item.status === "open").length;
  const addressedCount = selected.filter((item) => item.status === "addressed").length;
  assert.equal(openCount, 4, "open 钩子全部保留且不被 addressed 挤占");
  assert.equal(addressedCount, 5, "addressed 钩子按独立上限 5 截断");
});

test("selectHookContextWindow addressed 钩子最近处理优先", () => {
  const hooks = [
    hook({ id: "add-old", status: "addressed", createdInChapterIndex: 1, resolvedInChapterIndex: 1 }),
    hook({ id: "add-new", status: "addressed", createdInChapterIndex: 9, resolvedInChapterIndex: 9 }),
  ];
  const selected = selectHookContextWindow(hooks);
  const addressed = selected.filter((item) => item.status === "addressed");
  assert.equal(addressed[0].id, "add-new", "最近处理的 addressed 钩子应排在前");
});

test("selectHookContextWindow limits 参数可覆盖默认窗口", () => {
  const hooks = Array.from({ length: 20 }, (_item, index) =>
    hook({ id: `open-${index}`, createdInChapterIndex: index + 1 }));
  const selected = selectHookContextWindow(hooks, { open: 3, addressed: 1 });
  assert.equal(selected.length, 3, "自定义 open 上限生效");
});