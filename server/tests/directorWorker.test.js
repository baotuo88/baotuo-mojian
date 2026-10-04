const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { DirectorWorker } = require("../dist/workers/directorWorker.js");
const { DirectorTaskQueue } = require("../dist/workers/DirectorTaskQueue.js");
const { taskDispatcher } = require("../dist/workers/TaskDispatcher.js");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("director worker renews a leased command while waiting for resource budget", async () => {
  const events = [];
  let leaseReturned = false;
  const command = {
    id: "command-1",
    taskId: "task-1",
    novelId: "novel-1",
    commandType: "continue",
  };

  const queue = Object.create(DirectorTaskQueue.prototype);
  queue.workerId = "test-worker";
  queue.leaseMs = 300;
  queue.staleScanMs = Number.MAX_SAFE_INTEGER;
  queue.executionSlots = 1;
  queue.pollMs = 1;

  queue.leaseNext = async () => {
    if (leaseReturned) return null;
    leaseReturned = true;
    events.push("lease");
    return { command };
  };
  queue.startLeaseRenewal = (commandId, slotId) => {
    events.push(`start-renewal:${commandId}:${slotId}`);
    return () => {
      events.push("stop-renewal");
    };
  };
  queue.acquireResourceGate = async (novelId, commandType) => {
    events.push(`acquire-gate:${novelId}:${commandType}`);
    await delay(150);
    events.push("gate-acquired");
  };
  queue.releaseResourceGate = (novelId, commandType) => {
    events.push(`release-gate:${novelId}:${commandType}`);
  };
  queue.markRunning = async (commandId, slotId) => {
    events.push(`mark-running:${commandId}:${slotId}`);
  };
  queue.completeTask = async (commandId, slotId) => {
    events.push(`complete:${commandId}:${slotId}`);
  };
  queue.cancelTask = async () => {
    events.push("cancel");
  };
  queue.failTask = async () => {
    events.push("fail");
  };
  queue.waitForWork = async () => {
    await delay(1);
  };

  const commandExecutor = {
    execute: async (commandId) => {
      events.push(`execute:${commandId}`);
      return "completed";
    },
  };

  const worker = new DirectorWorker({ queue, commandExecutor });
  const didWork = await worker.tick("slot-1");

  assert.equal(didWork, true);
  assert.ok(events.includes("lease"), "should lease a task");
  assert.ok(
    events.includes("start-renewal:command-1:slot-1"),
    "should start lease renewal with the leased command id",
  );
  assert.ok(
    events.includes("acquire-gate:novel-1:continue"),
    "should acquire per-novel resource gate using the command type",
  );
  assert.ok(
    events.includes("mark-running:command-1:slot-1"),
    "should mark the leased command as running",
  );
  assert.ok(events.includes("execute:command-1"), "should execute the leased command");
  assert.ok(
    events.includes("complete:command-1:slot-1"),
    "should complete the leased command",
  );
  assert.ok(
    events.includes("release-gate:novel-1:continue"),
    "should release per-novel resource gate",
  );
  assert.ok(events.includes("stop-renewal"), "should stop lease renewal");
  assert.ok(
    events.indexOf("start-renewal:command-1:slot-1") < events.indexOf("acquire-gate:novel-1:continue"),
    "renewal should start before waiting for resource gate",
  );
});

test("director task queue leases directly from director run commands", async (t) => {
  const originals = {
    findFirst: prisma.directorRunCommand.findFirst,
    updateMany: prisma.directorRunCommand.updateMany,
    findUnique: prisma.directorRunCommand.findUnique,
  };
  const calls = [];
  const leasedCommand = {
    id: "command-queued-1",
    taskId: "task-1",
    novelId: "novel-1",
    commandType: "continue",
    status: "leased",
  };

  prisma.directorRunCommand.findFirst = async (args) => {
    calls.push(["findFirst", args]);
    return {
      id: "command-queued-1",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "continue",
      status: "queued",
      runAfter: new Date("2026-05-06T00:00:00.000Z"),
      createdAt: new Date("2026-05-06T00:00:00.000Z"),
    };
  };
  prisma.directorRunCommand.updateMany = async (args) => {
    calls.push(["updateMany", args]);
    return { count: 1 };
  };
  prisma.directorRunCommand.findUnique = async (args) => {
    calls.push(["findUnique", args]);
    assert.equal(args.where.id, "command-queued-1");
    return leasedCommand;
  };
  t.after(() => {
    prisma.directorRunCommand.findFirst = originals.findFirst;
    prisma.directorRunCommand.updateMany = originals.updateMany;
    prisma.directorRunCommand.findUnique = originals.findUnique;
  });

  const queue = new DirectorTaskQueue(
    {
      workerId: "worker-a",
      leaseMs: 1234,
      staleScanMs: Number.MAX_SAFE_INTEGER,
    },
    {
      renewLease: async () => true,
      markCommandRunning: async () => {},
      markCommandSucceeded: async () => {},
      markCommandCancelled: async () => {},
      markCommandFailed: async () => {},
      recoverStaleLeases: async () => 0,
      getCommandById: async () => leasedCommand,
    },
  );

  const leased = await queue.leaseNext("slot-1");

  assert.ok(leased, "should return a leased command");
  assert.equal(leased.command, leasedCommand);
  assert.equal(calls[0][0], "findFirst");
  assert.equal(calls[1][0], "updateMany");
  assert.equal(calls[2][0], "findUnique");
  assert.equal(calls[1][1].data.status, "leased");
  assert.equal(calls[1][1].data.leaseOwner, "worker-a:slot-1");
  assert.equal(calls[1][1].where.id, "command-queued-1");
});

test("task dispatcher notifies waiting slots immediately", async () => {
  const start = Date.now();
  const waitPromise = taskDispatcher.waitForSignal(5000);
  await delay(10);
  taskDispatcher.notify({ commandType: "continue" });
  const wasSignaled = await waitPromise;
  const elapsed = Date.now() - start;
  assert.equal(wasSignaled, true, "should be woken by signal");
  assert.ok(elapsed < 1000, `should wake quickly, took ${elapsed}ms`);
});

test("task dispatcher returns false on timeout", async () => {
  const wasSignaled = await taskDispatcher.waitForSignal(50);
  assert.equal(wasSignaled, false, "should return false on timeout");
});


test("lease loss aborts the running pipeline and rejects a late persistence attempt", async (t) => {
  const { fixture } = require("./support/executionFenceFixture.cjs");
  const { getExecutionAbortSignal } = require("../dist/platform/execution");
  const { raw, client, value } = await fixture(t);
  await raw.directorRunCommand.updateMany({ where: { id: "cmd" }, data: { leaseOwner: "review:slot" } });
  let renewals = 0;
  const queue = new DirectorTaskQueue({ workerId: "review", leaseMs: 300 }, {
    renewLease: async () => ++renewals === 1,
  });
  queue.leaseNext = async () => ({ command: { id: "cmd", taskId: "task", novelId: null, commandType: "continue", attempt: 1 } });
  queue.acquireResourceGate = async () => {};
  queue.releaseResourceGate = () => {};
  queue.markRunning = async () => {};
  let completed = false;
  queue.completeTask = async () => { completed = true; };
  queue.failTask = async () => {};
  let signal;
  const worker = new DirectorWorker({ queue, commandExecutor: { execute: async () => {
    signal = getExecutionAbortSignal();
    await delay(160);
    // Simulate an adapter that resolves despite cancellation. The actual Prisma
    // write boundary must reject it, not just a race around the execution promise.
    await client.appSetting.updateMany({ where: { key: "result" }, data: { value: "late chapter" } });
    return "completed";
  } } });
  await worker.tick("slot");
  assert.equal(signal?.aborted, true);
  assert.equal(completed, false);
  assert.deepEqual(await value(), { value: "original" });
});

test("cancel commands retain their persisted ownership check before dispatch and while cleaning up", async (t) => {
  const { fixture } = require("./support/executionFenceFixture.cjs");
  const { raw, client } = await fixture(t);
  const originalCount = prisma.directorRunCommand.count;
  prisma.directorRunCommand.count = (...args) => raw.directorRunCommand.count(...args);
  t.after(() => { prisma.directorRunCommand.count = originalCount; });
  await raw.directorRunCommand.updateMany({ where: { id: "cmd" }, data: { commandType: "cancel", leaseOwner: "review:slot" } });
  await raw.novelWorkflowTask.updateMany({ where: { id: "task" }, data: { status: "cancelled" } });
  const queue = new DirectorTaskQueue({ workerId: "review", leaseMs: 10_000 }, { renewLease: async () => true });
  queue.leaseNext = async () => ({ command: { id: "cmd", taskId: "task", novelId: null, commandType: "cancel", attempt: 1 } });
  queue.acquireResourceGate = async () => {};
  queue.releaseResourceGate = () => {};
  queue.markRunning = async () => {};
  let executions = 0;
  let cancellations = 0;
  const failures = [];
  queue.cancelTask = async () => { cancellations += 1; };
  queue.failTask = async (_id, _slot, error) => { failures.push(error); };
  const worker = new DirectorWorker({ queue, commandExecutor: { execute: async () => {
    executions += 1;
    await client.novelWorkflowTask.updateMany({ where: { id: "task" }, data: { status: "cancelled" } });
    return "cancelled";
  } } });
  await worker.tick("slot");
  assert.equal(executions, 1);
  assert.equal(cancellations, 1);
  assert.equal(failures.length, 0);
  await raw.directorRunCommand.updateMany({ where: { id: "cmd" }, data: { leaseOwner: "replacement" } });
  await worker.tick("slot");
  assert.equal(executions, 1, "a stale cancel command must not reach the executor");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, "ExecutionStoppedError");
});
