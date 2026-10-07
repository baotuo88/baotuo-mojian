const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAssessment,
} = require("../dist/services/novel/runtime/ChapterAcceptanceAssessmentService.js");
const {
  chapterAcceptanceAssessmentSchema,
} = require("../dist/prompting/prompts/novel/chapterAcceptance.prompts.js");

function createAssessment(overrides = {}) {
  return {
    status: "accepted",
    score: {
      coherence: 82,
      pacing: 82,
      repetition: 82,
      engagement: 82,
      voice: 82,
      overall: 82,
    },
    summary: "chapter accepted",
    blockingIssues: [],
    repairDirectives: [],
    riskTags: [],
    assetSyncRecommendation: {
      priority: "normal",
      reason: "normal sync",
      requiresFullPayoffReconcile: false,
    },
    continuePolicy: "continue",
    ...overrides,
  };
}

test("normalizeAssessment drops stale under-length issue when actual content satisfies target range", () => {
  const content = "字".repeat(6025);
  const normalized = normalizeAssessment(
    createAssessment({
      status: "needs_manual_review",
      blockingIssues: [
        {
          severity: "high",
          category: "plot",
          code: "length_insufficient",
          evidence: "正文估算约2000-3000字，远低于目标长度5100-6900字范围。",
          fixSuggestion: "扩写到目标字数。",
        },
        {
          severity: "medium",
          category: "plot",
          code: "payoff_missing_progress",
          evidence: "赵明相关线索缺失。",
          fixSuggestion: "补充赵明微笑暗示的真正游戏。",
        },
      ],
      repairDirectives: [
        {
          mode: "rewrite",
          target: "plot",
          instruction: "扩写正文到目标长度。",
          issueCodes: ["length_insufficient"],
        },
        {
          mode: "patch",
          target: "plot",
          instruction: "补充赵明微笑暗示的真正游戏。",
          issueCodes: ["payoff_missing_progress"],
        },
      ],
      riskTags: ["length_insufficient", "payoff_missing_progress"],
      continuePolicy: "pause",
    }),
    content,
    6000,
  );

  assert.equal(normalized.status, "repairable");
  assert.equal(normalized.continuePolicy, "repair_once");
  assert.deepEqual(
    normalized.blockingIssues.map((issue) => issue.code),
    ["payoff_missing_progress"],
  );
  assert.deepEqual(
    normalized.repairDirectives.map((directive) => directive.instruction),
    ["补充赵明微笑暗示的真正游戏。"],
  );
  assert.deepEqual(normalized.riskTags, ["payoff_missing_progress"]);
});

test("normalizeAssessment keeps under-length issue when actual content is still below target range", () => {
  const normalized = normalizeAssessment(
    createAssessment({
      status: "repairable",
      blockingIssues: [
        {
          severity: "high",
          category: "plot",
          code: "length_insufficient",
          evidence: "正文估算远低于目标长度。",
          fixSuggestion: "扩写到目标字数。",
        },
      ],
      repairDirectives: [
        {
          mode: "rewrite",
          target: "plot",
          instruction: "扩写正文到目标长度。",
          issueCodes: ["length_insufficient"],
        },
      ],
      riskTags: ["length_insufficient"],
      continuePolicy: "repair_once",
    }),
    "字".repeat(3000),
    6000,
  );

  assert.equal(normalized.status, "repairable");
  assert.equal(normalized.continuePolicy, "repair_once");
  assert.deepEqual(
    normalized.blockingIssues.map((issue) => issue.code),
    ["length_insufficient"],
  );
});

test("normalizeAssessment keeps soft missing obligations as continue-with-risk debt", () => {
  const normalized = normalizeAssessment(
    createAssessment({
      status: "accepted",
      missingObligations: [
        {
          kind: "payoff_touch",
          summary: "补出截信计划的可见行动。",
          evidence: "正文只回忆了计划，没有发生行动。",
        },
      ],
      repairability: "patchable_obligation_gap",
      decisionReason: "只需局部补写即可兑现本章义务。",
    }),
    "字".repeat(3600),
    3000,
  );

  assert.equal(normalized.status, "continue_with_risk");
  assert.equal(normalized.continuePolicy, "continue");
  assert.equal(normalized.missingObligations[0].kind, "payoff_touch");
});

test("normalizeAssessment preserves character and plot risks when chapter length is valid", () => {
  const assessment = createAssessment({
    status: "repairable",
    blockingIssues: [
      {
        severity: "high",
        category: "character",
        code: "character_motivation",
        evidence: "角色背叛同伴的动机不足。",
        fixSuggestion: "补足角色动机。",
      },
      {
        severity: "high",
        category: "continuity",
        code: "power_boundary",
        evidence: "角色战力超过已确认的境界上限。",
        fixSuggestion: "让行动结果符合角色能力。",
      },
    ],
    repairDirectives: [
      {
        mode: "patch",
        target: "character",
        instruction: "修补动机不足的段落。",
      },
    ],
    riskTags: ["角色动机不足", "角色战力超过上限"],
    continuePolicy: "repair_once",
  });

  const normalized = normalizeAssessment(assessment, "字".repeat(6000), 6000);

  assert.deepEqual(normalized.blockingIssues, assessment.blockingIssues);
  assert.deepEqual(normalized.repairDirectives, assessment.repairDirectives);
  assert.deepEqual(normalized.riskTags, assessment.riskTags);
  assert.equal(normalized.status, "repairable");
});

test("normalizeAssessment removes only directives and tags linked exclusively to resolved length issues", () => {
  const assessment = chapterAcceptanceAssessmentSchema.parse(
    createAssessment({
      status: "repairable",
      blockingIssues: [
        {
          severity: "high",
          category: "plot",
          code: "length_insufficient",
          evidence: "正文未达到目标长度。",
          fixSuggestion: "补充正文。",
        },
        {
          severity: "high",
          category: "character",
          code: "character_motivation",
          evidence: "角色背叛同伴的动机不足。",
          fixSuggestion: "补足角色动机。",
        },
      ],
      repairDirectives: [
        {
          mode: "patch",
          target: "plot",
          instruction: "补充当前场景的环境与动作。",
          issueCodes: ["length_insufficient"],
        },
        {
          mode: "patch",
          target: "character",
          instruction: "修补动机不足的段落。",
          issueCodes: ["character_motivation"],
        },
        {
          mode: "rewrite",
          target: "character",
          instruction: "扩写正文并修补动机不足的段落。",
          issueCodes: ["length_insufficient", "character_motivation"],
        },
        {
          mode: "patch",
          target: "plot",
          instruction: "补足字数和本章必要的行动。",
        },
      ],
      riskTags: ["length_insufficient", "动机不足", "length_insufficient_character_depth"],
      continuePolicy: "repair_once",
    }),
  );

  const normalized = normalizeAssessment(assessment, "字".repeat(6000), 6000);

  assert.deepEqual(
    normalized.blockingIssues.map((issue) => issue.code),
    ["character_motivation"],
  );
  assert.deepEqual(normalized.repairDirectives, assessment.repairDirectives.slice(1));
  assert.deepEqual(normalized.riskTags, ["动机不足", "length_insufficient_character_depth"]);
  assert.equal(normalized.status, "repairable");
});

test("normalizeAssessment continues after resolving the only length issue instead of requesting empty repair", () => {
  const assessment = chapterAcceptanceAssessmentSchema.parse(
    createAssessment({
      status: "repairable",
      blockingIssues: [
        {
          severity: "high",
          category: "plot",
          code: "length_excessive",
          evidence: "正文总字数高于目标上限。",
          fixSuggestion: "压缩正文。",
        },
      ],
      repairDirectives: [
        {
          mode: "patch",
          target: "plot",
          instruction: "压缩重复环境描写。",
          issueCodes: ["length_excessive"],
        },
      ],
      riskTags: ["length_excessive"],
      continuePolicy: "repair_once",
    }),
  );

  const normalized = normalizeAssessment(assessment, "字".repeat(6000), 6000);

  assert.deepEqual(normalized.blockingIssues, []);
  assert.deepEqual(normalized.repairDirectives, []);
  assert.deepEqual(normalized.riskTags, []);
  assert.equal(normalized.continuePolicy, "continue");

  const stillTooLong = normalizeAssessment(assessment, "字".repeat(8000), 6000);
  assert.deepEqual(stillTooLong.blockingIssues, assessment.blockingIssues);
  assert.deepEqual(stillTooLong.repairDirectives, assessment.repairDirectives);
  assert.equal(stillTooLong.continuePolicy, "repair_once");
});
