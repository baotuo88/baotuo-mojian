const fs = require("node:fs");
const path = require("node:path");

const mode = process.argv[2];
const executionLogPath = process.env.DIRECTOR_WORKER_EXECUTION_LOG;
const {
  seedMockLlmChapterScenario,
  runMockLlmChapterScenario,
  inspectMockLlmChapterScenario,
} = require("./mockLlmChapterScenario.cjs");

function requireDist(relativePath) {
  return require(path.join(process.cwd(), "dist", relativePath));
}

async function seed(prisma) {
  await seedMockLlmChapterScenario(prisma);
  const task = await prisma.novelWorkflowTask.create({
    data: {
      id: "real-worker-recovery-task",
      lane: "auto_director",
      title: "Real worker process recovery",
      status: "queued",
      progress: 0.62,
      currentStage: "chapter_execution",
      currentItemKey: "chapter:1",
      checkpointType: "chapter_draft_ready",
      checkpointSummary: "A persisted checkpoint survives worker termination.",
      seedPayloadJson: JSON.stringify({ runMode: "full_book_autopilot" }),
    },
  });
  await prisma.directorRunCommand.create({
    data: {
      id: "real-worker-recovery-command",
      taskId: task.id,
      commandType: "continue",
      idempotencyKey: "real-worker-process-recovery",
      status: "queued",
      payloadJson: JSON.stringify({ confirmRequest: { runMode: "full_book_autopilot" } }),
    },
  });
}

async function runVictim() {
  const { DirectorWorker } = requireDist("workers/directorWorker.js");
  const { DirectorTaskQueue } = requireDist("workers/DirectorTaskQueue.js");
  const queue = new DirectorTaskQueue({
    workerId: "victim-worker",
    leaseMs: 300,
    staleScanMs: 60_000,
    executionSlots: 1,
    pollMs: 10,
  });
  const markRunning = queue.markRunning.bind(queue);
  queue.markRunning = async (commandId, slotId) => {
    await markRunning(commandId, slotId);
    process.stdout.write(`WORKER_RUNNING ${commandId}\n`);
    await new Promise(() => {});
  };
  const worker = new DirectorWorker({
    queue,
    commandExecutor: {
      async execute() {
        throw new Error("victim executor must not run before SIGKILL");
      },
    },
  });
  await worker.tick("slot-1");
}

async function runRecovery() {
  if (!executionLogPath) throw new Error("DIRECTOR_WORKER_EXECUTION_LOG is required");
  const { DirectorWorker } = requireDist("workers/directorWorker.js");
  const { DirectorTaskQueue } = requireDist("workers/DirectorTaskQueue.js");
  const queue = new DirectorTaskQueue({
    workerId: "recovery-worker",
    leaseMs: 1_000,
    staleScanMs: 1,
    executionSlots: 1,
    pollMs: 10,
  });
  const worker = new DirectorWorker({
    queue,
    commandExecutor: {
      async execute(commandId) {
        fs.appendFileSync(executionLogPath, `${commandId}\n`, "utf8");
        await runMockLlmChapterScenario();
        return "completed";
      },
    },
  });
  const didWork = await worker.tick("slot-1");
  if (!didWork) throw new Error("recovery worker did not reclaim the stale command");
}

async function inspect(prisma) {
  const command = await prisma.directorRunCommand.findUnique({
    where: { id: "real-worker-recovery-command" },
  });
  const task = await prisma.novelWorkflowTask.findUnique({
    where: { id: "real-worker-recovery-task" },
  });
  const executions = executionLogPath && fs.existsSync(executionLogPath)
    ? fs.readFileSync(executionLogPath, "utf8").split(/\r?\n/).filter(Boolean)
    : [];
  const chapter = await inspectMockLlmChapterScenario(prisma);
  process.stdout.write(`${JSON.stringify({
    command: command && {
      id: command.id,
      status: command.status,
      attempt: command.attempt,
      leaseOwner: command.leaseOwner,
    },
    task: task && {
      id: task.id,
      status: task.status,
      checkpointType: task.checkpointType,
      checkpointSummary: task.checkpointSummary,
    },
    chapter,
    executions,
  })}\n`);
}

async function main() {
  global.prisma = undefined;
  const { prisma } = requireDist("db/prisma.js");
  try {
    if (mode === "seed") await seed(prisma);
    else if (mode === "victim") await runVictim();
    else if (mode === "recovery") await runRecovery();
    else if (mode === "inspect") await inspect(prisma);
    else throw new Error(`unknown child mode: ${mode}`);
  } finally {
    await prisma.$disconnect();
    global.prisma = undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
