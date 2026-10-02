const test = require("node:test");
const assert = require("node:assert/strict");
const { DirectorCommandExecutor } = require("../dist/services/novel/director/commands/DirectorCommandExecutor.js");

function makeExecutor(overrides = {}) {
  return new DirectorCommandExecutor({
    commandService: {
      async getCommandById(id) {
        return overrides.command ?? {
          id,
          taskId: "task-confirm-1",
          novelId: null,
          commandType: "confirm_candidate",
          payloadJson: JSON.stringify({ confirmRequest: { candidate: { workingTitle: "测试方向" } } }),
        };
      },
      parseCommandPayload(row) {
        return JSON.parse(row.payloadJson);
      },
      async getLatestTakeoverRequestForTask() {
        return null;
      },
    },
    interpreter: {
      interpret(row, payload) {
        return {
          id: row.id,
          taskId: row.taskId,
          novelId: row.novelId,
          intent: row.commandType,
          payload,
          takeoverRequest: payload.takeoverRequest ?? null,
          forceResume: false,
          isControlOnly: false,
        };
      },
    },
    stateStore: {
      async readTaskState(taskId) {
        overrides.calls?.push(["readTaskState", taskId]);
        return {
          task: { id: taskId, novelId: overrides.command?.novelId ?? null, ...overrides.task },
          seedPayload: JSON.parse(overrides.task?.seedPayloadJson ?? "{}"),
          runtime: null,
        };
      },
      async recordPipelineDispatch(input) {
        overrides.calls?.push(["recordPipelineDispatch", input]);
      },
    },
    directorService: overrides.directorService ?? {},
    workflowService: {
      async getTaskByIdWithoutHealing(taskId) {
        return { id: taskId, status: "running", cancelRequestedAt: null };
      },
    },
  });
}

test("director command executor dispatches confirm_candidate through runtime with task context", async () => {
  const calls = [];
  const executor = makeExecutor({ calls, directorService: {
    async confirmCandidate(input, options) {
      calls.push(["confirmCandidate", input, options]);
    },
  } });

  const outcome = await executor.execute("command-confirm-1");

  assert.equal(outcome, "completed");
  assert.equal(calls[0][0], "readTaskState");
  assert.equal(calls[1][0], "recordPipelineDispatch");
  assert.equal(calls[1][1].commandType, "confirm_candidate");
  assert.deepEqual(calls[2], ["confirmCandidate", {
    candidate: { workingTitle: "测试方向" },
    workflowTaskId: "task-confirm-1",
  }, { awaitBackgroundRun: true }]);
});

test("director command executor waits for continue background work", async () => {
  const calls = [];
  const executor = makeExecutor({
    calls,
    command: {
      id: "command-continue-1",
      taskId: "task-continue-1",
      novelId: "novel-1",
      commandType: "continue",
      payloadJson: JSON.stringify({ continuationMode: "resume" }),
    },
    directorService: {
      async executeContinueTask(taskId, input) {
        calls.push([taskId, input]);
      },
    },
  });

  assert.equal(await executor.execute("command-continue-1"), "completed");
  assert.deepEqual(calls[2], ["task-continue-1", {
    continuationMode: "resume",
    forceResume: true,
    awaitBackgroundRun: true,
  }]);
});

for (const commandType of ["confirm_candidate", "takeover"]) {
  test(`director worker keeps ${commandType} pending until its pipeline settles`, async () => {
    let release;
    const pipeline = new Promise((resolve) => { release = resolve; });
    let settled = false;
    const executor = makeExecutor({
      command: {
        id: "command-start", taskId: "task-start", novelId: commandType === "takeover" ? "novel-1" : null,
        commandType,
        payloadJson: JSON.stringify({
          confirmRequest: { candidate: { workingTitle: "测试方向" } },
          takeoverRequest: { novelId: "novel-1" },
        }),
      },
      directorService: {
        async confirmCandidate(_input, options) { if (options?.awaitBackgroundRun) await pipeline; },
        async startTakeover(_input, options) { if (options?.awaitBackgroundRun) await pipeline; },
      },
    });
    const pending = executor.execute("command-start").then(() => { settled = true; });
    await new Promise(setImmediate);
    const prematurelySettled = settled;
    release();
    await pending;
    assert.equal(prematurelySettled, false);
  });

  test(`${commandType} retry resumes the persisted checkpoint instead of replaying creation or takeover reset`, async () => {
    const calls = [];
    const executor = makeExecutor({
      command: {
        id: "command-retry", taskId: "task-retry", novelId: "novel-1", commandType,
        payloadJson: JSON.stringify({
          confirmRequest: { candidate: { workingTitle: "测试方向" } },
          takeoverRequest: { novelId: "novel-1", strategy: "restart_current_step" },
        }),
      },
      task: {
        seedPayloadJson: JSON.stringify({ directorInput: { runMode: "full_book_autopilot" }, directorSession: { phase: "chapter_execution" } }),
        checkpointType: "chapter_draft_ready",
      },
      directorService: {
        async executeContinueTask(taskId, options) { calls.push([taskId, options]); },
        async confirmCandidate() { assert.fail("must not recreate or silently return the existing novel"); },
        async startTakeover() { assert.fail("must not repeat the requested reset after a transient failure"); },
      },
    });
    assert.equal(await executor.execute("command-retry"), "completed");
    assert.deepEqual(calls, [["task-retry", {
      continuationMode: "resume", forceResume: true, awaitBackgroundRun: true,
    }]]);
  });
}

test("confirmation retries finish attached-novel setup before checkpoint recovery", async () => {
  let confirmed = false;
  const executor = makeExecutor({
    command: {
      id: "confirm-setup", taskId: "task-setup", novelId: "novel-1", commandType: "confirm_candidate",
      payloadJson: JSON.stringify({ confirmRequest: { candidate: { workingTitle: "测试方向" } } }),
    },
    task: { seedPayloadJson: JSON.stringify({ directorInput: {}, directorSession: { phase: "candidate_selection" } }) },
    directorService: {
      async confirmCandidate(_input, options) { confirmed = options.awaitBackgroundRun; },
      async executeContinueTask() { assert.fail("platform/style setup must finish first"); },
    },
  });
  await executor.execute("confirm-setup");
  assert.equal(confirmed, true);
});

for (const status of ["waiting_approval", "cancelled"]) {
  test(`retrying confirmation or takeover preserves ${status}`, async () => {
    for (const commandType of ["confirm_candidate", "takeover"]) {
      const executor = makeExecutor({
        command: {
          id: "command-gated", taskId: "task-gated", novelId: "novel-1", commandType,
          payloadJson: JSON.stringify({ confirmRequest: {}, takeoverRequest: { novelId: "novel-1" } }),
        },
        task: {
          status,
          seedPayloadJson: JSON.stringify({ directorInput: {}, directorSession: { phase: "chapter_execution" } }),
        },
        directorService: {
          async executeContinueTask() { assert.fail("entry retry must not approve gates or resume cancelled work"); },
        },
      });
      await executor.execute("command-gated");
    }
  });
}
