const test = require("node:test");
const assert = require("node:assert/strict");
const { NovelWorkflowApplicationService } = require("../dist/services/novel/workflow/NovelWorkflowApplicationService.js");
const { NovelDirectorContinueRuntime } = require("../dist/services/novel/director/runtime/novelDirectorContinueRuntime.js");
const { NovelWorkflowStoreService } = require("../dist/services/novel/workflow/NovelWorkflowStoreService.js");
const { prisma } = require("../dist/db/prisma.js");

function harness(overrides = {}) {
  const row = {
    id: "completed-task", novelId: "novel-1", lane: "auto_director",
    status: "queued", progress: 1, checkpointType: "workflow_completed",
    currentItemKey: "quality_repair", currentItemLabel: "全书完成",
    pendingManualRecovery: true, lastError: "单章用量超限已暂停",
    seedPayloadJson: null, milestonesJson: null, resumeTargetJson: null,
    finishedAt: null, cancelRequestedAt: null, ...overrides,
  };
  const store = {
    async getTaskById() { return row; },
    buildResumeTarget() { return { novelId: row.novelId, taskId: row.id, stage: "pipeline" }; },
    async updateWorkflowTaskWithNotifications({ data }) { Object.assign(row, data); return row; },
  };
  const application = new NovelWorkflowApplicationService(store);
  return { row, application, workflow: {
    getTaskById: store.getTaskById,
    restoreTaskToCheckpoint: application.restoreTaskToCheckpoint.bind(application),
  } };
}

test("completed director continuation restores terminal state without restarting production", async () => {
  const { row, workflow } = harness();
  let initialized = false;
  const runtime = new NovelDirectorContinueRuntime({
    workflowService: workflow,
    directorRuntime: {
      async initializeRun() { initialized = true; },
      async recordRunResumed() {},
    },
    async continueCandidateStageTask() { return true; },
  });
  await runtime.continueTask(row.id, { forceResume: true, awaitBackgroundRun: true });
  assert.equal(row.status, "succeeded");
  assert.equal(row.lastError, null);
  assert.equal(row.pendingManualRecovery, false);
  assert.ok(row.finishedAt instanceof Date);
  assert.equal(initialized, false, "completed work must not initialize another production run");
});

test("late recovery cannot requeue a completed workflow", async () => {
  const { row, application } = harness({ status: "succeeded", lastError: null, pendingManualRecovery: false });
  await application.requeueTaskForRecovery(row.id, "worker lease expired");
  assert.equal(row.status, "succeeded");
  assert.equal(row.lastError, null);
  assert.equal(row.pendingManualRecovery, false);
});

test("completion checkpoint clears recovery flags with terminal status", async () => {
  const { row, application } = harness({ checkpointType: "chapter_batch_ready", progress: 0.97 });
  await application.recordCheckpoint(row.id, {
    stage: "quality_repair", checkpointType: "workflow_completed",
    checkpointSummary: "全书正文完成，质量提醒保留在章节中", itemLabel: "全书完成",
  });
  assert.equal(row.status, "succeeded");
  assert.equal(row.progress, 1);
  assert.equal(row.lastError, null);
  assert.equal(row.pendingManualRecovery, false);
});

test("starting explicit production clears the old completed checkpoint", async () => {
  const { row, application } = harness({ status: "succeeded", pendingManualRecovery: false, lastError: null });
  await application.markTaskRunning(row.id, { stage: "chapter_execution", itemLabel: "正在生成章节" });
  assert.equal(row.status, "running");
  assert.equal(row.checkpointType, null);
  assert.equal(row.checkpointSummary, null);
  await application.requeueTaskForRecovery(row.id, "执行中断");
  assert.equal(row.status, "queued");
  assert.equal(row.pendingManualRecovery, true);
  assert.equal(row.lastError, "执行中断");
});

test("late recovery preserves cancellation instead of restoring a completed checkpoint", async () => {
  const { row, application } = harness({ status: "cancelled", cancelRequestedAt: new Date() });
  await application.requeueTaskForRecovery(row.id, "执行中断");
  assert.equal(row.status, "cancelled");
  assert.ok(row.cancelRequestedAt);
});

test("ordinary local-quality checkpoint remains a checkpoint rather than book completion", async () => {
  const { row, application } = harness({ checkpointType: null, progress: 0.6 });
  await application.recordCheckpoint(row.id, {
    stage: "quality_repair", checkpointType: "chapter_batch_ready",
    checkpointSummary: "当前批次完成，下一批次可继续", itemLabel: "继续写作", progress: 0.93,
  });
  assert.equal(row.status, "waiting_approval");
  assert.equal(row.checkpointType, "chapter_batch_ready");
  assert.equal(row.progress, 0.93);
  assert.equal(row.finishedAt, null);
});

test("recovery compare-and-set cannot overwrite completion committed after its read", async () => {
  const initial = harness({ checkpointType: "chapter_batch_ready", status: "running" }).row;
  const current = { ...initial };
  const store = new NovelWorkflowStoreService();
  store.getTaskById = async () => ({ ...current });
  store.getTaskByIdWithoutHealing = async () => ({ ...current });
  let notified = false;
  store.notifyAutoDirectorTaskTransition = async () => { notified = true; };
  const original = prisma.novelWorkflowTask.update;
  prisma.novelWorkflowTask.update = async ({ where, data }) => {
    Object.assign(current, { status: "succeeded", checkpointType: "workflow_completed", lastError: null });
    if (where.status?.notIn?.includes(current.status)) {
      throw Object.assign(new Error("compare-and-set lost"), { code: "P2025" });
    }
    Object.assign(current, data);
    return { ...current };
  };
  try {
    const result = await new NovelWorkflowApplicationService(store).requeueTaskForRecovery(initial.id, "租约过期");
    assert.equal(result.status, "succeeded");
    assert.equal(current.status, "succeeded");
    assert.equal(current.lastError, null);
    assert.equal(notified, false, "losing recovery must not emit a false recovery notification");
  } finally {
    prisma.novelWorkflowTask.update = original;
  }
});
