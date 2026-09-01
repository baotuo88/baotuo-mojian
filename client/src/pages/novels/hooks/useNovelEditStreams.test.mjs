import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("useNovelEditStreams owns all four NovelEdit SSE channels", async () => {
  const source = await readFile(new URL("./useNovelEditStreams.ts", import.meta.url), "utf8");
  assert.match(source, /const chapterSSE = useSSE/);
  assert.match(source, /const bibleSSE = useSSE/);
  assert.match(source, /const beatsSSE = useSSE/);
  assert.match(source, /const repairSSE = useSSE/);
  assert.match(source, /setActiveChapterStream\(null\)/);
  assert.match(source, /setActiveRepairStream\(null\)/);
});

test("NovelEdit consumes the stream hook instead of constructing SSE channels", async () => {
  const source = await readFile(new URL("../NovelEdit.tsx", import.meta.url), "utf8");
  assert.match(source, /useNovelEditStreams/);
  assert.doesNotMatch(source, /useSSE\(/);
});
