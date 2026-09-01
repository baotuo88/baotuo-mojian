const path = require("node:path");

const NOVEL_ID = "novel-e2e";
const CHARACTER_ID = "character-e2e";
const CHAPTER_ID = "chapter-e2e";
const CHAPTER_CONTENT = "林遥推开宫门，发现门缝里夹着一封没有署名的信。";

function requireDist(relativePath) {
  return require(path.join(process.cwd(), "dist", relativePath));
}

const accepted = {
  status: "accepted",
  score: { coherence: 98, pacing: 98, repetition: 98, engagement: 98, voice: 98, overall: 98 },
  blockingIssues: [],
  repairDirectives: [],
  missingObligations: [],
  repairability: "none",
  decisionReason: "ok",
  riskTags: [],
  assetSyncRecommendation: { priority: "normal", reason: "ok", requiresFullPayoffReconcile: false },
  continuePolicy: "continue",
  summary: "ok",
};

const assembled = {
  novel: { id: NOVEL_ID, title: "集成测试小说" },
  chapter: {
    id: CHAPTER_ID,
    title: "第一章",
    order: 1,
    content: "",
    expectation: "建立冲突",
    targetWordCount: null,
  },
  contextPackage: {
    chapter: {
      id: CHAPTER_ID,
      title: "第一章",
      order: 1,
      content: "",
      expectation: "建立冲突",
      targetWordCount: null,
    },
    characterRoster: [{ id: CHARACTER_ID, name: "林遥", role: "主角" }],
    nextAction: "write_chapter",
    pendingReviewProposalCount: 0,
    openAuditIssues: [],
    chapterWriteContext: {
      chapterMission: {
        title: "第一章",
        objective: "建立冲突",
        expectation: "主角做出第一次选择",
        mustAdvance: ["找到无名信"],
        mustPreserve: ["信件来源未知"],
        riskNotes: [],
        hookTarget: "信件来源成谜",
        targetWordCount: null,
      },
      participants: [{ id: CHARACTER_ID, name: "林遥", role: "主角", currentGoal: "查清信件来源" }],
      openConflictSummaries: ["宫门守卫即将返回"],
      ledgerUrgentItems: [],
      ledgerOverdueItems: [],
      ledgerPendingItems: [],
      payoffDirectives: [],
      characterBehaviorGuides: [],
      activeRelationStages: [],
      pendingCandidateGuards: [],
      recentChapterSummaries: [],
      continuationConstraints: [],
      completedMilestones: [],
      bookContract: {},
    },
    continuation: {},
    plan: null,
    stateSnapshot: null,
    openConflicts: [],
    storyWorldSlice: null,
    creativeDecisions: [],
    previousChaptersSummary: [],
    openingHint: "",
    styleContext: null,
    ledgerPendingItems: [],
    ledgerUrgentItems: [],
    ledgerOverdueItems: [],
    ledgerSummary: null,
    characterDynamics: { novelId: NOVEL_ID, chapterId: CHAPTER_ID, entries: [] },
  },
};

async function seedMockLlmChapterScenario(prisma) {
  await prisma.novel.create({
    data: { id: NOVEL_ID, title: "集成测试小说", projectMode: "draft_mode", narrativeForm: "long_novel" },
  });
  await prisma.character.create({
    data: { id: CHARACTER_ID, novelId: NOVEL_ID, name: "林遥", role: "主角" },
  });
  await prisma.chapter.create({
    data: { id: CHAPTER_ID, novelId: NOVEL_ID, title: "第一章", order: 1, targetWordCount: null, expectation: "建立冲突" },
  });
}

async function runMockLlmChapterScenario() {
  const promptRunner = requireDist("prompting/core/promptRunner.js");
  const { ChapterRuntimeCoordinator } = requireDist("services/novel/runtime/ChapterRuntimeCoordinator.js");
  const { ChapterArtifactSyncService } = requireDist("services/novel/runtime/ChapterArtifactSyncService.js");

  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    async stream() {
      return {
        async *[Symbol.asyncIterator]() {
          yield { content: CHAPTER_CONTENT };
        },
      };
    },
  }));

  try {
    const artifactSyncService = new ChapterArtifactSyncService();
    artifactSyncService.syncChapterArtifacts = async () => {};
    const coordinator = new ChapterRuntimeCoordinator({
      artifactSyncService,
      assembler: { assemble: async () => assembled },
      readinessService: { assertReady() {} },
      ensureNovelCharacters: async () => {},
      agentRuntime: {
        createChapterGenRun: async () => "run-e2e",
        finishChapterGenRun: async () => {},
      },
      acceptanceAssessmentService: {
        assess: async () => ({ assessment: accepted, score: accepted.score, issues: [], auditReports: [] }),
      },
    });
    const handle = await coordinator.createChapterStream(NOVEL_ID, CHAPTER_ID, {}, { includeRuntimePackage: true });
    let content = "";
    for await (const chunk of handle.stream) content += String(chunk.content ?? "");
    await handle.onDone(content, { writeFrame: () => undefined });
  } finally {
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
}

async function inspectMockLlmChapterScenario(prisma) {
  return prisma.chapter.findUnique({
    where: { id: CHAPTER_ID },
    select: { id: true, content: true, generationState: true, chapterStatus: true },
  });
}

module.exports = {
  CHAPTER_CONTENT,
  CHAPTER_ID,
  seedMockLlmChapterScenario,
  runMockLlmChapterScenario,
  inspectMockLlmChapterScenario,
};
