const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const {
  novelFactService,
} = require("../dist/services/novel/fact/NovelFactService.js");

test("listForChapter 对 completed/revealed 施加章节窗口，避免超长篇上下文线性膨胀", async () => {
  const captured = [];
  const original = prisma.novelFactEntry.findMany;
  prisma.novelFactEntry.findMany = async (args) => {
    captured.push(args);
    return [];
  };

  try {
    await novelFactService.listForChapter({
      novelId: "novel-1",
      beforeChapterOrder: 100,
      milestoneChaptersWindow: 30,
      recentChaptersWindow: 15,
    });
  } finally {
    prisma.novelFactEntry.findMany = original;
  }

  assert.equal(captured.length, 2, "应分别查询里程碑事实与近期状态变化两类");

  const milestoneQuery = captured[0];
  assert.deepEqual(milestoneQuery.where.category, { in: ["completed", "revealed"] });
  assert.equal(milestoneQuery.where.chapterOrder.lt, 100, "里程碑事实上界为当前章之前");
  assert.equal(milestoneQuery.where.chapterOrder.gte, 70, "里程碑事实下界为 beforeChapterOrder - milestoneChaptersWindow");

  const stateQuery = captured[1];
  assert.equal(stateQuery.where.category, "state_changed");
  assert.equal(stateQuery.where.chapterOrder.gte, 85, "状态变化下界为 beforeChapterOrder - recentChaptersWindow");
});

test("listForChapter 未显式指定窗口时使用默认 30 章里程碑窗口", async () => {
  const captured = [];
  const original = prisma.novelFactEntry.findMany;
  prisma.novelFactEntry.findMany = async (args) => {
    captured.push(args);
    return [];
  };

  try {
    await novelFactService.listForChapter({ novelId: "novel-1", beforeChapterOrder: 50 });
  } finally {
    prisma.novelFactEntry.findMany = original;
  }

  const milestoneQuery = captured[0];
  assert.equal(milestoneQuery.where.chapterOrder.gte, 20, "默认窗口 30 章：gte = 50 - 30");
});