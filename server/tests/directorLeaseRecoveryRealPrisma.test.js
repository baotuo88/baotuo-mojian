const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const { createTempDatabase } = require("./support/realSqliteHarness.cjs");

function writeChildScript(tempDir) {
  const scriptPath = path.join(tempDir, "run-director-lease-recovery.cjs");
  fs.writeFileSync(scriptPath, `
const path = require("node:path");

async function main() {
  global.prisma = undefined;
  const repoRoot = process.cwd();
  const { prisma } = require(path.join(repoRoot, "server", "dist", "db", "prisma.js"));
  const { DirectorCommandService } = require(path.join(repoRoot, "server", "dist", "services", "novel", "director", "commands", "DirectorCommandService.js"));

  try {
    const now = new Date(Date.now() - 1000);
    const task = await prisma.novelWorkflowTask.create({
      data: {
        id: "real-lease-task",
        lane: "auto_director",
        title: "Lease recovery integration test",
        status: "running",
        progress: 0.62,
        currentStage: "chapter_execution",
        currentItemKey: "chapter:1",
        checkpointType: "chapter_draft_ready",
        checkpointSummary: "A usable chapter draft was persisted before interruption.",
        seedPayloadJson: JSON.stringify({ runMode: "full_book_autopilot" }),
      },
    });
    const command = await prisma.directorRunCommand.create({
      data: {
        id: "real-lease-command",
        taskId: task.id,
        commandType: "continue",
        idempotencyKey: "restart-recovery",
        status: "running",
        leaseOwner: "worker-before-restart:slot-1",
        leaseExpiresAt: new Date(now.getTime() - 1000),
        attempt: 1,
        payloadJson: JSON.stringify({ confirmRequest: { runMode: "full_book_autopilot" } }),
        startedAt: new Date(now.getTime() - 5000),
      },
    });

    const enqueueTask = await prisma.novelWorkflowTask.create({
      data: {
        id: "real-enqueue-task",
        lane: "auto_director",
        title: "Command enqueue integration test",
        status: "waiting_approval",
        progress: 0.18,
        currentStage: "auto_director",
        currentItemKey: "candidate_confirm",
        seedPayloadJson: JSON.stringify({ runMode: "full_book_autopilot" }),
      },
    });
    const service = new DirectorCommandService();
    const enqueueInput = {
      idea: "普通人卷入宫廷身份谜局。",
      title: "宫墙之外",
      estimatedChapterCount: 20,
      runMode: "full_book_autopilot",
      workflowTaskId: enqueueTask.id,
      batchId: "real-enqueue-batch",
      round: 1,
      candidate: {
        id: "real-enqueue-candidate",
        workingTitle: "宫墙之外",
        logline: "普通人在宫廷压力下寻找身份真相。",
        positioning: "历史生存悬疑",
        sellingPoint: "身份反转与持续压力",
        coreConflict: "主角必须在暴露身份前找到真相。",
        protagonistPath: "从被动求生到主动调查。",
        endingDirection: "第一轮真相打开更大的阴谋。",
        hookStrategy: "每次求生都揭开一层身份线索。",
        progressionLoop: "受压、求生、调查、反制。",
        whyItFits: "冲突清晰且适合连续推进。",
        toneKeywords: ["悬疑"],
        targetChapterCount: 20,
      },
    };
    const firstEnqueue = await service.enqueueConfirmCandidateCommand(enqueueInput);
    const secondEnqueue = await service.enqueueConfirmCandidateCommand(enqueueInput);
    const enqueueCommands = await prisma.directorRunCommand.findMany({ where: { taskId: enqueueTask.id } });
    const enqueueTaskAfter = await prisma.novelWorkflowTask.findUnique({ where: { id: enqueueTask.id } });
    const leasedEnqueue = await service.leaseNextCommand({ workerId: "worker-confirm:slot-1", leaseMs: 30_000 });
    const { DirectorCommandExecutor } = require(path.join(repoRoot, "server", "dist", "services", "novel", "director", "commands", "DirectorCommandExecutor.js"));
    const executed = [];
    const executor = new DirectorCommandExecutor({
      commandService: service,
      stateStore: {
        async readTaskState(taskId) {
          return { task: { id: taskId, novelId: null }, runtime: null };
        },
        async recordPipelineDispatch(input) {
          executed.push(["dispatch", input.commandType, input.taskId]);
        },
      },
      directorService: {
        async confirmCandidate(input) {
          executed.push(["confirm", input.workflowTaskId, input.candidate.id]);
        },
      },
      workflowService: {
        async getTaskByIdWithoutHealing() {
          return { status: "running", cancelRequestedAt: null };
        },
      },
    });
    const executionOutcome = await executor.execute(leasedEnqueue.id);
    await prisma.directorRunCommand.update({ where: { id: leasedEnqueue.id }, data: { status: "completed", finishedAt: new Date() } });
    await prisma.directorRunCommand.updateMany({
      where: { taskId: enqueueTask.id },
      data: { status: "completed", finishedAt: new Date() },
    });
    const recoveredCount = await service.recoverStaleLeases(now, { taskId: task.id });
    const recoveredCommand = await prisma.directorRunCommand.findUnique({ where: { id: command.id } });
    const recoveredTask = await prisma.novelWorkflowTask.findUnique({ where: { id: task.id } });
    const resumedLease = await service.leaseNextCommand({ workerId: "worker-after-restart:slot-1", leaseMs: 30_000 });
    const competingLease = await service.leaseNextCommand({ workerId: "worker-competing:slot-1", leaseMs: 30_000 });
    const finalCommand = await prisma.directorRunCommand.findUnique({ where: { id: command.id } });

    console.log(JSON.stringify({
      enqueue: {
        firstCommandId: firstEnqueue.commandId,
        secondCommandId: secondEnqueue.commandId,
        commandType: firstEnqueue.commandType,
        commandCount: enqueueCommands.length,
        commandStatus: enqueueCommands[0]?.status,
        taskStatus: enqueueTaskAfter?.status,
        taskItemKey: enqueueTaskAfter?.currentItemKey,
        leasedCommandId: leasedEnqueue?.id,
        leasedCommandStatus: leasedEnqueue?.status,
        executionOutcome,
        executed,
      },
      recoveredCount,
      recoveredCommand: {
        status: recoveredCommand?.status,
        leaseOwner: recoveredCommand?.leaseOwner,
        errorMessage: recoveredCommand?.errorMessage,
        runAfter: recoveredCommand?.runAfter?.toISOString?.() ?? null,
      },
      recoveredTask: {
        status: recoveredTask?.status,
        checkpointType: recoveredTask?.checkpointType,
        checkpointSummary: recoveredTask?.checkpointSummary,
        pendingManualRecovery: recoveredTask?.pendingManualRecovery,
      },
      resumedLeaseId: resumedLease?.id ?? null,
      competingLeaseId: competingLease?.id ?? null,
      finalCommand: {
        status: finalCommand?.status,
        leaseOwner: finalCommand?.leaseOwner,
        attempt: finalCommand?.attempt,
      },
    }));
  } finally {
    await prisma.$disconnect();
    global.prisma = undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`, "utf8");
  return scriptPath;
}

function runScenario() {
  const database = createTempDatabase({ prefix: "director-lease" });
  try {
    const stdout = childProcess.execFileSync(process.execPath, [writeChildScript(database.tempDir)], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: database.databaseUrl },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const jsonLine = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse().find((line) => line.startsWith("{"));
    if (!jsonLine) throw new Error(`Child scenario did not write a JSON result. stdout=${stdout}`);
    return JSON.parse(jsonLine);
  } finally {
    database.cleanup();
  }
}

test("expired full-book command recovers its checkpoint and only one restarted worker can reclaim it on real sqlite", () => {
  const result = runScenario();

  assert.equal(result.enqueue.firstCommandId, result.enqueue.secondCommandId);
  assert.equal(result.enqueue.commandType, "confirm_candidate");
  assert.equal(result.enqueue.commandCount, 1);
  assert.equal(result.enqueue.commandStatus, "queued");
  assert.equal(result.enqueue.taskItemKey, "candidate_confirm");
  assert.equal(result.enqueue.leasedCommandId, result.enqueue.firstCommandId);
  assert.equal(result.enqueue.leasedCommandStatus, "leased");
  assert.equal(result.enqueue.executionOutcome, "completed");
  assert.deepEqual(result.enqueue.executed, [
    ["dispatch", "confirm_candidate", "real-enqueue-task"],
    ["confirm", "real-enqueue-task", "real-enqueue-candidate"],
  ]);
  assert.equal(result.recoveredCount, 1);
  assert.equal(result.recoveredCommand.status, "queued");
  assert.equal(result.recoveredCommand.leaseOwner, null);
  assert.match(result.recoveredCommand.errorMessage ?? "", /自动从最近进度继续/);
  assert.equal(result.recoveredTask.status, "queued");
  assert.equal(result.recoveredTask.checkpointType, "chapter_draft_ready");
  assert.match(result.recoveredTask.checkpointSummary ?? "", /usable chapter draft/);
  assert.equal(result.recoveredTask.pendingManualRecovery, false);
  assert.equal(result.resumedLeaseId, "real-lease-command");
  assert.equal(result.competingLeaseId, null);
  assert.equal(result.finalCommand.status, "leased");
  assert.equal(result.finalCommand.leaseOwner, "worker-after-restart:slot-1");
  assert.equal(result.finalCommand.attempt, 2);
});
