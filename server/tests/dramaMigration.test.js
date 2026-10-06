const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const prismaRoot = path.resolve(__dirname, "../src/prisma");
const migrationName = "20261006090000_drama_revision_render";
const migration = (chain) => fs.readFileSync(path.join(prismaRoot, chain, migrationName, "migration.sql"), "utf8");

// No Prisma or environment DATABASE_URL: every SQL statement targets a new in-memory DB.
function legacyDatabase() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE "DramaProject" ("id" TEXT PRIMARY KEY, "title" TEXT NOT NULL);
    CREATE TABLE "DramaEpisode" (
      "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "order" INTEGER NOT NULL,
      "title" TEXT NOT NULL, "content" TEXT,
      FOREIGN KEY("projectId") REFERENCES "DramaProject"("id")
    );
    CREATE TABLE "DramaStoryboard" (
      "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "episodeId" TEXT NOT NULL,
      "version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'draft',
      FOREIGN KEY("episodeId") REFERENCES "DramaEpisode"("id")
    );
    CREATE TABLE "DramaShot" (
      "id" TEXT PRIMARY KEY, "storyboardId" TEXT NOT NULL, "keyframeData" TEXT, "dialogueAudioData" TEXT,
      FOREIGN KEY("storyboardId") REFERENCES "DramaStoryboard"("id")
    );
    CREATE TABLE "DramaFact" (
      "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "episodeOrder" INTEGER NOT NULL,
      "text" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'completed', "source" TEXT NOT NULL DEFAULT 'auto',
      FOREIGN KEY("projectId") REFERENCES "DramaProject"("id")
    );
    CREATE TABLE "DramaCharacter" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL);
  `);
  db.prepare('INSERT INTO "DramaProject" VALUES (?, ?)').run("p", "保留已有作品");
  db.prepare('INSERT INTO "DramaEpisode" VALUES (?, ?, ?, ?, ?)').run("e", "p", 1, "旧集标题", "不能丢失的台本");
  db.prepare('INSERT INTO "DramaStoryboard" VALUES (?, ?, ?, ?, ?)').run("b", "p", "e", 1, "draft");
  db.prepare('INSERT INTO "DramaShot" VALUES (?, ?, ?, ?)').run("s", "b", '{"url":"old-keyframe.png"}', '{"items":[{"audioUrl":"old.wav"}]}');
  db.prepare('INSERT INTO "DramaFact" VALUES (?, ?, ?, ?, ?, ?)').run("f", "p", 1, "既有事实", "revealed", "script");
  db.prepare('INSERT INTO "DramaCharacter" VALUES (?, ?, ?)').run("c", "p", "原角色");
  return db;
}

function migratedDatabase(t) {
  const db = legacyDatabase();
  t.after(() => db.close());
  db.exec(migration("migrations.sqlite"));
  return db;
}

function addRevision(db, id = "r", revision = 0, episodeId = "e") {
  return db.prepare(`INSERT INTO "DramaEpisodeRevision"
    ("id", "episodeId", "revision", "title", "content", "source") VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, episodeId, revision, "版本标题", "版本正文", "baseline");
}

function scalarFields(schema, model) {
  const body = schema.match(new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m"))?.[1];
  assert.ok(body, `schema must contain ${model}`);
  return [...body.matchAll(/^\s*(\w+)\s+(?:String|Int|Boolean|DateTime)\??(?:\s|$)/gm)].map((match) => match[1]).sort();
}

function sqlFields(sql, model) {
  const body = sql.match(new RegExp(`CREATE TABLE "${model}" \\(([\\s\\S]*?)\\n\\);`))?.[1];
  assert.ok(body, `migration must create ${model}`);
  return [...body.matchAll(/^\s*"(\w+)"\s+/gm)].map((match) => match[1]).sort();
}

test("the actual SQLite upgrade preserves existing scripts, facts, characters and media", (t) => {
  const db = legacyDatabase();
  t.after(() => db.close());
  const tables = ["DramaProject", "DramaEpisode", "DramaStoryboard", "DramaShot", "DramaFact", "DramaCharacter"];
  const before = Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()]));
  db.exec(migration("migrations.sqlite"));
  for (const table of tables) {
    const after = db.prepare(`SELECT * FROM "${table}"`).all();
    assert.equal(after.length, before[table].length, `${table} row count`);
    for (let index = 0; index < after.length; index++) {
      for (const [column, value] of Object.entries(before[table][index])) {
        assert.deepEqual(after[index][column], value, `${table}.${column} must be preserved`);
      }
    }
  }
  assert.equal(db.prepare('SELECT "revision" FROM "DramaEpisode"').get().revision, 0);
  assert.equal(db.prepare('SELECT "factsStatus" FROM "DramaEpisode"').get().factsStatus, "ready");
  assert.equal(db.prepare('SELECT "sourceRevision" FROM "DramaStoryboard"').get().sourceRevision, 0);
  assert.deepEqual(db.prepare('SELECT "stale", "sourceRevision" FROM "DramaFact"').get(), { stale: 0, sourceRevision: null });
  assert.deepEqual(db.prepare('SELECT "portraitData", "threeViewData" FROM "DramaCharacter"').get(), { portraitData: null, threeViewData: null });
  assert.deepEqual(db.pragma("foreign_key_check"), []);
});

test("new revision and render rows receive valid database-generated creation timestamps", (t) => {
  const db = migratedDatabase(t);
  addRevision(db);
  db.prepare(`INSERT INTO "DramaRenderJob"
    ("id", "projectId", "episodeId", "storyboardId", "sourceRevision", "snapshotJson", "updatedAt")
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run("render", "p", "e", "b", 0, "{}");
  for (const table of ["DramaEpisodeRevision", "DramaRenderJob"]) {
    const createdAt = db.prepare(`SELECT "createdAt" FROM "${table}"`).get().createdAt;
    assert.match(createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.ok(Number.isFinite(Date.parse(`${createdAt.replace(" ", "T")}Z`)), `${table}: valid time, not a literal keyword`);
  }
  assert.deepEqual(db.prepare('SELECT "status", "progress", "resultUrl" FROM "DramaRenderJob"').get(), { status: "queued", progress: 0, resultUrl: null });
});

test("migrated snapshot keys reject duplicate versions and unknown parent episodes", (t) => {
  const db = migratedDatabase(t);
  addRevision(db);
  assert.throws(() => addRevision(db, "duplicate"), /UNIQUE constraint failed/);
  assert.throws(() => addRevision(db, "orphan", 1, "missing"), /FOREIGN KEY constraint failed/);
  assert.equal(db.prepare('SELECT COUNT(*) AS "count" FROM "DramaEpisodeRevision"').get().count, 1);
});

test("new table columns agree across both Prisma schemas and all migration chains", (t) => {
  const db = migratedDatabase(t);
  const schemas = ["schema.prisma", "schema.sqlite.prisma"].map((name) => fs.readFileSync(path.join(prismaRoot, name), "utf8"));
  for (const model of ["DramaEpisodeRevision", "DramaRenderJob"]) {
    const fields = db.pragma(`table_info("${model}")`).map((column) => column.name).sort();
    for (const schema of schemas) assert.deepEqual(fields, scalarFields(schema, model), `${model}: schema fields`);
    for (const chain of ["migrations", "migrations.sqlite", "migrations.compose"]) {
      assert.deepEqual(fields, sqlFields(migration(chain), model), `${model}: ${chain} fields`);
    }
  }
});

test("non-Compose upgrades add character image fields while Compose preserves its baseline fields", () => {
  for (const chain of ["migrations", "migrations.sqlite"]) {
    const sql = migration(chain);
    for (const field of ["portraitData", "threeViewData"]) {
      assert.match(sql, new RegExp(`ALTER TABLE "DramaCharacter" ADD COLUMN(?: IF NOT EXISTS)? "${field}" TEXT`));
    }
  }
  const composeBaseline = fs.readFileSync(path.join(prismaRoot, "migrations.compose", "00000000000000_compose_baseline", "migration.sql"), "utf8");
  const baselineCharacterColumns = sqlFields(composeBaseline, "DramaCharacter");
  assert.ok(baselineCharacterColumns.includes("portraitData"));
  assert.ok(baselineCharacterColumns.includes("threeViewData"));
  assert.doesNotMatch(migration("migrations.compose"), /ALTER TABLE "DramaCharacter" ADD COLUMN/);
});
