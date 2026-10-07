const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { prisma } = require("../dist/db/prisma.js");
const {
  ChapterArtifactDeltaService,
  buildContentHash,
} = require("../dist/services/novel/runtime/ChapterArtifactDeltaService.js");
const {
  ChapterArtifactBackgroundSyncService,
} = require("../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService.js");
const { payoffLedgerSyncService } = require("../dist/services/payoff/PayoffLedgerSyncService.js");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("knowledge extraction preserves the state committed after the character roster was read", async () => {
  const originalTransaction = prisma.$transaction;
  let currentState = "已突破金丹，渡劫完成";
  prisma.$transaction = async (run) =>
    run({
      character: {
        findUnique: async () => ({ currentState }),
        update: async ({ data }) => {
          currentState = data.currentState;
        },
        updateMany: async ({ where, data }) => {
          if (where.currentState !== currentState) return { count: 0 };
          currentState = data.currentState;
          return { count: 1 };
        },
      },
    });
  try {
    await new ChapterArtifactDeltaService().applyKnowledgeStates({
      characters: [{ id: "hero", name: "主角", currentState: "渡劫前，尚未突破" }],
      output: {
        characterKnowledgeStates: [
          { characterName: "主角", knownFacts: ["师傅的身份"], hiddenFacts: [] },
        ],
      },
    });
    assert.match(currentState, /已突破金丹，渡劫完成/);
    assert.match(currentState, /已知：师傅的身份/);
    assert.doesNotMatch(currentState, /尚未突破/);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("knowledge extraction retries its merge if another writer changes the character state", async () => {
  const originalTransaction = prisma.$transaction;
  let currentState = "金丹初期";
  let concurrentWritePending = true;
  prisma.$transaction = async (run) =>
    run({
      character: {
        findUnique: async () => ({ currentState }),
        update: async ({ data }) => {
          currentState = data.currentState;
        },
        updateMany: async ({ where, data }) => {
          if (concurrentWritePending) {
            currentState = "金丹中期，已离开山门";
            concurrentWritePending = false;
          }
          if (where.currentState !== currentState) return { count: 0 };
          currentState = data.currentState;
          return { count: 1 };
        },
      },
    });
  try {
    await new ChapterArtifactDeltaService().applyKnowledgeStates({
      characters: [{ id: "hero", name: "主角", currentState: "渡劫前" }],
      output: {
        characterKnowledgeStates: [
          { characterName: "主角", knownFacts: ["师傅的身份"], hiddenFacts: [] },
        ],
      },
    });
    assert.match(currentState, /金丹中期，已离开山门/);
    assert.match(currentState, /已知：师傅的身份/);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

function installSyncStore() {
  const originals = {
    chapter: prisma.chapter.findFirst,
    findUnique: prisma.chapterArtifactSyncCheckpoint.findUnique,
    create: prisma.chapterArtifactSyncCheckpoint.create,
    updateMany: prisma.chapterArtifactSyncCheckpoint.updateMany,
    upsert: prisma.chapterArtifactSyncCheckpoint.upsert,
    syncLedger: payoffLedgerSyncService.syncLedger,
  };
  const rows = new Map();
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((branch) => matches(row, branch));
      if (value instanceof Date) return row[key]?.getTime() === value.getTime();
      if (value && typeof value === "object") {
        if ("lt" in value) return row[key] < value.lt;
        if ("not" in value) return row[key] !== value.not;
      }
      return row[key] === value;
    });
  prisma.chapter.findFirst = async () => ({ id: "chapter", order: 2, title: "第二章" });
  prisma.chapterArtifactSyncCheckpoint.findUnique = async ({ where }) => {
    const row = rows.get(where.novelId_chapterId_contentHash_artifactType_syncMode.artifactType);
    return row ? { ...row } : null;
  };
  prisma.chapterArtifactSyncCheckpoint.create = async ({ data }) => {
    if (rows.has(data.artifactType)) throw new Error("unique checkpoint");
    const row = { updatedAt: new Date(), ...data };
    rows.set(data.artifactType, row);
    return row;
  };
  prisma.chapterArtifactSyncCheckpoint.updateMany = async ({ where, data }) => {
    const row = rows.get(where.artifactType);
    if (!row || !matches(row, where)) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  };
  prisma.chapterArtifactSyncCheckpoint.upsert = async ({ where, create, update }) => {
    const key = where.novelId_chapterId_contentHash_artifactType_syncMode.artifactType;
    const row = rows.get(key);
    if (row) Object.assign(row, update);
    else rows.set(key, { updatedAt: new Date(), ...create });
  };
  return {
    rows,
    restore() {
      prisma.chapter.findFirst = originals.chapter;
      payoffLedgerSyncService.syncLedger = originals.syncLedger;
      for (const key of ["findUnique", "create", "updateMany", "upsert"]) {
        prisma.chapterArtifactSyncCheckpoint[key] = originals[key];
      }
    },
  };
}

function createSyncService(extract, timing = {}) {
  const service = new ChapterArtifactBackgroundSyncService({
    pollIntervalMs: 1,
    waitTimeoutMs: 1000,
    ...timing,
  });
  service.runTrackedActivity = async (_novel, _chapter, _kind, run) => run();
  service.shouldRunPayoffFullReconcile = async () => false;
  service.getArtifactDeltaService = () => ({
    syncChapterArtifacts: async () => {
      await extract();
      return { requiresFullReconcile: false, output: { syncPlan: {}, confidence: 1 } };
    },
  });
  return service;
}

function createReconcileService(extract, requiresFullReconcile = true, timing = {}) {
  const service = createSyncService(extract, timing);
  delete service.shouldRunPayoffFullReconcile;
  service.isVolumeTail = async () => false;
  service.getArtifactDeltaService = () => ({
    syncChapterArtifacts: async () => {
      await extract();
      return {
        requiresFullReconcile,
        output: { syncPlan: { payoffLedger: "delta" }, confidence: 1 },
      };
    },
  });
  return service;
}

for (const crossInstance of [false, true]) {
  test(`awaited artifact sync waits for ${crossInstance ? "another instance" : "the same instance"} to finish`, async () => {
    const store = installSyncStore();
    const started = deferred();
    const finish = deferred();
    let calls = 0;
    const extract = async () => {
      calls++;
      started.resolve();
      await finish.promise;
    };
    const firstService = createSyncService(extract);
    const secondService = crossInstance ? createSyncService(extract) : firstService;
    let first;
    let second;
    try {
      first = firstService.runChapterSyncNow("novel", "chapter", "正文");
      await started.promise;
      let secondFinished = false;
      second = secondService.runChapterSyncNow("novel", "chapter", "正文").then(() => {
        secondFinished = true;
      });
      await delay(5);
      assert.equal(
        secondFinished,
        false,
        "the next chapter must not start before asset extraction completes",
      );
      finish.resolve();
      await Promise.all([first, second]);
      assert.equal(calls, 1);
    } finally {
      finish.resolve();
      await Promise.allSettled([first, second]);
      store.restore();
    }
  });
}

test("artifact extraction failures return an explicit failure and remain retryable", async () => {
  const store = installSyncStore();
  let calls = 0;
  const service = createSyncService(async () => {
    if (++calls === 1) throw new Error("temporary extraction failure");
  });
  try {
    const failed = await service.runChapterSyncNow("novel", "chapter", "正文");
    assert.equal(failed.status, "failed");
    assert.match(failed.error, /temporary extraction failure/);
    assert.equal(store.rows.get("artifact_delta").status, "failed");
    await service.runChapterSyncNow("novel", "chapter", "正文");
    assert.equal(calls, 2);
    assert.equal(store.rows.get("artifact_delta").status, "succeeded");
  } finally {
    store.restore();
  }
});

test("a waiter retries extraction after the other checkpoint owner fails", async () => {
  const store = installSyncStore();
  const started = deferred();
  const finish = deferred();
  const firstService = createSyncService(async () => {
    started.resolve();
    await finish.promise;
    throw new Error("owner failed");
  });
  let recoveredCalls = 0;
  const secondService = createSyncService(async () => {
    recoveredCalls++;
  });
  const first = firstService.runChapterSyncNow("novel", "chapter", "正文").catch(() => {});
  let second;
  try {
    await started.promise;
    second = secondService.runChapterSyncNow("novel", "chapter", "正文");
    await delay(5);
    finish.resolve();
    await Promise.all([first, second]);
    assert.equal(recoveredCalls, 1);
    assert.equal(store.rows.get("artifact_delta").status, "succeeded");
  } finally {
    finish.resolve();
    await Promise.allSettled([first, second]);
    store.restore();
  }
});

test("waiting for another owner is bounded and a timeout is not cached as success", async () => {
  const store = installSyncStore();
  const started = deferred();
  const finish = deferred();
  const firstService = createSyncService(async () => {
    started.resolve();
    await finish.promise;
  });
  const secondService = createSyncService(async () => {}, { waitTimeoutMs: 5 });
  const first = firstService.runChapterSyncNow("novel", "chapter", "正文");
  try {
    await started.promise;
    const result = await secondService.runChapterSyncNow("novel", "chapter", "正文");
    assert.equal(result.status, "failed");
    assert.match(result.error, /等待.*超时/);
    finish.resolve();
    await first;
    await secondService.runChapterSyncNow("novel", "chapter", "正文");
    assert.equal(store.rows.get("artifact_delta").status, "succeeded");
  } finally {
    finish.resolve();
    await first;
    store.restore();
  }
});

test("an active extraction renews its persistent checkpoint until it finishes", async () => {
  const store = installSyncStore();
  const started = deferred();
  const finish = deferred();
  const service = createSyncService(
    async () => {
      started.resolve();
      await finish.promise;
    },
    {
      heartbeatIntervalMs: 5,
      runningStaleMs: 50,
    },
  );
  const run = service.runChapterSyncNow("novel", "chapter", "正文");
  try {
    await started.promise;
    const initialUpdatedAt = store.rows.get("artifact_delta").updatedAt;
    const initialLease = store.rows.get("artifact_delta").metadataJson;
    await delay(20);
    assert.ok(store.rows.get("artifact_delta").updatedAt > initialUpdatedAt);
    assert.equal(store.rows.get("artifact_delta").metadataJson, initialLease);
    finish.resolve();
    assert.equal((await run).status, "succeeded");
  } finally {
    finish.resolve();
    await run;
    store.restore();
  }
});

test("a stale owner cannot complete or fail a checkpoint reclaimed by another instance", async () => {
  const store = installSyncStore();
  const started = deferred();
  const finish = deferred();
  const firstService = createSyncService(
    async () => {
      started.resolve();
      await finish.promise;
    },
    {
      heartbeatIntervalMs: 1000,
      runningStaleMs: 5,
    },
  );
  let recoveryCalls = 0;
  const secondService = createSyncService(
    async () => {
      recoveryCalls++;
    },
    { runningStaleMs: 5 },
  );
  const first = firstService.runChapterSyncNow("novel", "chapter", "正文");
  try {
    await started.promise;
    await delay(10);
    assert.equal(
      (await secondService.runChapterSyncNow("novel", "chapter", "正文")).status,
      "succeeded",
    );
    const successfulCheckpoint = { ...store.rows.get("artifact_delta") };
    finish.resolve();
    const staleResult = await first;
    assert.equal(staleResult.status, "failed");
    assert.match(staleResult.error, /租约已失效/);
    assert.equal(recoveryCalls, 1);
    assert.deepEqual(store.rows.get("artifact_delta"), successfulCheckpoint);
  } finally {
    finish.resolve();
    await first;
    store.restore();
  }
});

for (const freshInstance of [false, true]) {
  test(`failed full reconciliation resumes without re-extracting the delta${freshInstance ? " after restart" : " on retry"}`, async () => {
    const store = installSyncStore();
    let deltaCalls = 0;
    let reconcileCalls = 0;
    payoffLedgerSyncService.syncLedger = async () => {
      if (++reconcileCalls === 1) throw new Error("temporary full reconciliation failure");
    };
    const firstService = createReconcileService(async () => {
      deltaCalls++;
    });
    const secondService = freshInstance
      ? createReconcileService(async () => {
          deltaCalls++;
        }, false)
      : firstService;
    try {
      const first = await firstService.runChapterSyncNow("novel", "chapter", "正文", {
        artifactSyncMode: "deferred",
      });
      assert.equal(first.status, "failed");
      assert.equal(store.rows.get("artifact_delta").status, "succeeded");
      assert.equal(store.rows.get("payoff_ledger_full_reconcile").status, "failed");
      const second = await secondService.runChapterSyncNow("novel", "chapter", "正文", {
        artifactSyncMode: "deferred",
      });
      assert.equal(second.status, "succeeded");
      assert.equal(deltaCalls, 1);
      assert.equal(
        reconcileCalls,
        2,
        "a completed delta must not hide unfinished full reconciliation",
      );
      assert.equal(store.rows.get("payoff_ledger_full_reconcile").status, "succeeded");
      assert.equal(
        JSON.parse(store.rows.get("artifact_delta").metadataJson).requiresFullReconcile,
        true,
      );
      await secondService.runChapterSyncNow("novel", "chapter", "正文", {
        artifactSyncMode: "deferred",
      });
      assert.equal(reconcileCalls, 2);
    } finally {
      store.restore();
    }
  });
}

test("another instance waits for required full reconciliation after the delta is complete", async () => {
  const store = installSyncStore();
  const started = deferred();
  const finish = deferred();
  let deltaCalls = 0;
  let reconcileCalls = 0;
  payoffLedgerSyncService.syncLedger = async () => {
    reconcileCalls++;
    started.resolve();
    await finish.promise;
  };
  const firstService = createReconcileService(async () => {
    deltaCalls++;
  });
  const secondService = createReconcileService(async () => {
    deltaCalls++;
  }, false);
  const first = firstService.runChapterSyncNow("novel", "chapter", "正文", {
    artifactSyncMode: "deferred",
  });
  let second;
  try {
    await started.promise;
    assert.equal(store.rows.get("artifact_delta").status, "succeeded");
    let secondFinished = false;
    second = secondService
      .runChapterSyncNow("novel", "chapter", "正文", { artifactSyncMode: "deferred" })
      .then((result) => {
        secondFinished = true;
        return result;
      });
    await delay(5);
    assert.equal(secondFinished, false, "await must include the required full reconciliation");
    finish.resolve();
    assert.deepEqual(
      (await Promise.all([first, second])).map((result) => result.status),
      ["succeeded", "succeeded"],
    );
    assert.equal(deltaCalls, 1);
    assert.equal(reconcileCalls, 1);
  } finally {
    finish.resolve();
    await Promise.allSettled([first, second]);
    store.restore();
  }
});

test("legacy delta metadata restores the structured full-reconcile requirement", async () => {
  const store = installSyncStore();
  store.rows.set("artifact_delta", {
    novelId: "novel",
    chapterId: "chapter",
    contentHash: buildContentHash("正文"),
    artifactType: "artifact_delta",
    syncMode: "deferred",
    status: "succeeded",
    updatedAt: new Date(),
    metadataJson: JSON.stringify({ syncPlan: { payoffLedger: "full_reconcile" } }),
  });
  let deltaCalls = 0;
  let reconcileCalls = 0;
  const service = createReconcileService(async () => {
    deltaCalls++;
  }, false);
  payoffLedgerSyncService.syncLedger = async () => {
    reconcileCalls++;
  };
  try {
    const result = await service.runChapterSyncNow("novel", "chapter", "正文", {
      artifactSyncMode: "deferred",
    });
    assert.equal(result.status, "succeeded");
    assert.equal(deltaCalls, 0);
    assert.equal(reconcileCalls, 1);
  } finally {
    store.restore();
  }
});

test("full reconciliation renews its own checkpoint until it finishes", async () => {
  const store = installSyncStore();
  const started = deferred();
  const finish = deferred();
  const service = createReconcileService(async () => {}, true, {
    heartbeatIntervalMs: 5,
    runningStaleMs: 50,
  });
  payoffLedgerSyncService.syncLedger = async () => {
    started.resolve();
    await finish.promise;
  };
  const run = service.runChapterSyncNow("novel", "chapter", "正文", {
    artifactSyncMode: "deferred",
  });
  try {
    await started.promise;
    const checkpoint = store.rows.get("payoff_ledger_full_reconcile");
    assert.equal(checkpoint?.status, "running");
    const initialUpdatedAt = checkpoint.updatedAt;
    const initialLease = checkpoint.metadataJson;
    await delay(20);
    assert.ok(checkpoint.updatedAt > initialUpdatedAt);
    assert.equal(checkpoint.metadataJson, initialLease);
    finish.resolve();
    assert.equal((await run).status, "succeeded");
  } finally {
    finish.resolve();
    await run;
    store.restore();
  }
});

test("a stale full-reconciliation owner cannot overwrite a recovered checkpoint", async () => {
  const store = installSyncStore();
  const started = deferred();
  const finish = deferred();
  let reconcileCalls = 0;
  payoffLedgerSyncService.syncLedger = async () => {
    if (++reconcileCalls === 1) {
      started.resolve();
      await finish.promise;
    }
  };
  const firstService = createReconcileService(async () => {}, true, {
    heartbeatIntervalMs: 1000,
    runningStaleMs: 5,
  });
  const secondService = createReconcileService(
    async () => assert.fail("delta must be reused"),
    false,
    { runningStaleMs: 5 },
  );
  const first = firstService.runChapterSyncNow("novel", "chapter", "正文", {
    artifactSyncMode: "deferred",
  });
  try {
    await started.promise;
    await delay(10);
    assert.equal(
      (
        await secondService.runChapterSyncNow("novel", "chapter", "正文", {
          artifactSyncMode: "deferred",
        })
      ).status,
      "succeeded",
    );
    const recoveredCheckpoint = { ...store.rows.get("payoff_ledger_full_reconcile") };
    finish.resolve();
    assert.equal((await first).status, "failed");
    assert.equal(reconcileCalls, 2);
    assert.deepEqual(store.rows.get("payoff_ledger_full_reconcile"), recoveredCheckpoint);
  } finally {
    finish.resolve();
    await first;
    store.restore();
  }
});

test("a missing chapter returns failure without entering the success cache", async () => {
  const store = installSyncStore();
  const findExistingChapter = prisma.chapter.findFirst;
  prisma.chapter.findFirst = async () => null;
  let calls = 0;
  const service = createSyncService(async () => {
    calls++;
  });
  try {
    assert.equal((await service.runChapterSyncNow("novel", "chapter", "正文")).status, "failed");
    prisma.chapter.findFirst = findExistingChapter;
    assert.equal((await service.runChapterSyncNow("novel", "chapter", "正文")).status, "succeeded");
    assert.equal(calls, 1);
  } finally {
    store.restore();
  }
});
