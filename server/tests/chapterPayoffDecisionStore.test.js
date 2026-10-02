const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { ChapterPayoffDecisionStore } = require("../dist/services/novel/production/payoff/infrastructure/ChapterPayoffDecisionStore.js");

const initialUpdatedAt = new Date("2026-10-02T00:00:00Z");
function directive(operation = "touch") {
  return { ledgerKey: "identity", title: "真正身份", operation, reason: "本章执行合同", forbiddenReveal: null };
}
function record(fingerprint, directives) {
  return { version: 1, fingerprint, directives };
}
function installStore(metadata = { executionContractHash: "contract-v1", objective: "调查身份" }) {
  const original = { findUnique: prisma.storyPlan.findUnique, transaction: prisma.$transaction };
  let plan = { rawPlanJson: typeof metadata === "string" ? metadata : JSON.stringify(metadata), updatedAt: initialUpdatedAt };
  let beforeUpdate = () => {};
  let writes = 0;
  const findUnique = async () => plan ? { ...plan } : null;
  prisma.storyPlan.findUnique = findUnique;
  prisma.$transaction = async (run) => run({ storyPlan: {
    findUnique,
    updateMany: async ({ where, data }) => {
      beforeUpdate();
      if (!plan || where.rawPlanJson !== plan.rawPlanJson || where.updatedAt.getTime() !== plan.updatedAt.getTime()) return { count: 0 };
      plan = { ...plan, ...data, updatedAt: new Date(plan.updatedAt.getTime() + 1) };
      writes++;
      return { count: 1 };
    },
  } });
  return {
    get plan() { return plan; },
    get writes() { return writes; },
    setPlan(next) { plan = next; },
    setBeforeUpdate(callback) { beforeUpdate = callback; },
    restore() { prisma.storyPlan.findUnique = original.findUnique; prisma.$transaction = original.transaction; },
  };
}

test("payoff decisions survive fresh store instances and are scoped to the contract fingerprint", async () => {
  const db = installStore();
  try {
    const result = await new ChapterPayoffDecisionStore().save("plan", "fingerprint-v1", [directive()], {
      expectedExecutionContractHash: "contract-v1", expectedPlanUpdatedAt: initialUpdatedAt,
    });
    assert.deepEqual(result, [directive()]);
    assert.deepEqual(await new ChapterPayoffDecisionStore().read("plan", "fingerprint-v1"), result);
    assert.equal(await new ChapterPayoffDecisionStore().read("plan", "fingerprint-v2"), null);
    const metadata = JSON.parse(db.plan.rawPlanJson);
    assert.equal(metadata.executionContractHash, "contract-v1");
    assert.equal(metadata.objective, "调查身份");
  } finally { db.restore(); }
});

test("a concurrent matching decision wins without replacing it with a second AI output", async () => {
  const db = installStore();
  let first = true;
  db.setBeforeUpdate(() => {
    if (!first) return;
    first = false;
    const current = JSON.parse(db.plan.rawPlanJson);
    db.setPlan({ rawPlanJson: JSON.stringify({ ...current, chapterPayoffDecision: record("same-contract", [directive("payoff")]) }), updatedAt: new Date(initialUpdatedAt.getTime() + 1) });
  });
  try {
    const result = await new ChapterPayoffDecisionStore().save("plan", "same-contract", [directive("pressure")], {
      expectedExecutionContractHash: "contract-v1", expectedPlanUpdatedAt: initialUpdatedAt,
    });
    assert.equal(result[0].operation, "payoff");
    assert.equal(db.writes, 0);
  } finally { db.restore(); }
});

test("CAS retries preserve unrelated metadata written by another owner", async () => {
  const db = installStore();
  let first = true;
  db.setBeforeUpdate(() => {
    if (!first) return;
    first = false;
    db.setPlan({ rawPlanJson: JSON.stringify({ ...JSON.parse(db.plan.rawPlanJson), otherFeature: { accepted: true } }), updatedAt: new Date(initialUpdatedAt.getTime() + 1) });
  });
  try {
    await new ChapterPayoffDecisionStore().save("plan", "same-contract", [directive()], { expectedExecutionContractHash: "contract-v1" });
    const metadata = JSON.parse(db.plan.rawPlanJson);
    assert.deepEqual(metadata.otherFeature, { accepted: true });
    assert.equal(metadata.chapterPayoffDecision.fingerprint, "same-contract");
    assert.equal(db.writes, 1);
  } finally { db.restore(); }
});

test("an old AI result cannot overwrite a new execution contract", async () => {
  const db = installStore();
  db.setBeforeUpdate(() => {
    db.setPlan({ rawPlanJson: JSON.stringify({ executionContractHash: "contract-v2", objective: "揭露身份" }), updatedAt: new Date(initialUpdatedAt.getTime() + 1) });
  });
  try {
    await assert.rejects(new ChapterPayoffDecisionStore().save("plan", "old-contract", [directive()], {
      expectedExecutionContractHash: "contract-v1",
    }), /执行合同已变更/);
    assert.equal(db.writes, 0);
    assert.equal(JSON.parse(db.plan.rawPlanJson).objective, "揭露身份");
  } finally { db.restore(); }
});

test("a regenerated plan with the same chapter contract still rejects a stale plan revision", async () => {
  const db = installStore();
  db.setPlan({ rawPlanJson: JSON.stringify({ executionContractHash: "contract-v1", objective: "新的同章计划" }), updatedAt: new Date(initialUpdatedAt.getTime() + 1) });
  try {
    await assert.rejects(new ChapterPayoffDecisionStore().save("plan", "old-plan", [directive()], {
      expectedExecutionContractHash: "contract-v1", expectedPlanUpdatedAt: initialUpdatedAt,
    }), /章节计划已变更/);
    assert.equal(db.writes, 0);
  } finally { db.restore(); }
});

test("corrupt plan metadata is never overwritten by a payoff cache write", async () => {
  const db = installStore("broken JSON");
  try {
    const store = new ChapterPayoffDecisionStore();
    assert.equal(await store.read("plan", "contract"), null);
    await assert.rejects(store.save("plan", "contract", [directive()]));
    assert.equal(db.plan.rawPlanJson, "broken JSON");
    assert.equal(db.writes, 0);
  } finally { db.restore(); }
});

test("repeated CAS conflicts fail explicitly without claiming the decision was saved", async () => {
  const db = installStore();
  let conflicts = 0;
  db.setBeforeUpdate(() => {
    conflicts++;
    db.setPlan({ ...db.plan, updatedAt: new Date(db.plan.updatedAt.getTime() + 1) });
  });
  try {
    await assert.rejects(new ChapterPayoffDecisionStore().save("plan", "contract", [directive()]), /尚未保存/);
    assert.equal(conflicts, 4);
    assert.equal(db.writes, 0);
  } finally { db.restore(); }
});
