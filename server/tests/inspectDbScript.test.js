const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(serverRoot, "scripts", "inspect-db.cjs");

function createHealthDatabase(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE StoryStateSnapshot (id TEXT PRIMARY KEY, novelId TEXT NOT NULL);
    CREATE TABLE StoryStateSnapshotArchive (id TEXT PRIMARY KEY, novelId TEXT NOT NULL);
    CREATE TABLE NovelSnapshot (id TEXT PRIMARY KEY, novelId TEXT NOT NULL);
    CREATE TABLE CharacterState (id TEXT PRIMARY KEY, snapshotId TEXT);
    CREATE TABLE RelationState (id TEXT PRIMARY KEY, snapshotId TEXT);
    CREATE TABLE InformationState (id TEXT PRIMARY KEY, snapshotId TEXT);
    CREATE TABLE ForeshadowState (id TEXT PRIMARY KEY, snapshotId TEXT);
  `);
  db.exec(`
    INSERT INTO StoryStateSnapshot VALUES ('s1', 'novel-1'), ('s2', 'novel-1');
    INSERT INTO StoryStateSnapshotArchive VALUES ('a1', 'novel-1');
    INSERT INTO NovelSnapshot VALUES ('n1', 'novel-1');
    INSERT INTO CharacterState VALUES ('c1', 's1');
    INSERT INTO ForeshadowState VALUES ('f1', 's2');
  `);
  db.close();
}

function runInspect(databaseUrl) {
  return childProcess.spawnSync(process.execPath, [scriptPath], {
    cwd: serverRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

test("数据库体检只读输出体积、完整性和状态快照规模", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "inspect-db-"));
  const databasePath = path.join(tempDir, "health.db");
  try {
    createHealthDatabase(databasePath);
    const sizeBefore = fs.statSync(databasePath).size;

    const result = runInspect(`file:${databasePath}`);

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /SQLite quick_check: ok/);
    assert.match(result.stdout, /Size: /);
    assert.match(result.stdout, /StoryStateSnapshot: 2/);
    assert.match(result.stdout, /StoryStateSnapshotArchive: 1/);
    assert.match(result.stdout, /NovelSnapshot: 1/);
    assert.match(result.stdout, /CharacterState: 1/);
    assert.match(result.stdout, /ForeshadowState: 1/);
    assert.match(result.stdout, /- novel-1: 2/);

    assert.equal(fs.statSync(databasePath).size, sizeBefore, "体检不得写入 SQLite 文件");
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      assert.equal(
        fs.existsSync(`${databasePath}${suffix}`),
        false,
        `体检不得生成 ${suffix} 副文件`,
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("数据库体检拒绝非 SQLite 连接串", () => {
  const result = runInspect("postgres://user:pass@localhost:5432/novel");

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /只支持 SQLite/);
});

test("数据库体检在文件缺失或损坏时返回明确错误", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "inspect-db-bad-"));
  try {
    const missing = runInspect(`file:${path.join(tempDir, "missing.db")}`);
    assert.notEqual(missing.status, 0);
    assert.match(`${missing.stdout}${missing.stderr}`, /数据库文件不存在/);

    const corruptPath = path.join(tempDir, "corrupt.db");
    fs.writeFileSync(corruptPath, Buffer.from("not a sqlite database"));
    const corrupt = runInspect(`file:${corruptPath}`);
    assert.notEqual(corrupt.status, 0);
    assert.match(`${corrupt.stdout}${corrupt.stderr}`, /quick_check|not a database|malformed/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
