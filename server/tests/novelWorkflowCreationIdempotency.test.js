const test = require("node:test");
const assert = require("node:assert/strict");
const { NovelWorkflowApplicationService } = require("../dist/services/novel/workflow/NovelWorkflowApplicationService.js");

test("createNovelProject reuses an already attached project for the same request", async () => {
  const calls = [];
  const workflow = {
    async getTaskById() {
      return { id: "workflow-create-request-12345678", novelId: "novel-existing", title: "已存在" };
    },
    async getNovelById(id) {
      calls.push(["getNovelById", id]);
      return { id, title: "已存在" };
    },
  };
  const service = new NovelWorkflowApplicationService(workflow);
  const result = await service.createNovelProject({
    requestId: "request-12345678",
    title: "不会重复创建",
    createNovel: async () => {
      calls.push(["createNovel"]);
      return { id: "unexpected", title: "unexpected" };
    },
  });
  assert.equal(result.novel.id, "novel-existing");
  assert.deepEqual(calls, [["getNovelById", "novel-existing"]]);
});

test("createNovelProject recovers an existing unbound novel without creating a duplicate", async () => {
  const calls = [];
  const workflow = {
    async getTaskById() {
      return { id: "workflow-create-request-12345678", novelId: null, lane: "manual_create", title: "待绑定" };
    },
    async getNovelById(id) {
      calls.push(["getNovelById", id]);
      return { id, title: "已创建但待绑定" };
    },
    async getNovelTitle(id) {
      calls.push(["getNovelTitle", id]);
      return "已创建但待绑定";
    },
    buildResumeTarget() {
      return { type: "novel_edit", novelId: "novel-create-request-12345678" };
    },
    async updateTaskWithRetry() {
      calls.push(["updateTaskWithRetry"]);
      return { id: "workflow-create-request-12345678", novelId: "novel-create-request-12345678" };
    },
  };
  const service = new NovelWorkflowApplicationService(workflow);
  const result = await service.createNovelProject({
    requestId: "request-12345678",
    title: "恢复绑定",
    createNovel: async () => {
      calls.push(["createNovel"]);
      return { id: "unexpected", title: "unexpected" };
    },
  });
  assert.equal(result.novel.id, "novel-create-request-12345678");
  assert.deepEqual(calls, [
    ["getNovelById", "novel-create-request-12345678"],
    ["getNovelTitle", "novel-create-request-12345678"],
    ["updateTaskWithRetry"],
  ]);
});
