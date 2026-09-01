const test = require("node:test");
const assert = require("node:assert/strict");
const { DirectorCommandExecutor } = require("../dist/services/novel/director/commands/DirectorCommandExecutor.js");

function command() {
  return {
    id: "command-confirm-1",
    taskId: "task-confirm-1",
    novelId: null,
    commandType: "confirm_candidate",
    payloadJson: JSON.stringify({ confirmRequest: { candidate: { workingTitle: "测试方向" } } }),
  };
}

test("director command executor dispatches confirm_candidate through runtime with task context", async () => {
  const calls = [];
  const executor = new DirectorCommandExecutor({
    commandService: {
      async getCommandById(id) {
        assert.equal(id, "command-confirm-1");
        return command();
      },
      parseCommandPayload(row) {
        return JSON.parse(row.payloadJson);
      },
    },
    interpreter: {
      interpret(row, payload) {
        return {
          id: row.id,
          taskId: row.taskId,
          novelId: row.novelId,
          intent: "confirm_candidate",
          payload,
          takeoverRequest: null,
          forceResume: false,
          isControlOnly: false,
        };
      },
    },
    stateStore: {
      async readTaskState(taskId) {
        calls.push(["readTaskState", taskId]);
        return { task: { id: taskId, novelId: null }, runtime: null };
      },
      async recordPipelineDispatch(input) {
        calls.push(["recordPipelineDispatch", input]);
      },
    },
    directorService: {
      async confirmCandidate(input) {
        calls.push(["confirmCandidate", input]);
      },
    },
    workflowService: {
      async getTaskByIdWithoutHealing(taskId) {
        return { id: taskId, status: "running", cancelRequestedAt: null };
      },
    },
  });

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
