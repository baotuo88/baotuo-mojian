const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../src/services/novel/runtime/ChapterArtifactSyncService.ts"), "utf8");

test("chapter artifact writes expose and enforce execution fencing", () => {
  assert.match(source, /executionFence\?: ChapterExecutionFence/);
  assert.match(source, /directorRuntimeExecution\.findUnique/);
  assert.match(source, /execution\.checkpointVersion !== fence\.checkpointVersion/);
  assert.match(source, /await this\.assertExecutionFence\(options\.executionFence\)/);
});
