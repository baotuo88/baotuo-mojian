const test = require("node:test");
const assert = require("node:assert/strict");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");
const { DirectorRuntimeGateError } = require("../dist/services/novel/director/runtime/novelDirectorRuntimeOrchestrator.js");
const { directorIssuePolicyService } = require("../dist/services/novel/director/issues/DirectorIssuePolicyService.js");
const { prisma } = require("../dist/db/prisma.js");

function makeService() {
  const service = Object.create(NovelDirectorService.prototype);
  const failures = [];
  service.buildDirectorUsageContext = async () => ({ workflowTaskId: "task-worker" });
  service.workflowService = { async markTaskFailed(...args) { failures.push(args); } };
  return { service, failures };
}

test("confirm service forwards awaited execution to the runtime", async (t) => {
  t.mock.method(directorIssuePolicyService, "getGlobalPolicy", async () => ({}));
  const { service } = makeService();
  let options;
  service.confirmRuntime = { async confirmCandidate(_input, nextOptions) { options = nextOptions; } };
  await service.confirmCandidate({}, { awaitBackgroundRun: true });
  assert.deepEqual(options, { awaitBackgroundRun: true });
});

test("awaited background failure reaches command retry without failing the workflow", async (t) => {
  const { service, failures } = makeService();
  const originalCount = prisma.directorRunCommand.count;
  prisma.directorRunCommand.count = async () => 1;
  t.after(() => { prisma.directorRunCommand.count = originalCount; });
  t.mock.method(console, "warn", () => {});
  const error = new Error("503 Service Unavailable");
  await assert.rejects(service.runBackgroundRun("task-worker", async () => { throw error; }), (actual) => actual === error);
  assert.deepEqual(failures, []);
});

test("background execution without a waiting command still records terminal failure", async (t) => {
  const { service, failures } = makeService();
  const originalCount = prisma.directorRunCommand.count;
  prisma.directorRunCommand.count = async () => 0;
  t.after(() => { prisma.directorRunCommand.count = originalCount; });
  t.mock.method(console, "error", () => {});
  const error = new Error("503 Service Unavailable");
  await assert.rejects(service.runBackgroundRun("task-worker", async () => { throw error; }), (actual) => actual === error);
  assert.deepEqual(failures, [["task-worker", error.message]]);
});

for (const error of [new DirectorRuntimeGateError("需要重新规划"), new Error("WORKFLOW_TASK_CANCELLED")]) {
  test(`awaited background execution preserves ${error.message}`, async () => {
    const { service, failures } = makeService();
    await service.runBackgroundRun("task-worker", async () => { throw error; });
    assert.deepEqual(failures, []);
  });
}
