const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true });

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL?.trim() || "file:./dev.db";
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("数据库体检只支持 SQLite file: DATABASE_URL。");
  }
  const rawPath = databaseUrl.slice("file:".length) || "./dev.db";
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(ROOT_DIR, rawPath);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function tableCount(db, tableName) {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`).get();
  return Number(row.count);
}

function inspectDatabase() {
  const databasePath = resolveDatabasePath();
  if (!fs.existsSync(databasePath)) {
    throw new Error(`数据库文件不存在：${databasePath}`);
  }

  const stats = fs.statSync(databasePath);
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = db.pragma("quick_check", { simple: true });
    const snapshotCount = tableCount(db, "StoryStateSnapshot");
    const archivedSnapshotCount = tableCount(db, "StoryStateSnapshotArchive");
    const automaticSnapshotCount = tableCount(db, "NovelSnapshot");
    const childCounts = [
      ["CharacterState", tableCount(db, "CharacterState")],
      ["RelationState", tableCount(db, "RelationState")],
      ["InformationState", tableCount(db, "InformationState")],
      ["ForeshadowState", tableCount(db, "ForeshadowState")],
    ];
    const novelRows = db
      .prepare(
        `SELECT novelId, COUNT(*) AS count
         FROM StoryStateSnapshot
         GROUP BY novelId
         ORDER BY count DESC
         LIMIT 10`,
      )
      .all();

    console.log(`Database: ${databasePath}`);
    console.log(`Size: ${formatBytes(stats.size)}`);
    console.log(`SQLite quick_check: ${quickCheck}`);
    console.log(`StoryStateSnapshot: ${snapshotCount}`);
    console.log(`StoryStateSnapshotArchive: ${archivedSnapshotCount}`);
    console.log(`NovelSnapshot: ${automaticSnapshotCount}`);
    for (const [tableName, count] of childCounts) {
      console.log(`${tableName}: ${count}`);
    }
    if (novelRows.length > 0) {
      console.log("Top novels by state snapshot count:");
      for (const row of novelRows) {
        console.log(`- ${row.novelId}: ${row.count}`);
      }
    }
  } finally {
    db.close();
  }
}

try {
  inspectDatabase();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
