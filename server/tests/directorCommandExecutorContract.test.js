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
          intent: row.commandType === "continue" ? "continue" : "confirm_candidate",
          payload,
          takeoverRequest: null,
          forceResume: false,
          isControlOnly: false,
        };
      },
    },
    stateStore: {
      async readTaskState(taskId) {
        overrides.calls?.push(["readTaskState", taskId]);
        return { task: { id: taskId, novelId: overrides.command?.novelId ?? null }, runtime: null };
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
    async confirmCandidate(input) {
      calls.push(["confirmCandidate", input]);
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
  }]);
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
