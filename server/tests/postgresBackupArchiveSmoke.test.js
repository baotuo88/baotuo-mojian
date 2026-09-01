const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function commandAvailable(command) {
  const result = childProcess.spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return !result.error && result.status === 0;
}

function validateTestPostgresUrl(value) {
  if (!value) return { ok: false, reason: "TEST_POSTGRES_URL is not configured" };
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "TEST_POSTGRES_URL is not a valid URL" };
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    return { ok: false, reason: "TEST_POSTGRES_URL must use postgres or postgresql" };
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName || !/(^test$|^test[_-]|[_-]test$|[_-]test[_-])/i.test(databaseName)) {
    return { ok: false, reason: "TEST_POSTGRES_URL database name must be explicitly test-scoped" };
  }
  return { ok: true, databaseName };
}

function smokePrerequisite(env = process.env) {
  if (env.ENABLE_POSTGRES_BACKUP_SMOKE !== "1") {
    return { ok: false, reason: "ENABLE_POSTGRES_BACKUP_SMOKE=1 is required" };
  }
  const urlCheck = validateTestPostgresUrl(env.TEST_POSTGRES_URL);
  if (!urlCheck.ok) return urlCheck;
  if (!commandAvailable("pg_dump")) return { ok: false, reason: "pg_dump is unavailable" };
  if (!commandAvailable("pg_restore")) return { ok: false, reason: "pg_restore is unavailable" };
  return { ok: true, databaseUrl: env.TEST_POSTGRES_URL };
}

test("PostgreSQL backup smoke requires an explicitly test-scoped database", () => {
  assert.deepEqual(validateTestPostgresUrl("postgresql://localhost/novel"), {
    ok: false,
    reason: "TEST_POSTGRES_URL database name must be explicitly test-scoped",
  });
  assert.deepEqual(validateTestPostgresUrl("file:./test.db"), {
    ok: false,
    reason: "TEST_POSTGRES_URL must use postgres or postgresql",
  });
  assert.deepEqual(validateTestPostgresUrl("postgresql://localhost/novel_test"), {
    ok: true,
    databaseName: "novel_test",
  });
});

const prerequisite = smokePrerequisite();
test("pg_dump custom archive is readable by pg_restore", {
  skip: prerequisite.ok ? false : prerequisite.reason,
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-postgres-backup-smoke-"));
  const archivePath = path.join(tempDir, "database.dump");
  try {
    childProcess.execFileSync("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      archivePath,
    ], {
      env: { ...process.env, PGDATABASE: prerequisite.databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stats = fs.statSync(archivePath);
    assert.ok(stats.size > 0, "pg_dump should create a non-empty archive");
    const listing = childProcess.execFileSync("pg_restore", ["--list", archivePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.match(listing, /^;/m, "pg_restore should return a non-empty archive table of contents");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
