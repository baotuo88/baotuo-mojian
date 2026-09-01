const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCurrentVolumeWindowSummary } = require("../dist/services/planner/plannerContextHelpers.js");
const {
  createNovelChapterReferenceLookup,
  normalizePayoffLedgerPromptChapterRefs,
} = require("../dist/services/payoff/payoffLedgerChapterRefs.js");

function buildFixture() {
  return Array.from({ length: 3 }, (_, volumeIndex) => {
    const start = volumeIndex * 20 + 1;
    return {
      sortOrder: volumeIndex + 1,
      title: `第${volumeIndex + 1}卷`,
      summary: `卷${volumeIndex + 1}主线推进`,
      mainPromise: `完成卷${volumeIndex + 1}阶段承诺`,
      climax: `卷${volumeIndex + 1}高潮`,
      openPayoffs: [`卷${volumeIndex + 1}伏笔`],
      updatedAt: "2026-08-31T00:00:00.000Z",
      chapters: Array.from({ length: 20 }, (_, offset) => ({
        chapterOrder: start + offset,
        title: `第${start + offset}章`,
        summary: "阶段推进",
        conflictLevel: offset < 3 ? 2 : offset < 12 ? 3 : offset < 17 ? 4 : 5,
      })),
    };
  });
}

test("50+ chapter fixture keeps volume phase guidance across three volumes", () => {
  const volumes = buildFixture();
  const early = buildCurrentVolumeWindowSummary(volumes, 2);
  const middle = buildCurrentVolumeWindowSummary(volumes, 11);
  const late = buildCurrentVolumeWindowSummary(volumes, 18);
  const nextVolume = buildCurrentVolumeWindowSummary(volumes, 22);

  assert.match(early, /建立卷级承诺与主要压力/);
  assert.match(middle, /升级阻力并兑现阶段收益/);
  assert.match(late, /完成高潮、回收本卷承诺并留下下一卷接口/);
  assert.match(nextVolume, /当前卷：第2卷/);
  assert.match(nextVolume, /上一卷承接：第1卷/);
});

test("long-form fixture preserves payoff setup anchor through final recovery", () => {
  const chapters = Array.from({ length: 60 }, (_, index) => ({
    id: `chapter-${index + 1}`,
    order: index + 1,
  }));
  const lookup = createNovelChapterReferenceLookup(chapters);
  const normalized = normalizePayoffLedgerPromptChapterRefs({
    item: {
      currentStatus: "paid_off",
      lastTouchedChapterOrder: 58,
      sourceRefs: [],
      evidence: [
        { summary: "首次埋下秘密", chapterOrder: 3 },
        { summary: "中段再次触碰", chapterOrder: 27 },
        { summary: "高潮前施压", chapterOrder: 49 },
        { summary: "最终回收", chapterOrder: 58 },
      ],
    },
    lookup,
    currentChapterOrder: 58,
    sourceChapterId: "chapter-58",
  });

  assert.deepEqual(normalized.evidence.map((item) => item.chapterOrder), [3, 27, 49, 58]);
  assert.equal(normalized.payoffChapterId, null);
  assert.equal(normalized.lastTouchedChapterId, "chapter-58");
});
