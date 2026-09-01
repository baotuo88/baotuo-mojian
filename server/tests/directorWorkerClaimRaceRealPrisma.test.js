const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");

const { createTempDatabase, runChildScenario } = require("./support/realSqliteHarness.cjs");

const serverRoot = path.resolve(__dirname, "..");
const childScript = path.join(__dirname, "support", "directorWorkerClaimRaceChild.cjs");

function waitForReady(child, workerId, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${workerId}. stdout=${stdout} stderr=${stderr}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const onStdout = (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.includes(`READY ${workerId}`)) {
        cleanup();
        resolve();
      }
    };
    const onStderr = (chunk) => { stderr += chunk.toString("utf8"); };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`${workerId} exited before ready: code=${code} signal=${signal} stdout=${stdout} stderr=${stderr}`));
    };
    const onError = (error) => { cleanup(); reject(error); };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function waitForExit(child, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => reject(new Error(
      `Timed out waiting for claim worker. stdout=${child.capturedStdout} stderr=${child.capturedStderr}`,
    )), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function spawnClaimWorker(database, env, workerId) {
  const child = childProcess.spawn(process.execPath, [childScript, "claim", workerId], {
    cwd: serverRoot,
    env: { ...process.env, ...env, DATABASE_URL: database.databaseUrl, NODE_ENV: "test" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.capturedStdout = "";
  child.capturedStderr = "";
  child.stdout.on("data", (chunk) => { child.capturedStdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { child.capturedStderr += chunk.toString("utf8"); });
  return child;
}

function parseJsonLines(stdout) {
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}

test("two real DirectorWorker processes claim one queued command only once", async (t) => {
  const database = createTempDatabase({ prefix: "director-worker-claim-race" });
  t.after(() => database.cleanup());
  const executionLogPath = path.join(database.tempDir, "executions.log");
  const env = { DIRECTOR_WORKER_EXECUTION_LOG: executionLogPath };

  runChildScenario({ database, script: childScript, args: ["seed"], env, cleanup: false });

  const workers = [];
  const firstWorker = spawnClaimWorker(database, env, "claim-worker-a");
  workers.push(firstWorker);
  await waitForReady(firstWorker, "claim-worker-a", 30_000);
  const secondWorker = spawnClaimWorker(database, env, "claim-worker-b");
  workers.push(secondWorker);
  t.after(() => {
    for (const worker of workers) {
      if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL");
    }
  });

  await waitForReady(secondWorker, "claim-worker-b", 30_000);
  for (const worker of workers) worker.stdin.end("START\n");
  const exits = await Promise.all(workers.map((worker) => waitForExit(worker)));
  assert.deepEqual(exits.map((exit) => exit.code), [0, 0]);

  const outputs = workers.flatMap((worker) => parseJsonLines(worker.capturedStdout));
  assert.equal(outputs.length, 2);
  assert.equal(outputs.filter((result) => result.didWork === true).length, 1);
  assert.equal(outputs.filter((result) => result.didWork === false).length, 1);

  const inspection = runChildScenario({ database, script: childScript, args: ["inspect"], env, cleanup: false });
  const result = parseJsonLines(inspection.stdout).at(-1);
  assert.equal(result.command.status, "succeeded");
  assert.equal(result.command.attempt, 1);
  assert.match(result.command.leaseOwner, /^claim-worker-[ab]:slot-1$/);
  assert.equal(result.executions.length, 1);
  assert.match(result.executions[0], /^claim-worker-[ab]:real-worker-claim-race-command$/);
});
