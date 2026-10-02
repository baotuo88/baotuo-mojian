const assert = require("node:assert/strict");
const test = require("node:test");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { ChapterPayoffPlanningService } = require("../dist/services/novel/production/payoff/index.js");
const { chapterPayoffDecisionPrompt } = require("../dist/prompting/prompts/payoff/chapterPayoffDecision.prompts.js");

function input() {
  return {
    chapter: { id: "ch4", order: 4, title: "反击", taskSheet: "本章完成第一次反击", sceneCards: "兑现夺回权限的承诺", mustAvoid: "幕后身份不得揭开" },
    plan: { objective: "完成阶段回报", mustAdvance: ["取得可使用的权限"], mustPreserve: ["幕后身份"], reveals: ["权限用途"] },
    snapshot: { novelId: "novel", narrative: {
      overduePayoffs: [{ ledgerKey: "first-win", title: "第一次反击", summary: "取得可使用的权限", currentStatus: "overdue", targetEndChapterOrder: 3 }],
      urgentPayoffs: [{ ledgerKey: "identity", title: "幕后身份", summary: "面具人的身份", currentStatus: "pending_payoff" }],
      pendingPayoffs: [],
    } },
    protectedSecrets: ["面具人就是主角的师父"],
    forbiddenEvents: [{ title: "身份公开", reason: "留给第十章" }],
  };
}

function decisions() {
  return { directives: [
    { ledgerKey: "first-win", operation: "payoff", reason: "本章任务明确交付阶段成果", forbiddenReveal: null },
    { ledgerKey: "identity", operation: "forbid", reason: "身份不属于当前章", forbiddenReveal: "面具人的真实身份" },
  ] };
}

test("AI can fulfill an overdue promise while preserving another protected secret", async () => {
  const previous = promptRunner.runStructuredPrompt;
  let captured;
  promptRunner.runStructuredPrompt = async (args) => { captured = args; return { output: decisions() }; };
  try {
    const value = input();
    value.chapter.content = "do not leak full draft";
    value.plan.rawPlanJson = "do not leak raw planner payload";
    const result = await new ChapterPayoffPlanningService().plan(value, { provider: "ollama", model: "chosen-model" });
    assert.deepEqual(result.map((item) => [item.ledgerKey, item.operation]), [["first-win", "payoff"], ["identity", "forbid"]]);
    assert.equal(captured.promptInput.chapter.taskSheet, "本章完成第一次反击");
    assert.equal(captured.promptInput.chapter.content, undefined);
    assert.equal(captured.promptInput.plan.rawPlanJson, undefined);
    assert.equal(captured.promptInput.plan.objective, "完成阶段回报");
    assert.deepEqual(captured.promptInput.protectedSecrets, input().protectedSecrets);
    assert.equal(captured.options.model, "chosen-model");
    assert.ok(captured.contextBlocks.every((block) => block.required && !block.allowSummary));
    assert.deepEqual(chapterPayoffDecisionPrompt.postValidate(decisions(), captured.promptInput), decisions());
  } finally { promptRunner.runStructuredPrompt = previous; }
});

test("partial reveals are preserved instead of being rewritten from ledger status", async () => {
  const previous = promptRunner.runStructuredPrompt;
  const output = decisions();
  output.directives[0].operation = "partial_reveal";
  output.directives[0].forbiddenReveal = "权限授予者的身份";
  promptRunner.runStructuredPrompt = async () => ({ output });
  try {
    const result = await new ChapterPayoffPlanningService().plan(input());
    assert.equal(result[0].operation, "partial_reveal");
    assert.equal(result[0].forbiddenReveal, "权限授予者的身份");
  } finally { promptRunner.runStructuredPrompt = previous; }
});

test("payoff decision rejects missing, duplicate, unknown and contradictory actions", () => {
  const value = input();
  const promptInput = { ...value, payoffs: [...value.snapshot.narrative.overduePayoffs, ...value.snapshot.narrative.urgentPayoffs] };
  const output = decisions();
  assert.throws(() => chapterPayoffDecisionPrompt.postValidate({ directives: [] }, promptInput));
  assert.throws(() => chapterPayoffDecisionPrompt.postValidate({ directives: [output.directives[0], output.directives[0]] }, promptInput));
  assert.throws(() => chapterPayoffDecisionPrompt.postValidate({ directives: [{ ...output.directives[0], ledgerKey: "unknown" }] }, promptInput));
  assert.throws(() => chapterPayoffDecisionPrompt.postValidate({ directives: [{ ...output.directives[0], forbiddenReveal: "不能兑现" }, output.directives[1]] }, promptInput));
  assert.throws(() => chapterPayoffDecisionPrompt.postValidate({ directives: [output.directives[0], { ...output.directives[1], forbiddenReveal: null }] }, promptInput));
});

test("AI failure cannot silently fall back to keyword or pressure routing", async () => {
  const previous = promptRunner.runStructuredPrompt;
  promptRunner.runStructuredPrompt = async () => { throw new Error("invalid AI decision"); };
  try {
    await assert.rejects(() => new ChapterPayoffPlanningService().plan(input()), /invalid AI decision/);
  } finally { promptRunner.runStructuredPrompt = previous; }
});

test("empty or completed ledgers require no AI call", async () => {
  const previous = promptRunner.runStructuredPrompt;
  promptRunner.runStructuredPrompt = async () => { throw new Error("unexpected call"); };
  try {
    const value = input();
    value.snapshot.narrative.overduePayoffs[0].currentStatus = "paid_off";
    value.snapshot.narrative.urgentPayoffs[0].currentStatus = "failed";
    assert.deepEqual(await new ChapterPayoffPlanningService().plan(value), []);
  } finally { promptRunner.runStructuredPrompt = previous; }
});

test("audit reuses persisted writer decisions even after the payoff ledger changes", async () => {
  const previous = promptRunner.runStructuredPrompt;
  const stored = new Map();
  let calls = 0;
  const store = {
    async read(id, fingerprint) { return stored.get(`${id}:${fingerprint}`) ?? null; },
    async save(id, fingerprint, directives) { stored.set(`${id}:${fingerprint}`, directives); return directives; },
  };
  promptRunner.runStructuredPrompt = async () => { calls++; return { output: decisions() }; };
  try {
    const value = input();
    value.plan.id = "plan-4";
    const writer = await new ChapterPayoffPlanningService(store).plan(value);
    value.snapshot.narrative.overduePayoffs = [];
    value.snapshot.narrative.urgentPayoffs = [];
    value.chapter.content = "本章兑现后的正文";
    const audit = await new ChapterPayoffPlanningService(store).plan(value);
    assert.deepEqual(audit, writer);
    assert.equal(calls, 1, "a new service instance must reuse the saved writing contract");
    value.chapter.taskSheet = "改写后的章节任务";
    value.snapshot = input().snapshot;
    await new ChapterPayoffPlanningService(store).plan(value);
    assert.equal(calls, 2, "an explicit chapter contract change needs a fresh AI decision");
  } finally { promptRunner.runStructuredPrompt = previous; }
});
