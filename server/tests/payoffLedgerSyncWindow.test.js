const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { payoffLedgerSyncService } = require("../dist/services/payoff/PayoffLedgerSyncService.js");

// 与实现保持同一口径：伏笔对账窗口为前 24 章 / 后 12 章。
const WINDOW_BEFORE = 24;
const WINDOW_AFTER = 12;

function installStubs() {
  const originals = {
    chapterFindFirst: prisma.chapter.findFirst,
    novelFindUnique: prisma.novel.findUnique,
    volumePlanFindMany: prisma.volumePlan.findMany,
    volumeChapterPlanFindMany: prisma.volumeChapterPlan.findMany,
    snapshotFindFirst: prisma.storyStateSnapshot.findFirst,
    openConflictFindMany: prisma.openConflict.findMany,
    auditReportFindMany: prisma.auditReport.findMany,
    payoffLedgerItemFindMany: prisma.payoffLedgerItem.findMany,
  };
  const captured = { chapterOrderQueries: [] };

  prisma.chapter.findFirst = async () => null;
  prisma.novel.findUnique = async () => ({
    id: "novel-1",
    title: "窗口测试书",
    storyMacroPlan: null,
    bookContract: null,
  });
  prisma.volumePlan.findMany = async () => [];
  prisma.volumeChapterPlan.findMany = async (args) => {
    captured.chapterOrderQueries.push(args);
    return [];
  };
  prisma.storyStateSnapshot.findFirst = async () => null;
  prisma.openConflict.findMany = async () => [];
  prisma.auditReport.findMany = async () => [];
  prisma.payoffLedgerItem.findMany = async () => [];

  return {
    captured,
    restore() {
      prisma.chapter.findFirst = originals.chapterFindFirst;
      prisma.novel.findUnique = originals.novelFindUnique;
      prisma.volumePlan.findMany = originals.volumePlanFindMany;
      prisma.volumeChapterPlan.findMany = originals.volumeChapterPlanFindMany;
      prisma.storyStateSnapshot.findFirst = originals.snapshotFindFirst;
      prisma.openConflict.findMany = originals.openConflictFindMany;
      prisma.auditReport.findMany = originals.auditReportFindMany;
      prisma.payoffLedgerItem.findMany = originals.payoffLedgerItemFindMany;
    },
  };
}

test("伏笔对账把章节窗口条件下推到数据库查询", async () => {
  const stubs = installStubs();
  try {
    const result = await payoffLedgerSyncService.buildSyncPromptInput("novel-1", {
      chapterOrder: 100,
    });

    assert.equal(stubs.captured.chapterOrderQueries.length, 1, "应只发起一次卷章节查询");
    const query = stubs.captured.chapterOrderQueries[0];
    assert.deepEqual(query.where.volume, { novelId: "novel-1" });
    assert.deepEqual(query.where.chapterOrder, {
      gte: 100 - WINDOW_BEFORE,
      lte: 100 + WINDOW_AFTER,
    });
    assert.equal(result.chapterOrder, 100);
    assert.doesNotMatch(result.promptInput.latestChapterContext, /全量章节引用读取/);
  } finally {
    stubs.restore();
  }
});

test("伏笔对账窗口在开篇章节不会取到负数序号", async () => {
  const stubs = installStubs();
  try {
    await payoffLedgerSyncService.buildSyncPromptInput("novel-1", { chapterOrder: 5 });

    assert.deepEqual(stubs.captured.chapterOrderQueries[0].where.chapterOrder, {
      gte: 0,
      lte: 5 + WINDOW_AFTER,
    });
  } finally {
    stubs.restore();
  }
});

test("章节序号不可用时退回全量读取并给出可诊断提示", async () => {
  const stubs = installStubs();
  try {
    const result = await payoffLedgerSyncService.buildSyncPromptInput("novel-1", {});

    const query = stubs.captured.chapterOrderQueries[0];
    assert.equal(
      query.where.chapterOrder,
      undefined,
      "序号不可用时不再附加窗口条件，保持兼容的全量读取",
    );
    assert.deepEqual(query.where.volume, { novelId: "novel-1" });
    assert.equal(result.chapterOrder, null);
    assert.match(result.promptInput.latestChapterContext, /当前章节序号：未知/);
    assert.match(result.promptInput.latestChapterContext, /全量章节引用读取/);
  } finally {
    stubs.restore();
  }
});
