const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { payoffLedgerSyncService } = require("../dist/services/payoff/PayoffLedgerSyncService.js");
const {
  payoffLedgerSyncPrompt,
} = require("../dist/prompting/prompts/payoff/payoffLedgerSync.prompts.js");

const source = {
  kind: "major_payoff",
  refId: "book_contract.chapter3Payoff",
  refLabel: "前三章阶段回报",
};
function paidRow() {
  return {
    id: "ledger-1",
    novelId: "novel-1",
    ledgerKey: "early-reward",
    title: "前三章阶段回报",
    summary: "主角取得首次可使用的社团权限",
    scopeType: "book",
    currentStatus: "paid_off",
    targetStartChapterOrder: 1,
    targetEndChapterOrder: 3,
    firstSeenChapterOrder: 1,
    lastTouchedChapterOrder: 3,
    lastTouchedChapterId: "chapter-3",
    setupChapterId: "chapter-1",
    payoffChapterId: "chapter-3",
    lastSnapshotId: null,
    sourceRefsJson: JSON.stringify([source]),
    evidenceJson: JSON.stringify([
      { summary: "主角成功使用权限打开训练室。", chapterId: "chapter-3", chapterOrder: 3 },
    ]),
    riskSignalsJson: "[]",
    statusReason: "第三章已完成",
    confidence: 0.95,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}
function outputItem(overrides = {}) {
  return {
    ledgerKey: "early-reward",
    identityDecision: {
      action: "reuse",
      existingLedgerKey: "early-reward",
      reason: "同一阶段回报已经兑现",
    },
    title: "前三章阶段回报",
    summary: "主角取得首次可使用的社团权限",
    scopeType: "book",
    currentStatus: "paid_off",
    targetStartChapterOrder: 1,
    targetEndChapterOrder: 3,
    payoffChapterOrder: 3,
    sourceRefs: [source],
    evidence: [],
    riskSignals: [],
    ...overrides,
  };
}
function promptInput() {
  const row = paidRow();
  return {
    existingLedgerItems: [{ ...row, sourceRefs: [source], evidence: JSON.parse(row.evidenceJson) }],
    bookContractPayoffs: [
      { ...source, payoff: row.summary, targetStartChapterOrder: 1, targetEndChapterOrder: 3 },
    ],
  };
}

test("sync reuses a fulfilled early-book promise at chapter 80 without adding overdue debt", async () => {
  const restores = [];
  const stub = (obj, key, value) => {
    const old = obj[key];
    obj[key] = value;
    restores.push(() => {
      obj[key] = old;
    });
  };
  let rows = [paidRow()];
  let captured;
  let validated = 0;
  stub(prisma.payoffLedgerItem, "findMany", async () => rows);
  stub(prisma.novel, "findUnique", async () => ({
    title: "测试小说",
    storyMacroPlan: null,
    bookContract: { chapter3Payoff: rows[0].summary },
  }));
  for (const model of [
    prisma.volumePlan,
    prisma.volumeChapterPlan,
    prisma.openConflict,
    prisma.auditReport,
  ])
    stub(model, "findMany", async () => []);
  stub(prisma.storyStateSnapshot, "findFirst", async () => null);
  stub(prisma.chapter, "findMany", async () => [
    { id: "chapter-1", order: 1 },
    { id: "chapter-3", order: 3 },
    { id: "chapter-80", order: 80 },
  ]);
  stub(promptRunner, "runStructuredPrompt", async ({ asset, promptInput }) => {
    captured = promptInput;
    const output = { items: [outputItem()] };
    asset.postValidate(output, promptInput);
    validated++;
    return { output };
  });
  stub(prisma, "$transaction", async (fn) =>
    fn({
      payoffLedgerItem: {
        upsert: async ({ where, create, update }) => {
          const index = rows.findIndex(
            (row) => row.ledgerKey === where.novelId_ledgerKey.ledgerKey,
          );
          if (index < 0) rows.push({ ...paidRow(), ...create });
          else rows[index] = { ...rows[index], ...update };
        },
        update: async ({ where, data }) => {
          rows = rows.map((row) => (row.id === where.id ? { ...row, ...data } : row));
        },
      },
      openConflict: { updateMany: async () => ({ count: 1 }), create: async () => {} },
    }),
  );
  try {
    for (let run = 0; run < 2; run++) {
      const result = await payoffLedgerSyncService.syncLedger("novel-1", {
        chapterOrder: 80,
        sourceChapterId: "chapter-80",
      });
      assert.equal(result.summary.overdueCount, 0);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].currentStatus, "paid_off");
      assert.equal(result.items[0].payoffChapterId, "chapter-3");
      assert.ok(result.items[0].evidence.some((item) => item.summary.includes("训练室")));
    }
    assert.equal(
      validated,
      2,
      "fulfilled promise must complete validation, not silently fall back to stale ledger",
    );
    assert.equal(captured.existingLedgerItems[0].sourceRefs[0].refId, source.refId);
    assert.ok(captured.existingLedgerItems[0].evidence.length > 0);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("paid-off identity cannot be reopened as overdue", () => {
  assert.throws(() =>
    payoffLedgerSyncPrompt.postValidate(
      { items: [outputItem({ currentStatus: "overdue" })] },
      promptInput(),
    ),
  );
});

test("one fixed book-contract source cannot be assigned to two output identities", () => {
  const items = [
    outputItem({ ledgerKey: "new-a", identityDecision: { action: "create", reason: "新回报" } }),
    outputItem({ ledgerKey: "new-b", identityDecision: { action: "create", reason: "另一回报" } }),
  ];
  assert.throws(() =>
    payoffLedgerSyncPrompt.postValidate({ items }, { ...promptInput(), existingLedgerItems: [] }),
  );
});

test("a fulfilled source cannot silently become a new overdue obligation", () => {
  const item = outputItem({
    ledgerKey: "early-reward-again",
    currentStatus: "overdue",
    identityDecision: { action: "create", reason: "新建前三章回报" },
  });
  assert.throws(
    () => payoffLedgerSyncPrompt.postValidate({ items: [item] }, promptInput()),
    /sourceReplacements/,
  );
});

test("an AI-confirmed changed promise may replace a source while preserving fulfilled history", () => {
  const item = outputItem({
    ledgerKey: "changed-promise",
    currentStatus: "pending_payoff",
    identityDecision: { action: "create", reason: "书契约把训练室权限改成赢得校赛" },
    sourceReplacements: [
      {
        refId: source.refId,
        previousLedgerKey: "early-reward",
        reason: "书契约明确改写为赢得校赛，原权限兑现不满足新承诺",
      },
    ],
  });
  assert.doesNotThrow(() => payoffLedgerSyncPrompt.postValidate({ items: [item] }, promptInput()));
  assert.throws(
    () =>
      payoffLedgerSyncPrompt.postValidate(
        {
          items: [
            {
              ...item,
              sourceReplacements: [
                { ...item.sourceReplacements[0], previousLedgerKey: "foreign-ledger" },
              ],
            },
          ],
        },
        promptInput(),
      ),
    /真实旧账项/,
  );
  const nextInput = promptInput();
  nextInput.existingLedgerItems.push({ ...nextInput.existingLedgerItems[0], ...item });
  assert.doesNotThrow(() =>
    payoffLedgerSyncPrompt.postValidate(
      {
        items: [
          {
            ...item,
            identityDecision: {
              action: "reuse",
              existingLedgerKey: "changed-promise",
              reason: "继续跟进已替换的新承诺",
            },
            sourceReplacements: [],
          },
        ],
      },
      nextInput,
    ),
  );
});
