const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PrismaClient } = require("../node_modules/@prisma/client");
const { PrismaBetterSqlite3 } = require("../node_modules/@prisma/adapter-better-sqlite3");
const execution = require("../dist/platform/execution");

function loadSource(relativePath, modules) {
  const source = fs.readFileSync(path.join(__dirname, "../src", relativePath), "utf8");
  const sandbox = {
    exports: {},
    console,
    require: (id) => modules[id] ?? (id === "node:crypto" ? require(id) : {}),
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    sandbox,
  );
  return sandbox.exports;
}

async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-finalization-fence-"));
  const raw = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${path.join(directory, "fixture.sqlite")}` }),
  });
  t.after(() => raw.$disconnect());
  await raw.$executeRawUnsafe(`CREATE TABLE Chapter (
    id TEXT PRIMARY KEY, novelId TEXT NOT NULL, content TEXT,
    generationState TEXT NOT NULL, chapterStatus TEXT NOT NULL, updatedAt DATETIME NOT NULL
  )`);
  await raw.$executeRawUnsafe(`CREATE TABLE NovelFactEntry (
    id TEXT PRIMARY KEY, novelId TEXT NOT NULL, chapterOrder INTEGER NOT NULL,
    text TEXT NOT NULL, category TEXT NOT NULL, source TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await raw.$executeRawUnsafe(
    "INSERT INTO Chapter VALUES ('chapter','novel','原稿','drafted','pending_review',CURRENT_TIMESTAMP)",
  );
  await raw.$executeRawUnsafe(
    "INSERT INTO NovelFactEntry (id,novelId,chapterOrder,text,category,source) VALUES ('existing','novel',1,'保留的既有事实','completed','manual')",
  );
  const prisma = execution.guardPrismaExecutionWrites(raw);
  const factModule = loadSource("services/novel/fact/NovelFactService.ts", {
    "../../../db/prisma": { prisma },
  });
  const events = [];
  const runtimePackage = {
    obligationCoverage: { status: "satisfied", missing: [] },
    audit: { hasBlockingIssues: false },
    meta: { riskTags: [] },
  };
  const { ChapterContentFinalizationService } = loadSource(
    "services/novel/runtime/ChapterContentFinalizationService.ts",
    {
      "../../../db/prisma": { prisma },
      "../../../platform/execution": execution,
      "../../../events": { novelEventBus: { emit: async (event) => events.push(event) } },
      "../../state/OpenConflictService": {
        openConflictService: { listOpenConflicts: async () => [] },
      },
      "../fact/NovelFactService": {
        novelFactService: {
          writeFacts: async (...args) => {
            await options.beforeFacts?.(raw);
            return factModule.novelFactService.writeFacts(...args);
          },
        },
      },
      "../fact/factLedgerFilter": {
        filterAcceptedFactItems: () => ({
          accepted: [{ text: "原稿确认的事实", category: "completed" }],
          excluded: [],
        }),
      },
      "./chapterRuntimePackageBuilders": { buildRuntimePackage: () => runtimePackage },
      "./proseQuality/ProseQualityDetector": {
        detectProseQuality: () => ({}),
        buildProseQualityAuditReport: () => null,
      },
    },
  );
  const finalized = new ChapterContentFinalizationService({
    qualityGateService: {
      runAcceptanceGateOnly: async () => {
        await options.duringAudit?.(raw);
        return {
          acceptance: {
            score: {},
            issues: [],
            auditReports: [],
            assessment: { status: "accepted" },
          },
          timelineGate: { result: { status: "passed" } },
        };
      },
    },
    artifactSyncService: {},
    plannerService: {},
    agentRuntime: {},
  });
  const { mergeChapterPatchForGenerationStateBump } = loadSource(
    "services/novel/chapterLifecycleState.ts",
    {},
  );
  const { ChapterPipelineRuntimeAdapter } = loadSource(
    "services/novel/runtime/ChapterPipelineRuntimeAdapter.ts",
    {
      "../../../db/prisma": { prisma },
      "../../../platform/execution": execution,
      "../chapterLifecycleState": { mergeChapterPatchForGenerationStateBump },
      "./chapterEmptyContentError": { isChapterEmptyContentError: () => false },
      "./chapterRuntimePipeline": {
        runPipelineChapterWithRuntime: options.pipeline ?? (async () => undefined),
      },
    },
  );
  const adapter = new ChapterPipelineRuntimeAdapter({
    streamOrchestrator: {
      prepareRuntimeChapter: async () => ({
        request: {},
        assembled: { chapter: { content: "原稿" } },
      }),
      markChapterStatus: (...args) => finalized.markChapterStatus(...args),
    },
  });
  return {
    raw,
    adapter,
    events,
    run: () =>
      finalized.finalizeChapterContent({
        novelId: "novel",
        chapterId: "chapter",
        content: "原稿",
        request: {},
        contextPackage: {
          chapter: { order: 1 },
          chapterWriteContext: { obligationContract: { mustHitNow: ["原稿确认的事实"] } },
        },
        runId: null,
        startMs: null,
      }),
    chapter: () =>
      raw.chapter.findUnique({
        where: { id: "chapter" },
        select: { content: true, chapterStatus: true, generationState: true },
      }),
    facts: () => raw.novelFactEntry.findMany({ select: { text: true }, orderBy: { text: "asc" } }),
  };
}

async function saveNewDraft(raw) {
  await raw.chapter.updateMany({
    where: { id: "chapter" },
    data: { content: "并发新稿", chapterStatus: "completed", generationState: "published" },
  });
}

test("an audit finishing after a concurrent edit cannot mark or finalize the newer draft", async (t) => {
  const f = await fixture(t, { duringAudit: saveNewDraft });
  await assert.rejects(f.run(), execution.ExecutionStoppedError);
  assert.deepEqual(await f.chapter(), {
    content: "并发新稿",
    chapterStatus: "completed",
    generationState: "published",
  });
  assert.deepEqual(await f.facts(), [{ text: "保留的既有事实" }]);
  assert.equal(f.events.length, 0);
});

test("a content change after status marking rejects accepted facts instead of swallowing the conflict", async (t) => {
  const f = await fixture(t, { beforeFacts: saveNewDraft });
  await assert.rejects(f.run(), execution.ExecutionStoppedError);
  assert.equal((await f.chapter()).content, "并发新稿");
  assert.deepEqual(await f.facts(), [{ text: "保留的既有事实" }]);
  assert.equal(f.events.length, 0);
});

test("matching content permits accepted facts without deleting existing facts", async (t) => {
  const f = await fixture(t);
  await f.run();
  assert.equal((await f.chapter()).chapterStatus, "pending_review");
  assert.deepEqual(
    (await f.facts()).map((item) => item.text),
    ["保留的既有事实", "原稿确认的事实"],
  );
  assert.equal(f.events.length, 1);
});

test("pipeline approval cannot change the state of a newer draft", async (t) => {
  const f = await fixture(t);
  await saveNewDraft(f.raw);
  await assert.rejects(
    f.adapter.markChapterGenerationState("novel", "chapter", "approved", "原稿"),
    execution.ExecutionStoppedError,
  );
  assert.equal((await f.chapter()).generationState, "published");
});

test("a recoverable old-draft repair failure cannot mark the newer draft as needing repair", async (t) => {
  let f;
  f = await fixture(t, {
    pipeline: async (deps) => {
      await saveNewDraft(f.raw);
      await deps.markChapterNeedsRepair("chapter", "原稿");
    },
  });
  await assert.rejects(
    f.adapter.runPipelineChapter("novel", "chapter"),
    execution.ExecutionStoppedError,
  );
  assert.equal((await f.chapter()).chapterStatus, "completed");
});

test("the real pipeline supplies the processed content to approval, review and deferred repair status writes", async () => {
  const { runPipelineChapterWithRuntime } = loadSource(
    "services/novel/runtime/chapterRuntimePipeline.ts",
    {
      "../../styleEngine/styleGenerationSanitizer": { detectForbiddenStyleEntities: () => [] },
    },
  );
  for (const mode of ["skip_review", "accepted", "defer_repair"]) {
    const writes = [];
    const score = mode === "defer_repair" ? 60 : 100;
    const runtimePackage = {
      novelId: "novel",
      chapterId: "chapter",
      context: { styleContext: null },
      audit: {
        score: {
          coherence: score,
          pacing: score,
          repetition: score,
          engagement: score,
          voice: score,
          overall: score,
        },
        openIssues:
          mode === "defer_repair"
            ? [
                {
                  auditType: "continuity",
                  severity: "medium",
                  evidence: "待复查",
                  fixSuggestion: "重新审校",
                  code: "acceptance_gate_unavailable",
                },
              ]
            : [],
        reports: [],
        hasBlockingIssues: false,
      },
      meta: { continuePolicy: "continue" },
    };
    await runPipelineChapterWithRuntime(
      {
        validateRequest: (input) => input,
        ensureNovelCharacters: async () => {},
        assemble: async () => ({
          novel: { id: "novel", title: "小说" },
          chapter: { id: "chapter", title: "本章", content: "本轮正文" },
          contextPackage: {},
        }),
        finalizeChapterContent: async () => ({ finalContent: "本轮正文", runtimePackage }),
        syncFinalChapterArtifacts: async () => {},
        markChapterGenerationState: async (_id, state, content) => writes.push([state, content]),
        markChapterNeedsRepair: async (_id, content) => writes.push(["needs_repair", content]),
      },
      "novel",
      "chapter",
      { autoReview: mode !== "skip_review" },
    );
    assert.deepEqual(
      writes,
      mode === "skip_review"
        ? [["approved", "本轮正文"]]
        : [
            ["reviewed", "本轮正文"],
            [mode === "accepted" ? "approved" : "needs_repair", "本轮正文"],
          ],
    );
  }
});
