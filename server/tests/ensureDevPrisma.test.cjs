const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");

const scriptPath = path.resolve(__dirname, "../scripts/ensure-dev-prisma.cjs");
const serverDir = path.resolve(__dirname, "..");

test("dev prisma preparation recognizes an existing empty sqlite file as needing schema sync", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-dev-prisma-"));
  const dbPath = path.join(tempDir, "dev.db");
  const db = new Database(dbPath);
  db.close();

  const probe = spawnSync(process.execPath, [scriptPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
      NODE_ENV: "development",
    },
    encoding: "utf8",
  });

  assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
  const verified = new Database(dbPath, { readonly: true });
  const tables = verified.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  verified.close();
  assert.ok(tables.includes("Novel"));
  assert.ok(tables.includes("Chapter"));
  assert.ok(tables.includes("AppSetting"));
});
