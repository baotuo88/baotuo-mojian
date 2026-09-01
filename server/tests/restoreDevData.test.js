const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "server", "scripts", "restore-dev-data.cjs");

function createDatabase(filePath, rows) {
  const db = new DatabaseSync(filePath);
  db.exec("CREATE TABLE records (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const insert = db.prepare("INSERT INTO records (id, value) VALUES (?, ?)");
  for (const row of rows) insert.run(row.id, row.value);
  db.close();
}

function readRows(filePath) {
  const db = new DatabaseSync(filePath, { open: true, readOnly: true });
  try {
    return db.prepare("SELECT id, value FROM records ORDER BY id").all().map((row) => ({ id: row.id, value: row.value }));
  } finally {
    db.close();
  }
}

test("restore-dev-data rejects a corrupt source before changing the target", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-dev-data-corrupt-"));
  const sourcePath = path.join(tempDir, "corrupt.db");
  const targetPath = path.join(tempDir, "target.db");
  try {
    fs.writeFileSync(sourcePath, Buffer.from("not a sqlite database"));
    createDatabase(targetPath, [{ id: "safe", value: "unchanged" }]);

    const result = childProcess.spawnSync(process.execPath, [scriptPath, "--source", sourcePath, "--target", targetPath, "--execute"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, DB_BACKUP_DIR: path.join(tempDir, "backups") },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /quick_check|database|file is not a database/i);
    assert.deepEqual(readRows(targetPath), [{ id: "safe", value: "unchanged" }]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("restore-dev-data dry-run is non-destructive and execute performs verified round-trip", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-dev-data-"));
  const sourcePath = path.join(tempDir, "source.db");
  const targetPath = path.join(tempDir, "target.db");
  const backupDir = path.join(tempDir, "backups");
  try {
    createDatabase(sourcePath, [{ id: "kept", value: "from-source" }]);
    createDatabase(targetPath, [
      { id: "extra", value: "must-be-removed" },
      { id: "kept", value: "old-target-value" },
    ]);

    const dryRun = childProcess.spawnSync(process.execPath, [scriptPath, "--source", sourcePath, "--target", targetPath, "--dry-run"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, DB_BACKUP_DIR: backupDir },
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Dry run only/);
    assert.deepEqual(readRows(targetPath), [
      { id: "extra", value: "must-be-removed" },
      { id: "kept", value: "old-target-value" },
    ]);
    assert.equal(fs.existsSync(backupDir), false);

    const execute = childProcess.spawnSync(process.execPath, [scriptPath, "--source", sourcePath, "--target", targetPath, "--execute"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, DB_BACKUP_DIR: backupDir },
    });
    assert.equal(execute.status, 0, execute.stderr);
    assert.match(execute.stdout, /Restore completed/);
    assert.match(execute.stdout, /sha256:/);
    assert.deepEqual(readRows(targetPath), [{ id: "kept", value: "from-source" }]);

    const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith(".db"));
    assert.equal(backups.length, 1);
    const backupDb = new DatabaseSync(path.join(backupDir, backups[0]), { open: true, readOnly: true });
    try {
      assert.equal(backupDb.prepare("PRAGMA quick_check").get().quick_check, "ok");
    } finally {
      backupDb.close();
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
