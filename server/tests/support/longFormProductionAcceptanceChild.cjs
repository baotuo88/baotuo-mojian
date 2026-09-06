const path = require("node:path");

const NOVEL_ID = "long-form-acceptance-novel";
const CHARACTER_ID = "long-form-acceptance-protagonist";
const TASK_ID = "long-form-acceptance-task";
const CHECKPOINT_ORDERS = new Set([1, 30, 60, 100]);

function requireDist(relativePath) {
  return require(path.join(process.cwd(), "dist", relativePath));
}

function chapterId(order) {
  return `long-form-chapter-${String(order).padStart(3, "0")}`;
}

function recordedContent(order) {
  const volume = Math.ceil(order / 25);
  return `第${order}章录制正文：林遥在第${volume}卷推进无名信主线，确认事实锚点 LF-${order}，并保留下一章行动。`;
}

function buildAssembled(order) {
  const id = chapterId(order);
  const chapter = {
    id,
    title: `第${order}章`,
    order,
    content: "",
    expectation: `推进长线目标 LF-${order}`,
    targetWordCount: 2800,
  };
  return {
    novel: { id: NOVEL_ID, title: "长篇生产固定验收样本" },
    chapter,
    contextPackage: {
      chapter,
      characterRoster: [{ id: CHARACTER_ID, name: "林遥", role: "主角" }],
      nextAction: "write_chapter",
      pendingReviewProposalCount: 0,
      openAuditIssues: [],
      chapterWriteContext: {
        chapterMission: {
          title: chapter.title,
          objective: chapter.expectation,
          expectation: `完成第${order}章阶段行动`,
          mustAdvance: [`事实锚点 LF-${order}`],
          mustPreserve: ["无名信来源在第100章前保持可追踪"],
          riskNotes: [],
          hookTarget: order === 100 ? "完成主线回收" : `行动指向第${order + 1}章`,
          targetWordCount: 2800,
        },
        participants: [{ id: CHARACTER_ID, name: "林遥", role: "主角", currentGoal: "查清无名信来源" }],
        openConflictSummaries: order < 100 ? ["无名信来源尚未完全揭示"] : [],
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
      characterDynamics: { novelId: NOVEL_ID, chapterId: id, entries: [] },
    },
  };
}

const accepted = {
  status: "accepted",
  score: { coherence: 96, pacing: 95, repetition: 97, engagement: 95, voice: 96, overall: 96 },
  blockingIssues: [],
  repairDirectives: [],
  missingObligations: [],
  repairability: "none",
  decisionReason: "recorded_acceptance",
  riskTags: [],
  assetSyncRecommendation: { priority: "normal", reason: "recorded_acceptance", requiresFullPayoffReconcile: false },
  continuePolicy: "continue",
  summary: "recorded_acceptance",
};

async function seed(prisma) {
  await prisma.novel.create({
    data: {
      id: NOVEL_ID,
      title: "长篇生产固定验收样本",
      projectMode: "ai_led",
      narrativeForm: "long_novel",
      estimatedChapterCount: 100,
    },
  });
  await prisma.character.create({
    data: { id: CHARACTER_ID, novelId: NOVEL_ID, name: "林遥", role: "主角" },
  });
  for (let volumeOrder = 1; volumeOrder <= 4; volumeOrder += 1) {
    const volumeId = `long-form-volume-${volumeOrder}`;
    await prisma.volumePlan.create({
      data: {
        id: volumeId,
        novelId: NOVEL_ID,
        sortOrder: volumeOrder,
        title: `第${volumeOrder}卷`,
        summary: `第${volumeOrder}卷固定验收主线`,
        mainPromise: `兑现第${volumeOrder}卷阶段承诺`,
        openPayoffsJson: JSON.stringify(["anonymous-letter"]),
      },
    });
    for (let order = (volumeOrder - 1) * 25 + 1; order <= volumeOrder * 25; order += 1) {
      const id = chapterId(order);
      await prisma.chapter.create({
        data: { id, novelId: NOVEL_ID, title: `第${order}章`, order, expectation: `推进长线目标 LF-${order}` },
      });
      await prisma.volumeChapterPlan.create({
        data: {
          id: `long-form-plan-${order}`,
          volumeId,
          chapterId: id,
          chapterOrder: order,
          title: `第${order}章`,
          summary: `推进固定事实 LF-${order}`,
        },
      });
    }
  }
  await prisma.generationJob.create({
    data: {
      id: "long-form-generation-job",
      novelId: NOVEL_ID,
      startOrder: 1,
      endOrder: 100,
      status: "queued",
      totalCount: 100,
      maxRetries: 1,
      payload: JSON.stringify({ runMode: "fast", acceptance: "recorded_replay" }),
    },
  });
  await prisma.novelWorkflowTask.create({
    data: {
      id: TASK_ID,
      novelId: NOVEL_ID,
      lane: "auto_director",
      title: "100章固定验收",
      status: "running",
      currentStage: "chapter_execution",
      seedPayloadJson: JSON.stringify({ runMode: "full_book_autopilot" }),
    },
  });
  await prisma.payoffLedgerItem.create({
    data: {
      id: "long-form-payoff",
      novelId: NOVEL_ID,
      ledgerKey: "anonymous-letter",
      title: "无名信来源",
      summary: "贯穿四卷的身份谜题",
      scopeType: "book",
      currentStatus: "setup",
      targetStartChapterOrder: 1,
      targetEndChapterOrder: 100,
      firstSeenChapterOrder: 1,
      setupChapterId: chapterId(1),
      lastTouchedChapterId: chapterId(1),
      lastTouchedChapterOrder: 1,
      evidenceJson: JSON.stringify([{ chapterOrder: 1, summary: "无名信首次出现" }]),
    },
  });
}

async function buildCoordinator(prisma) {
  const promptRunner = requireDist("prompting/core/promptRunner.js");
  const { ChapterRuntimeCoordinator } = requireDist("services/novel/runtime/ChapterRuntimeCoordinator.js");
  let currentOrder = 0;
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    async stream() {
      const content = recordedContent(currentOrder);
      return { async *[Symbol.asyncIterator]() { yield { content }; } };
    },
  }));
  const coordinator = new ChapterRuntimeCoordinator({
    artifactSyncService: {
      async saveDraftAndArtifacts(novelId, id, content, generationState) {
        await prisma.chapter.update({
          where: { id },
          data: { content, generationState, chapterStatus: "generating" },
        });
        await this.syncChapterArtifacts(novelId, id, content);
      },
      async syncChapterArtifacts(_novelId, id) {
        const order = Number(id.slice(-3));
        await prisma.chapterSummary.upsert({
          where: { chapterId: id },
          create: { id: `long-form-summary-${order}`, novelId: NOVEL_ID, chapterId: id, summary: `第${order}章摘要`, keyEvents: JSON.stringify([`LF-${order}`]) },
          update: { summary: `第${order}章摘要`, keyEvents: JSON.stringify([`LF-${order}`]) },
        });
        await prisma.storyStateSnapshot.upsert({
          where: { novelId_sourceChapterId: { novelId: NOVEL_ID, sourceChapterId: id } },
          create: { id: `long-form-state-${order}`, novelId: NOVEL_ID, sourceChapterId: id, summary: `状态推进至第${order}章`, rawStateJson: JSON.stringify({ chapterOrder: order, protagonistGoal: "查清无名信来源" }) },
          update: { summary: `状态推进至第${order}章`, rawStateJson: JSON.stringify({ chapterOrder: order, protagonistGoal: "查清无名信来源" }) },
        });
        await prisma.novelFactEntry.deleteMany({ where: { novelId: NOVEL_ID, chapterOrder: order, text: `固定事实 LF-${order}` } });
        await prisma.novelFactEntry.create({ data: { id: `long-form-fact-${order}`, novelId: NOVEL_ID, chapterOrder: order, text: `固定事实 LF-${order}`, category: "state_changed" } });
        await prisma.chapterArtifactSyncCheckpoint.upsert({
          where: { novelId_chapterId_contentHash_artifactType_syncMode: { novelId: NOVEL_ID, chapterId: id, contentHash: `recorded-${order}`, artifactType: "long_form_acceptance", syncMode: "recorded_replay" } },
          create: {
            id: `long-form-context-${order}`,
            novelId: NOVEL_ID,
            chapterId: id,
            contentHash: `recorded-${order}`,
            artifactType: "long_form_acceptance",
            syncMode: "recorded_replay",
            metadataJson: JSON.stringify({ estimatedInputTokens: 1800 + (order % 7) * 50, retained: ["book_contract", "recent_summary", "payoff_ledger"], dropped: order > 30 ? ["full_chapter_history"] : [] }),
          },
          update: { status: "succeeded" },
        });
      },
    },
    assembler: { assemble: async (_novelId, id) => buildAssembled(Number(id.slice(-3))) },
    readinessService: { assertReady() {} },
    ensureNovelCharacters: async () => {},
    agentRuntime: {
      createChapterGenRun: async () => `long-form-run-${currentOrder}`,
      finishChapterGenRun: async () => {},
    },
    acceptanceAssessmentService: {
      assess: async () => ({ assessment: accepted, score: accepted.score, issues: [], auditReports: [] }),
    },
  });
  return {
    coordinator,
    setCurrentOrder(order) { currentOrder = order; },
    reset() { promptRunner.setPromptRunnerLLMFactoryForTests(); },
  };
}

async function runRange(prisma, startOrder, endOrder) {
  const runtime = await buildCoordinator(prisma);
  try {
    for (let order = startOrder; order <= endOrder; order += 1) {
      runtime.setCurrentOrder(order);
      const handle = await runtime.coordinator.createChapterStream(NOVEL_ID, chapterId(order), {}, { includeRuntimePackage: true });
      let content = "";
      for await (const chunk of handle.stream) content += String(chunk.content ?? "");
      await handle.onDone(content, { writeFrame: () => undefined });
      await prisma.generationJob.update({
        where: { id: "long-form-generation-job" },
        data: {
          status: "running",
          completedCount: order,
          totalCount: 100,
          progress: order / 100,
          currentStage: "chapter_execution",
          currentItemLabel: `第${order}章`,
          startedAt: new Date(0),
        },
      });
      if (CHECKPOINT_ORDERS.has(order)) {
        await prisma.novelWorkflowTask.update({
          where: { id: TASK_ID },
          data: {
            checkpointType: "chapter_committed",
            checkpointSummary: `已安全写入第${order}章`,
            currentItemKey: `chapter:${order}`,
            currentItemLabel: `第${order}章`,
            progress: order / 100,
            promptTokens: order * 1800,
            completionTokens: order * 700,
            totalTokens: order * 2500,
            llmCallCount: order,
          },
        });
      }
    }
  } finally {
    runtime.reset();
  }
}

async function finalize(prisma) {
  await prisma.payoffLedgerItem.update({
    where: { novelId_ledgerKey: { novelId: NOVEL_ID, ledgerKey: "anonymous-letter" } },
    data: {
      currentStatus: "paid_off",
      payoffChapterId: chapterId(100),
      lastTouchedChapterId: chapterId(100),
      lastTouchedChapterOrder: 100,
      evidenceJson: JSON.stringify([
        { chapterOrder: 1, summary: "无名信首次出现" },
        { chapterOrder: 30, summary: "确认密写规则" },
        { chapterOrder: 60, summary: "锁定幕后阵营" },
        { chapterOrder: 100, summary: "身份谜题完成回收" },
      ]),
    },
  });
  await prisma.generationJob.update({
    where: { id: "long-form-generation-job" },
    data: {
      status: "succeeded",
      completedCount: 100,
      totalCount: 100,
      progress: 1,
      currentStage: null,
      currentItemLabel: null,
      finishedAt: new Date(),
    },
  });
  await prisma.novelWorkflowTask.update({
    where: { id: TASK_ID },
    data: { status: "succeeded", progress: 1, currentStage: "completed", finishedAt: new Date() },
  });
}

async function inspect(prisma) {
  const [chapters, volumes, summaries, snapshots, facts, contextEvidence, payoff, task, job] = await Promise.all([
    prisma.chapter.findMany({ where: { novelId: NOVEL_ID }, orderBy: { order: "asc" } }),
    prisma.volumePlan.findMany({ where: { novelId: NOVEL_ID }, include: { chapters: true }, orderBy: { sortOrder: "asc" } }),
    prisma.chapterSummary.count({ where: { novelId: NOVEL_ID } }),
    prisma.storyStateSnapshot.count({ where: { novelId: NOVEL_ID } }),
    prisma.novelFactEntry.count({ where: { novelId: NOVEL_ID } }),
    prisma.chapterArtifactSyncCheckpoint.findMany({ where: { novelId: NOVEL_ID, artifactType: "long_form_acceptance" } }),
    prisma.payoffLedgerItem.findUnique({ where: { novelId_ledgerKey: { novelId: NOVEL_ID, ledgerKey: "anonymous-letter" } } }),
    prisma.novelWorkflowTask.findUnique({ where: { id: TASK_ID } }),
    prisma.generationJob.findUnique({ where: { id: "long-form-generation-job" } }),
  ]);
  return {
    chapterCount: chapters.length,
    chapterOrders: chapters.map((chapter) => chapter.order),
    generatedCount: chapters.filter((chapter) => typeof chapter.content === "string" && chapter.content.includes(`第${chapter.order}章录制正文`)).length,
    volumeSizes: volumes.map((volume) => volume.chapters.length),
    summaries,
    snapshots,
    facts,
    contextEvidenceCount: contextEvidence.length,
    maxEstimatedInputTokens: Math.max(...contextEvidence.map((item) => JSON.parse(item.metadataJson).estimatedInputTokens)),
    compressedEvidenceCount: contextEvidence.filter((item) => JSON.parse(item.metadataJson).dropped.includes("full_chapter_history")).length,
    payoff: payoff && { status: payoff.currentStatus, setupChapterId: payoff.setupChapterId, payoffChapterId: payoff.payoffChapterId, evidence: JSON.parse(payoff.evidenceJson || "[]") },
    task: task && { status: task.status, progress: task.progress, checkpointType: task.checkpointType, checkpointSummary: task.checkpointSummary, totalTokens: task.totalTokens, llmCallCount: task.llmCallCount },
    job: job && { status: job.status, progress: job.progress, completedCount: job.completedCount, totalCount: job.totalCount },
  };
}

async function main() {
  const action = process.argv[2];
  const { prisma } = requireDist("db/prisma.js");
  try {
    if (action === "seed") await seed(prisma);
    else if (action === "run") await runRange(prisma, Number(process.argv[3]), Number(process.argv[4]));
    else if (action === "finalize") await finalize(prisma);
    else if (action === "inspect") console.log(JSON.stringify(await inspect(prisma)));
    else throw new Error(`Unknown action: ${action}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
