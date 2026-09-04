const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createTempDatabase, runChildScenario } = require("./support/realSqliteHarness.cjs");

const scenario = path.join(__dirname, "support", "longFormProductionAcceptanceChild.cjs");

function run(database, action, ...args) {
  return runChildScenario({ database, script: scenario, args: [action, ...args.map(String)], cleanup: false });
}

test("100-chapter recorded production survives replay and preserves book evidence", { timeout: 180_000 }, () => {
  const database = createTempDatabase({ prefix: "long-form-production-acceptance" });
  try {
    run(database, "seed");
    run(database, "run", 1, 60);

    // A restarted process may replay the last safe chapters before continuing.
    run(database, "run", 30, 30);
    run(database, "run", 60, 100);
    run(database, "finalize");

    const inspection = JSON.parse(run(database, "inspect").stdout.trim());
    assert.equal(inspection.chapterCount, 100);
    assert.deepEqual(inspection.chapterOrders, Array.from({ length: 100 }, (_, index) => index + 1));
    assert.equal(inspection.generatedCount, 100);
    assert.deepEqual(inspection.volumeSizes, [25, 25, 25, 25]);
    assert.equal(inspection.summaries, 100);
    assert.equal(inspection.snapshots, 100);
    assert.equal(inspection.facts, 100);
    assert.equal(inspection.contextEvidenceCount, 100);
    assert.ok(inspection.compressedEvidenceCount >= 70);
    assert.ok(inspection.maxEstimatedInputTokens <= 2100);

    assert.deepEqual(inspection.payoff.evidence.map((item) => item.chapterOrder), [1, 30, 60, 100]);
    assert.equal(inspection.payoff.status, "paid_off");
    assert.equal(inspection.payoff.setupChapterId, "long-form-chapter-001");
    assert.equal(inspection.payoff.payoffChapterId, "long-form-chapter-100");

    assert.equal(inspection.task.status, "succeeded");
    assert.equal(inspection.task.progress, 1);
    assert.equal(inspection.task.checkpointType, "chapter_committed");
    assert.equal(inspection.task.checkpointSummary, "已安全写入第100章");
    assert.equal(inspection.task.llmCallCount, 100);
    assert.equal(inspection.task.totalTokens, 250000);
  } finally {
    database.cleanup();
  }
});
