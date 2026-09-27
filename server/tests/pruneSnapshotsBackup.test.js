const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(serverRoot, "scripts", "prune-snapshots.cjs");

function createSnapshotDatabase(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE NovelSnapshot (
      id TEXT PRIMARY KEY,
      novelId TEXT NOT NULL,
      triggerType TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
  const insert = db.prepare("INSERT INTO NovelSnapshot VALUES (?, ?, ?, ?)");
  insert.run("auto-1", "novel-1", "auto_milestone", "2026-01-01T00:00:00.000Z");
  insert.run("auto-2", "novel-1", "before_pipeline", "2026-01-02T00:00:00.000Z");
  insert.run("auto-3", "novel-1", "auto_milestone", "2026-01-03T00:00:00.000Z");
  insert.run("manual-1", "novel-1", "manual", "2025-12-31T00:00:00.000Z");
  db.close();
}

function readSnapshotIds(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    return db
      .prepare("SELECT id FROM NovelSnapshot ORDER BY id")
      .all()
      .map((row) => row.id);
  } finally {
    db.close();
  }
}

function verifyBackup(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA quick_check").get().quick_check, "ok");
    return db
      .prepare("SELECT id FROM NovelSnapshot ORDER BY id")
      .all()
      .map((row) => row.id);
  } finally {
    db.close();
  }
}

function runPrune(databasePath, backupDir, extraArgs = []) {
  return childProcess.spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: serverRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: `file:${databasePath}`,
      DB_BACKUP_DIR: backupDir,
      NOVEL_SNAPSHOT_RETENTION_COUNT: "1",
    },
  });
}

test("快照清理默认 dry-run 不写备份也不删除数据", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-snapshots-dry-"));
  const databasePath = path.join(tempDir, "dev.db");
  const backupDir = path.join(tempDir, "backups");
  try {
    createSnapshotDatabase(databasePath);
    const before = readSnapshotIds(databasePath);

    const result = runPrune(databasePath, backupDir);

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /Mode: dry-run/);
    assert.deepEqual(readSnapshotIds(databasePath), before);
    assert.equal(fs.existsSync(backupDir), false, "dry-run 不得创建备份目录");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("快照清理在删除前生成并校验备份，且只清理超量自动快照", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prune-snapshots-execute-"));
  const databasePath = path.join(tempDir, "dev.db");
  const backupDir = path.join(tempDir, "backups");
  try {
    createSnapshotDatabase(databasePath);

    const result = runPrune(databasePath, backupDir, ["--execute"]);

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const backupMatch = result.stdout.match(/Backup created: (.+)/);
    assert.ok(backupMatch, `应输出已创建备份路径：${result.stdout}`);
    const backupPath = backupMatch[1].trim();
    assert.equal(fs.existsSync(backupPath), true);
    assert.ok(fs.statSync(backupPath).size > 0, "备份文件不得为空");

    assert.deepEqual(
      verifyBackup(backupPath),
      ["auto-1", "auto-2", "auto-3", "manual-1"],
      "备份必须保留删除前的完整快照，证明备份发生在删除之前",
    );

    assert.match(result.stdout, /Deleted snapshots: 2/);
    assert.deepEqual(readSnapshotIds(databasePath), ["auto-3", "manual-1"]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
