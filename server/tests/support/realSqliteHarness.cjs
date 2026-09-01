const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const serverRoot = path.resolve(__dirname, "..", "..");
const prismaCli = path.join(
  serverRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

function formatOutput(output) {
  if (output == null) return "";
  return Buffer.isBuffer(output) ? output.toString("utf8") : String(output);
}

function attachChildOutput(error, { stdout, stderr } = {}) {
  const stdoutText = formatOutput(stdout);
  const stderrText = formatOutput(stderr);
  const details = [
    stdoutText && `stdout:\n${stdoutText}`,
    stderrText && `stderr:\n${stderrText}`,
  ].filter(Boolean).join("\n");
  if (details) {
    error.message += `\n${details}`;
  }
  error.stdout = stdoutText;
  error.stderr = stderrText;
  return error;
}

function databaseUrlFor(databasePath) {
  return `file:${databasePath.replace(/\\/g, "/")}`;
}

/**
 * Create and schema-initialize an isolated SQLite database for a real Prisma test.
 * The returned cleanup function is safe to call more than once.
 */
function createTempDatabase({ prefix = "real-sqlite", config = "prisma.config.ts" } = {}) {
  const options = typeof config === "string" ? { configPath: config } : config;
  const tempRoot = path.join(serverRoot, ".tmp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, `${prefix}-`));
  const databasePath = path.join(tempDir, "database.db");
  const databaseUrl = databaseUrlFor(databasePath);
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  try {
    const result = childProcess.spawnSync(
      prismaCli,
      ["db", "push", "--config", options.configPath || "prisma.config.ts", ...(options.prismaArgs || [])],
      {
        cwd: serverRoot,
        env: {
          ...process.env,
          ...(options.env || {}),
          DATABASE_URL: databaseUrl,
          NODE_ENV: options.nodeEnv || "test",
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (result.error) throw attachChildOutput(result.error, result);
    if (result.status !== 0) {
      const error = new Error(`Prisma db push failed with exit code ${result.status}`);
      error.status = result.status;
      throw attachChildOutput(error, result);
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  return {
    tempDir,
    databasePath,
    databaseUrl,
    cleanup,
  };
}

/**
 * Run a scenario in a fresh Node child from the server directory.
 * `script` may be a script path or Node arguments; env overrides are merged
 * while DATABASE_URL, NODE_ENV, and the server cwd are always controlled.
 */
function runChildScenario({
  database,
  script,
  args = [],
  env = {},
  nodeArgs = [],
  cleanup = true,
} = {}) {
  if (!database || !database.databaseUrl) throw new TypeError("database.databaseUrl is required");
  if (!script) throw new TypeError("script is required");

  try {
    const result = childProcess.spawnSync(process.execPath, [...nodeArgs, script, ...args], {
      cwd: serverRoot,
      env: {
        ...process.env,
        ...env,
        DATABASE_URL: database.databaseUrl,
        NODE_ENV: env.NODE_ENV || "test",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error) throw attachChildOutput(result.error, result);
    if (result.status !== 0) {
      const error = new Error(`Child scenario failed with exit code ${result.status}`);
      error.status = result.status;
      throw attachChildOutput(error, result);
    }
    return { stdout: formatOutput(result.stdout), stderr: formatOutput(result.stderr), status: result.status };
  } finally {
    if (cleanup) database.cleanup();
  }
}

module.exports = { createTempDatabase, runChildScenario };
