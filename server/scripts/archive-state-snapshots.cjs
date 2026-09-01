const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKUP_DIR = path.join(ROOT_DIR, "tmp", "db-backups");
const DEFAULT_DATABASE_URL = "file:./dev.db";
const DEFAULT_ONLINE_RETENTION = 100;
const SNAPSHOT_CHILD_TABLES = [
  ["CharacterState", "snapshotId"],
  ["RelationState", "snapshotId"],
  ["InformationState", "snapshotId"],
  ["ForeshadowState", "snapshotId"],
];
const LINKED_TABLES = [
  ["OpenConflict", "sourceSnapshotId"],
  ["PayoffLedgerItem", "lastSnapshotId"],
  ["StoryPlan", "sourceStateSnapshotId"],
];

dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

function parseArgs(argv) {
  const options = { execute: false, retention: DEFAULT_ONLINE_RETENTION };
  for (const arg of argv) {
    if (arg === "--execute") options.execute = true;
    else if (arg === "--dry-run") options.execute = false;
    else if (arg.startsWith("--retention=")) options.retention = Number(arg.slice("--retention=".length));
    else if (arg === "--help" || arg === "-h") options.help = true;
  }
  if (!Number.isInteger(options.retention) || options.retention < 1) {
    throw new Error("--retention must be a positive integer.");
  }
  return options;
}

function resolveDatabasePath() {
  const url = process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  if (!url.startsWith("file:")) throw new Error("Snapshot archiving only supports SQLite file: DATABASE_URL values.");
  const rawPath = url.slice("file:".length) || "./dev.db";
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(ROOT_DIR, rawPath);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function verifyDatabase(filePath) {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("quick_check", { simple: true }) !== "ok") throw new Error("SQLite quick_check failed.");
  } finally {
    db.close();
  }
}

async function createBackup(db, sourcePath) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `state_snapshot_archive_${timestamp()}.db`);
  await db.backup(backupPath);
  const stats = fs.statSync(backupPath);
  if (!stats.isFile() || stats.size <= 0) throw new Error(`Backup verification failed: ${backupPath}`);
  verifyDatabase(backupPath);
  console.log(`Verified backup: ${backupPath}`);
  console.log(`Source database: ${sourcePath}`);
  return backupPath;
}

function loadPlan(db, retention) {
  const snapshots = db.prepare(`
    SELECT s.id, s.novelId, s.sourceChapterId, s.summary, s.rawStateJson,
           s.createdAt, c."order" AS sourceChapterOrder
    FROM StoryStateSnapshot s
    LEFT JOIN Chapter c ON c.id = s.sourceChapterId
    ORDER BY s.novelId, sourceChapterOrder DESC, s.createdAt DESC
  `).all();
  const byNovel = new Map();
  for (const snapshot of snapshots) {
    const rows = byNovel.get(snapshot.novelId) || [];
    rows.push(snapshot);
    byNovel.set(snapshot.novelId, rows);
  }
  const archiveRows = [];
  for (const [novelId, rows] of byNovel) {
    const candidates = rows.slice(retention);
    archiveRows.push(...candidates.map((snapshot) => ({ novelId, ...snapshot })));
  }
  return {
    totalSnapshots: snapshots.length,
    archiveRows,
    byNovel: [...byNovel.entries()].map(([novelId, rows]) => ({
      novelId,
      onlineCount: Math.min(rows.length, retention),
      archiveCount: Math.max(rows.length - retention, 0),
    })).filter((row) => row.archiveCount > 0),
  };
}

function serializeSnapshot(db, snapshot) {
  const children = {};
  for (const [table, foreignKey] of [...SNAPSHOT_CHILD_TABLES, ...LINKED_TABLES]) {
    children[table] = db.prepare(`SELECT * FROM "${table}" WHERE "${foreignKey}" = ?`).all(snapshot.id);
  }
  return JSON.stringify({
    id: snapshot.id,
    novelId: snapshot.novelId,
    sourceChapterId: snapshot.sourceChapterId,
    summary: snapshot.summary,
    rawStateJson: snapshot.rawStateJson,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
    children,
  });
}

function archiveAndRemove(db, plan) {
  const insert = db.prepare(`
    INSERT INTO StoryStateSnapshotArchive
      (id, novelId, sourceChapterId, sourceChapterOrder, summary, snapshotJson)
    VALUES (@id, @novelId, @sourceChapterId, @sourceChapterOrder, @summary, @snapshotJson)
    ON CONFLICT(novelId, sourceChapterId) DO UPDATE SET
      sourceChapterOrder = excluded.sourceChapterOrder,
      summary = excluded.summary,
      snapshotJson = excluded.snapshotJson,
      archivedAt = CURRENT_TIMESTAMP
  `);
  const removeChildren = SNAPSHOT_CHILD_TABLES.map(([table]) => db.prepare(`DELETE FROM "${table}" WHERE snapshotId = ?`));
  const removeSnapshot = db.prepare("DELETE FROM StoryStateSnapshot WHERE id = ?");
  const transaction = db.transaction(() => {
    for (const snapshot of plan.archiveRows) {
      insert.run({
        id: snapshot.id,
        novelId: snapshot.novelId,
        sourceChapterId: snapshot.sourceChapterId,
        sourceChapterOrder: snapshot.sourceChapterOrder,
        summary: snapshot.summary,
        snapshotJson: serializeSnapshot(db, snapshot),
      });
      for (const statement of removeChildren) statement.run(snapshot.id);
      removeSnapshot.run(snapshot.id);
    }
  });
  transaction();
  return plan.archiveRows.length;
}

function printHelp() {
  console.log("Usage: pnpm --filter @ai-novel/server db:archive-state-snapshots -- [--dry-run|--execute] [--retention=100]");
  console.log("Archives state snapshots older than the newest retention count per novel.");
  console.log("Dry-run is the default. Execute mode creates and verifies a backup before migration.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const databasePath = resolveDatabasePath();
  if (!fs.existsSync(databasePath)) throw new Error(`Database does not exist: ${databasePath}`);
  const db = new Database(databasePath, { fileMustExist: true, readonly: !options.execute });
  db.pragma("busy_timeout = 5000");
  try {
    const plan = loadPlan(db, options.retention);
    console.log(`Mode: ${options.execute ? "execute" : "dry-run"}`);
    console.log(`Online retention per novel: ${options.retention}`);
    console.log(`State snapshots: ${plan.totalSnapshots}`);
    console.log(`Snapshots to archive: ${plan.archiveRows.length}`);
    for (const row of plan.byNovel.slice(0, 10)) {
      console.log(`- ${row.novelId}: online=${row.onlineCount} archive=${row.archiveCount}`);
    }
    if (!options.execute || plan.archiveRows.length === 0) return;
    console.log("Stop the dev server before execute mode to avoid SQLite write locks.");
    await createBackup(db, databasePath);
    const archived = archiveAndRemove(db, plan);
    verifyDatabase(databasePath);
    console.log(`Archived and removed online snapshots: ${archived}`);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { archiveAndRemove, loadPlan, parseArgs, resolveDatabasePath, serializeSnapshot };
