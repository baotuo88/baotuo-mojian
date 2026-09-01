const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");

const { createTempDatabase, runChildScenario } = require("./support/realSqliteHarness.cjs");
const { CHAPTER_CONTENT } = require("./support/mockLlmChapterScenario.cjs");

const serverRoot = path.resolve(__dirname, "..");
const childScript = path.join(__dirname, "support", "directorWorkerProcessRecoveryChild.cjs");

function waitForMarker(child, marker, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${marker}. stdout=${stdout} stderr=${stderr}`));
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
      if (stdout.includes(marker)) {
        cleanup();
        resolve({ stdout, stderr });
      }
    };
    const onStderr = (chunk) => {
      stderr += chunk.toString("utf8");
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Victim exited before ${marker}: code=${code} signal=${signal} stdout=${stdout} stderr=${stderr}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function waitForExit(child, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => reject(new Error("Timed out waiting for victim to exit after SIGKILL")), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function parseLastJsonLine(stdout) {
  const line = stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).reverse()
    .find((value) => value.startsWith("{"));
  if (!line) throw new Error(`Child did not return JSON. stdout=${stdout}`);
  return JSON.parse(line);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("a real DirectorWorker process resumes a running command once after SIGKILL", async (t) => {
  const database = createTempDatabase({ prefix: "director-worker-process-recovery" });
  t.after(() => database.cleanup());
  const executionLogPath = path.join(database.tempDir, "executions.log");
  const childEnv = { DIRECTOR_WORKER_EXECUTION_LOG: executionLogPath };
  const victimEnv = {
    ...childEnv,
    DIRECTOR_WORKER_LEASE_MS: "300",
    DIRECTOR_WORKER_STALE_SCAN_MS: "60000",
  };
  const recoveryEnv = {
    ...childEnv,
    DIRECTOR_WORKER_LEASE_MS: "1000",
    DIRECTOR_WORKER_STALE_SCAN_MS: "1",
  };

  runChildScenario({ database, script: childScript, args: ["seed"], env: childEnv, cleanup: false });

  const victim = childProcess.spawn(process.execPath, [childScript, "victim"], {
    cwd: serverRoot,
    env: {
      ...process.env,
      ...victimEnv,
      DATABASE_URL: database.databaseUrl,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (victim.exitCode === null && victim.signalCode === null) victim.kill("SIGKILL");
  });

  await waitForMarker(victim, "WORKER_RUNNING real-worker-recovery-command");
  assert.equal(victim.kill("SIGKILL"), true);
  const victimExit = await waitForExit(victim);
  assert.equal(victimExit.signal, "SIGKILL");

  await delay(450);
  runChildScenario({ database, script: childScript, args: ["recovery"], env: recoveryEnv, cleanup: false });
  const inspection = runChildScenario({
    database,
    script: childScript,
    args: ["inspect"],
    env: childEnv,
    cleanup: false,
  });
  const result = parseLastJsonLine(inspection.stdout);

  assert.equal(result.command.status, "succeeded");
  assert.equal(result.command.attempt, 2);
  assert.equal(result.command.leaseOwner, "recovery-worker:slot-1");
  assert.equal(result.task.status, "queued");
  assert.equal(result.task.checkpointType, "chapter_draft_ready");
  assert.equal(result.task.checkpointSummary, "A persisted checkpoint survives worker termination.");
  assert.deepEqual(result.chapter, {
    id: "chapter-e2e",
    content: CHAPTER_CONTENT,
    generationState: "drafted",
    chapterStatus: "pending_review",
  });
  assert.deepEqual(result.executions, ["real-worker-recovery-command"]);
});
