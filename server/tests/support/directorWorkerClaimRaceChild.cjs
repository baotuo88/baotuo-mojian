const fs = require("node:fs");
const path = require("node:path");

const mode = process.argv[2];
const executionLogPath = process.env.DIRECTOR_WORKER_EXECUTION_LOG;

function requireDist(relativePath) {
  return require(path.join(process.cwd(), "dist", relativePath));
}

async function seed(prisma) {
  const task = await prisma.novelWorkflowTask.create({
    data: {
      id: "real-worker-claim-race-task",
      lane: "auto_director",
      title: "Real worker claim race",
      status: "queued",
      progress: 0.4,
      currentStage: "chapter_execution",
      currentItemKey: "chapter:1",
      checkpointType: "chapter_draft_ready",
      checkpointSummary: "Two processes compete for one queued command.",
      seedPayloadJson: JSON.stringify({ runMode: "full_book_autopilot" }),
    },
  });
  await prisma.directorRunCommand.create({
    data: {
      id: "real-worker-claim-race-command",
      taskId: task.id,
      commandType: "continue",
      idempotencyKey: "real-worker-claim-race",
      status: "queued",
      payloadJson: JSON.stringify({ confirmRequest: { runMode: "full_book_autopilot" } }),
    },
  });
}

function waitForStartSignal() {
  return new Promise((resolve, reject) => {
    let input = "";
    const onData = (chunk) => {
      input += chunk.toString("utf8");
      if (!input.split(/\r?\n/).includes("START")) return;
      cleanup();
      resolve();
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("stdin ended before START signal"));
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.resume();
  });
}

async function claim(workerId) {
  if (!workerId) throw new Error("workerId is required");
  if (!executionLogPath) throw new Error("DIRECTOR_WORKER_EXECUTION_LOG is required");
  const { DirectorWorker } = requireDist("workers/directorWorker.js");
  const { DirectorTaskQueue } = requireDist("workers/DirectorTaskQueue.js");
  const queue = new DirectorTaskQueue({
    workerId,
    leaseMs: 2_000,
    staleScanMs: 60_000,
    executionSlots: 1,
    pollMs: 10,
  });
  const worker = new DirectorWorker({
    queue,
    commandExecutor: {
      async execute(commandId) {
        fs.appendFileSync(executionLogPath, `${workerId}:${commandId}\n`, "utf8");
        return "completed";
      },
    },
  });

  process.stdout.write(`READY ${workerId}\n`);
  await waitForStartSignal();
  const didWork = await worker.tick("slot-1");
  process.stdout.write(`${JSON.stringify({ workerId, didWork })}\n`);
  await global.prisma.$disconnect();
}

async function inspect(prisma) {
  const command = await prisma.directorRunCommand.findUnique({
    where: { id: "real-worker-claim-race-command" },
  });
  const executions = executionLogPath && fs.existsSync(executionLogPath)
    ? fs.readFileSync(executionLogPath, "utf8").split(/\r?\n/).filter(Boolean)
    : [];
  process.stdout.write(`${JSON.stringify({
    command: command && {
      id: command.id,
      status: command.status,
      attempt: command.attempt,
      leaseOwner: command.leaseOwner,
    },
    executions,
  })}\n`);
}

async function main() {
  global.prisma = undefined;
  const { prisma } = requireDist("db/prisma.js");
  try {
    if (mode === "seed") await seed(prisma);
    else if (mode === "claim") await claim(process.argv[3]);
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
