import test from "node:test";
import assert from "node:assert/strict";
import { buildChapterRepairIssue } from "./chapterExecution.utils.ts";

test("buildChapterRepairIssue returns the canonical repair guidance", () => {
  assert.deepEqual(buildChapterRepairIssue("compress"), {
    severity: "medium",
    category: "repetition",
    evidence: "用户要求压缩章节",
    fixSuggestion: "压缩重复表达，保留关键事件与冲突节点，控制篇幅更紧凑。",
  });
  assert.equal(buildChapterRepairIssue("addDialogue").category, "voice");
});
