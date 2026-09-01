const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { archiveAndRemove, loadPlan, parseArgs, serializeSnapshot } = require("../scripts/archive-state-snapshots.cjs");

test("state snapshot archive plan keeps the newest snapshots per novel online", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE Chapter (id TEXT PRIMARY KEY, "order" INTEGER);
    CREATE TABLE StoryStateSnapshot (
      id TEXT PRIMARY KEY,
      novelId TEXT NOT NULL,
      sourceChapterId TEXT,
      summary TEXT,
      rawStateJson TEXT,
      createdAt TEXT
    );
  `);
  const insertChapter = db.prepare("INSERT INTO Chapter (id, \"order\") VALUES (?, ?)");
  const insertSnapshot = db.prepare(
    "INSERT INTO StoryStateSnapshot (id, novelId, sourceChapterId, summary, rawStateJson, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (let order = 1; order <= 3; order += 1) {
    insertChapter.run(`chapter-${order}`, order);
    insertSnapshot.run(`snapshot-${order}`, "novel-1", `chapter-${order}`, `第${order}章`, "{}", `2026-08-${String(order).padStart(2, "0")}`);
  }

  try {
    const plan = loadPlan(db, 2);
    assert.equal(plan.totalSnapshots, 3);
    assert.deepEqual(plan.archiveRows.map((row) => row.id), ["snapshot-1"]);
    assert.deepEqual(plan.byNovel, [{ novelId: "novel-1", onlineCount: 2, archiveCount: 1 }]);
  } finally {
    db.close();
  }
});

test("state snapshot archive execution requires an explicit flag", () => {
  assert.equal(parseArgs(["--dry-run"]).execute, false);
  assert.equal(parseArgs(["--execute", "--retention=100"]).execute, true);
  assert.equal(parseArgs(["--execute", "--retention=100"]).retention, 100);
});

test("state snapshot archive serializes linked state before removing online rows", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE StoryStateSnapshot (id TEXT PRIMARY KEY, novelId TEXT, sourceChapterId TEXT, summary TEXT, rawStateJson TEXT, createdAt TEXT);
    CREATE TABLE Chapter (id TEXT PRIMARY KEY, "order" INTEGER);
    CREATE TABLE CharacterState (id TEXT PRIMARY KEY, snapshotId TEXT, name TEXT);
    CREATE TABLE RelationState (id TEXT PRIMARY KEY, snapshotId TEXT, name TEXT);
    CREATE TABLE InformationState (id TEXT PRIMARY KEY, snapshotId TEXT, name TEXT);
    CREATE TABLE ForeshadowState (id TEXT PRIMARY KEY, snapshotId TEXT, name TEXT);
    CREATE TABLE OpenConflict (id TEXT PRIMARY KEY, sourceSnapshotId TEXT, name TEXT);
    CREATE TABLE PayoffLedgerItem (id TEXT PRIMARY KEY, lastSnapshotId TEXT, name TEXT);
    CREATE TABLE StoryPlan (id TEXT PRIMARY KEY, sourceStateSnapshotId TEXT, name TEXT);
    CREATE TABLE StoryStateSnapshotArchive (id TEXT PRIMARY KEY, novelId TEXT, sourceChapterId TEXT, sourceChapterOrder INTEGER, summary TEXT, snapshotJson TEXT, archivedAt TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(novelId, sourceChapterId));
  `);
  db.prepare("INSERT INTO Chapter VALUES (?, ?)").run("chapter-1", 1);
  db.prepare("INSERT INTO StoryStateSnapshot VALUES (?, ?, ?, ?, ?, ?)").run("snapshot-1", "novel-1", "chapter-1", "摘要", "{}", "2026-08-01");
  db.prepare("INSERT INTO CharacterState VALUES (?, ?, ?)").run("character-state-1", "snapshot-1", "主角");
  db.prepare("INSERT INTO OpenConflict VALUES (?, ?, ?)").run("conflict-1", "snapshot-1", "冲突");

  try {
    const plan = loadPlan(db, 0);
    assert.equal(plan.archiveRows.length, 1);
    assert.equal(archiveAndRemove(db, plan), 1);
    const archived = db.prepare("SELECT snapshotJson FROM StoryStateSnapshotArchive WHERE id = ?").get("snapshot-1");
    const parsed = JSON.parse(archived.snapshotJson);
    assert.equal(parsed.children.CharacterState[0].name, "主角");
    assert.equal(parsed.children.OpenConflict[0].name, "冲突");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM StoryStateSnapshot").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM CharacterState").get().count, 0);
    assert.equal(serializeSnapshot(db, { id: "missing", novelId: "novel-1", sourceChapterId: null, summary: null, rawStateJson: null, createdAt: "2026-08-01", sourceChapterOrder: null }).includes('"children"'), true);
    assert.equal(archiveAndRemove(db, plan), 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM StoryStateSnapshotArchive").get().count, 1);
  } finally {
    db.close();
  }
});
