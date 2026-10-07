const test = require("node:test");
const assert = require("node:assert/strict");
const { runWithExecutionScope } = require("../dist/platform/execution");
const { fixture } = require("./support/executionFenceFixture.cjs");

test("late writes are rejected by persisted ownership even before local renewal detects the loss", async (t) => {
  const { raw, client, fence, value } = await fixture(t);
  await raw.directorRunCommand.updateMany({
    where: { id: "cmd" },
    data: { leaseOwner: "replacement", attempt: 2 },
  });
  await assert.rejects(
    runWithExecutionScope({ fence }, () =>
      client.appSetting.updateMany({
        where: { key: "result" },
        data: { value: "stale result" },
      }),
    ),
    /租约已失效/,
  );
  assert.deepEqual(await value(), { value: "original" });
});

test("cancellation during an interactive write transaction rolls its changes back", async (t) => {
  const { client, fence, value } = await fixture(t);
  const controller = new AbortController();
  await assert.rejects(
    runWithExecutionScope({ signal: controller.signal, fence }, () =>
      client.$transaction(async (tx) => {
        await tx.appSetting.updateMany({
          where: { key: "result" },
          data: { value: "uncommitted" },
        });
        controller.abort(new Error("cancelled during persistence"));
      }),
    ),
    /cancelled during persistence/,
  );
  assert.deepEqual(await value(), { value: "original" });
});

test("healthy standalone, lazy batch, and raw writes retain Prisma behavior under a fence", async (t) => {
  const { client, fence, value } = await fixture(t);
  await runWithExecutionScope({ fence }, async () => {
    await client.appSetting.updateMany({ where: { key: "result" }, data: { value: "standalone" } });
    assert.deepEqual(await value(), { value: "standalone" });
    const operations = ["first", "second"].map((next) =>
      client.appSetting.updateMany({ where: { key: "result" }, data: { value: next } }),
    );
    assert.deepEqual(await value(), { value: "standalone" });
    assert.deepEqual(await client.$transaction(operations), [{ count: 1 }, { count: 1 }]);
    await client.$executeRaw`UPDATE AppSetting SET value = ${"raw"} WHERE key = 'result'`;
    await client.$executeRawUnsafe(
      "UPDATE AppSetting SET value = ? WHERE key = ?",
      "unsafe-parameterized",
      "result",
    );
  });
  assert.deepEqual(await value(), { value: "unsafe-parameterized" });
});

test("persisted agent cancellation rejects tool writes without a local controller", async (t) => {
  const { raw, client, value } = await fixture(t);
  await raw.agentRun.updateMany({ where: { id: "run" }, data: { status: "cancelled" } });
  await assert.rejects(
    runWithExecutionScope({ fence: { kind: "agent", runId: "run" } }, () =>
      client.appSetting.updateMany({
        where: { key: "result" },
        data: { value: "late tool" },
      }),
    ),
    /拒绝保存/,
  );
  assert.deepEqual(await value(), { value: "original" });
});

test("a late success update cannot replace the persisted cancelled agent terminal state", async (t) => {
  const { raw } = await fixture(t);
  const { AgentTraceStore } = require("../dist/agents/traceStore.js");
  const store = new AgentTraceStore(raw);
  await store.updateRun("run", {
    status: "cancelled",
    currentStep: "cancelled",
    finishedAt: new Date(),
  });
  const lateResult = await store.updateRun("run", {
    status: "succeeded",
    currentStep: "completed",
    finishedAt: new Date(),
  });
  assert.equal(lateResult.status, "cancelled");
  assert.equal(lateResult.currentStep, "cancelled");
});

test("chapter content fences accept null and quoted text without advancing the chapter revision", async (t) => {
  const { raw, client } = await fixture(t);
  const updatedAt = new Date("2026-10-01T00:00:00.000Z");
  for (const [index, content] of [null, "", "正文含有 '引号' 与换行\n下一段"].entries()) {
    const chapterId = `chapter-${index}`;
    await raw.$executeRaw`INSERT INTO "Chapter" ("id", "novelId", "content", "updatedAt") VALUES (${chapterId}, 'novel', ${content}, ${updatedAt})`;
    await runWithExecutionScope(
      { fence: { kind: "chapter_content", novelId: "novel", chapterId, content } },
      () =>
        client.appSetting.updateMany({
          where: { key: "result" },
          data: { value: `accepted-${index}` },
        }),
    );
    const chapter = await raw.chapter.findUnique({
      where: { id: chapterId },
      select: { content: true, updatedAt: true },
    });
    assert.equal(chapter.content, content);
    assert.equal(chapter.updatedAt.toISOString(), updatedAt.toISOString());
  }
});

test("a chapter content fence rejects stale finalization and rolls back in-transaction content changes", async (t) => {
  const { raw, client, value } = await fixture(t);
  await raw.$executeRaw`INSERT INTO "Chapter" ("id", "novelId", "content", "updatedAt") VALUES ('chapter', 'novel', 'new manuscript', ${new Date()})`;
  const fence = {
    kind: "chapter_content",
    novelId: "novel",
    chapterId: "chapter",
    content: "old manuscript",
  };
  await assert.rejects(
    runWithExecutionScope({ fence }, () =>
      client.appSetting.updateMany({
        where: { key: "result" },
        data: { value: "stale audit" },
      }),
    ),
    { name: "ExecutionStoppedError" },
  );
  assert.deepEqual(await value(), { value: "original" });

  await assert.rejects(
    runWithExecutionScope({ fence: { ...fence, content: "new manuscript" } }, () =>
      client.$transaction(async (tx) => {
        await tx.appSetting.updateMany({
          where: { key: "result" },
          data: { value: "uncommitted audit" },
        });
        await tx.chapter.updateMany({
          where: { id: "chapter" },
          data: { content: "unexpected change" },
        });
      }),
    ),
    { name: "ExecutionStoppedError" },
  );
  assert.deepEqual(await value(), { value: "original" });
  assert.deepEqual(
    await raw.chapter.findUnique({ where: { id: "chapter" }, select: { content: true } }),
    { content: "new manuscript" },
  );
});

test("restoration fences reject a replaced claim and do not renew heartbeat timestamps", async (t) => {
  const { raw, client, value } = await fixture(t);
  const updatedAt = new Date("2026-10-01T00:00:00.000Z");
  const metadataJson = JSON.stringify({ lease: "first", snapshotId: "snapshot" });
  await raw.$executeRaw`INSERT INTO "ChapterArtifactSyncCheckpoint" ("id", "status", "metadataJson", "updatedAt") VALUES ('restore', 'running', ${metadataJson}, ${updatedAt})`;
  const fence = { kind: "snapshot_restore", checkpointId: "restore", metadataJson };
  await runWithExecutionScope({ fence }, () =>
    client.appSetting.updateMany({
      where: { key: "result" },
      data: { value: "first reconstruction" },
    }),
  );
  const checkpoint = await raw.chapterArtifactSyncCheckpoint.findUnique({
    where: { id: "restore" },
    select: { updatedAt: true },
  });
  assert.equal(checkpoint.updatedAt.toISOString(), updatedAt.toISOString());
  await raw.chapterArtifactSyncCheckpoint.updateMany({
    where: { id: "restore" },
    data: { metadataJson: JSON.stringify({ lease: "replacement", snapshotId: "snapshot" }) },
  });
  await assert.rejects(
    runWithExecutionScope({ fence }, () =>
      client.appSetting.updateMany({
        where: { key: "result" },
        data: { value: "late reconstruction" },
      }),
    ),
    { name: "ExecutionStoppedError" },
  );
  assert.deepEqual(await value(), { value: "first reconstruction" });
});

test("adding another identity inside a held transaction fails closed and rolls back", async (t) => {
  const { client, fence, value } = await fixture(t);
  await assert.rejects(
    runWithExecutionScope({ fence }, () =>
      client.$transaction(async (tx) => {
        await tx.appSetting.updateMany({
          where: { key: "result" },
          data: { value: "uncommitted" },
        });
        await runWithExecutionScope({ fence: { kind: "agent", runId: "unknown" } }, () =>
          tx.appSetting.updateMany({ where: { key: "result" }, data: { value: "unguarded" } }),
        );
      }),
    ),
    { name: "ExecutionStoppedError" },
  );
  assert.deepEqual(await value(), { value: "original" });
});

test("only an owned cancellation command may write after the director task is cancelled", async (t) => {
  const { raw, client, fence, value } = await fixture(t);
  await raw.novelWorkflowTask.updateMany({ where: { id: "task" }, data: { status: "cancelled" } });
  const cancelFence = { ...fence, controlAction: "cancel" };
  const save = () =>
    client.appSetting.updateMany({ where: { key: "result" }, data: { value: "cancel cleanup" } });
  await assert.rejects(runWithExecutionScope({ fence: cancelFence }, save), {
    name: "ExecutionStoppedError",
  });
  await raw.directorRunCommand.updateMany({
    where: { id: "cmd" },
    data: { commandType: "cancel" },
  });
  await runWithExecutionScope({ fence: cancelFence }, save);
  assert.deepEqual(await value(), { value: "cancel cleanup" });
  await raw.directorRunCommand.updateMany({
    where: { id: "cmd" },
    data: { leaseOwner: "replacement" },
  });
  await assert.rejects(runWithExecutionScope({ fence: cancelFence }, save), {
    name: "ExecutionStoppedError",
  });
});

test("the Prisma adapter observes whole-delegate replacement and restoration", async (t) => {
  const { client } = await fixture(t);
  const original = client.appSetting;
  assert.equal(client.appSetting, original, "a stable source delegate should retain its wrapper");
  client.appSetting = {
    findMany: async () => [{ key: "replacement", value: "mock delegate" }],
    findFirst: async () => ({ key: "replacement", value: "mock delegate" }),
  };
  assert.deepEqual(await client.appSetting.findFirst(), {
    key: "replacement",
    value: "mock delegate",
  });
  client.appSetting = original;
  assert.deepEqual(
    await client.appSetting.findUnique({ where: { key: "result" }, select: { value: true } }),
    { value: "original" },
  );
});
