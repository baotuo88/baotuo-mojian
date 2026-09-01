const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { createTempDatabase, runChildScenario } = require("./support/realSqliteHarness.cjs");

const childScript = path.join(__dirname, "support", "productionStartupChild.cjs");

function parseLastJsonLine(stdout) {
  const line = stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).reverse()
    .find((value) => value.startsWith("{"));
  if (!line) throw new Error(`Production startup child did not return JSON. stdout=${stdout}`);
  return JSON.parse(line);
}

test("production server starts on an isolated database and serves liveness", () => {
  const database = createTempDatabase({ prefix: "production-startup" });
  const result = runChildScenario({
    database,
    script: childScript,
    env: {
      NODE_ENV: "production",
      ALLOW_LAN: "false",
      CORS_ORIGIN: "http://127.0.0.1",
      RAG_ENABLED: "false",
      DIRECTOR_WORKER_EXECUTION_SLOTS: "1",
      DIRECTOR_WORKER_POLL_MS: "100",
    },
  });
  const payload = parseLastJsonLine(result.stdout);
  assert.equal(payload.status, 200);
  assert.equal(payload.payload.data.status, "ok");
});

test("production server rejects direct non-loopback exposure without authentication", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTrustedProxy = process.env.TRUSTED_REVERSE_PROXY;
  process.env.NODE_ENV = "production";
  delete process.env.TRUSTED_REVERSE_PROXY;
  try {
    const { assertProductionNetworkBoundary } = require("../dist/config/serverNetwork.js");
    assert.doesNotThrow(() => assertProductionNetworkBoundary("127.0.0.1"));
    assert.doesNotThrow(() => assertProductionNetworkBoundary("::1"));
    assert.throws(
      () => assertProductionNetworkBoundary("0.0.0.0"),
      /must bind to a loopback host until real authentication is implemented/,
    );
    process.env.TRUSTED_REVERSE_PROXY = "true";
    assert.doesNotThrow(() => assertProductionNetworkBoundary("0.0.0.0"));
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousTrustedProxy === undefined) delete process.env.TRUSTED_REVERSE_PROXY;
    else process.env.TRUSTED_REVERSE_PROXY = previousTrustedProxy;
  }
});

test("production database config rejects a missing DATABASE_URL", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.NODE_ENV = "production";
  delete process.env.DATABASE_URL;
  try {
    const { getDatabaseUrl } = require("../dist/config/database.js");
    assert.throws(() => getDatabaseUrl(), /DATABASE_URL is required in production/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
