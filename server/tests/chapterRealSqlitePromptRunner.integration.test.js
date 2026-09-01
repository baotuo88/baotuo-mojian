const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createTempDatabase, runChildScenario } = require("./support/realSqliteHarness.cjs");
const { CHAPTER_CONTENT } = require("./support/mockLlmChapterScenario.cjs");

test("Mock LLM chapter runtime writes final content and state to real SQLite", () => {
  const database = createTempDatabase({ prefix: "chapter-e2e" });
  const scriptPath = path.join(database.tempDir, "run.cjs");
  fs.writeFileSync(scriptPath, `
const path = require("node:path");
const { prisma } = require(path.join(process.cwd(), "dist", "db", "prisma.js"));
const {
  seedMockLlmChapterScenario,
  runMockLlmChapterScenario,
  inspectMockLlmChapterScenario,
} = require(path.join(process.cwd(), "tests", "support", "mockLlmChapterScenario.cjs"));
async function main() {
  await seedMockLlmChapterScenario(prisma);
  try {
    await runMockLlmChapterScenario();
    console.log(JSON.stringify(await inspectMockLlmChapterScenario(prisma)));
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exit(1); });
`, "utf8");
  try {
    const { stdout } = runChildScenario({ database, script: scriptPath, cleanup: false });
    const line = stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).reverse().find((item) => item.startsWith("{"));
    assert.ok(line, stdout);
    const saved = JSON.parse(line);
    assert.equal(saved.content, CHAPTER_CONTENT);
    assert.equal(saved.generationState, "drafted");
    assert.equal(saved.chapterStatus, "pending_review");
  } finally { database.cleanup(); }
});
