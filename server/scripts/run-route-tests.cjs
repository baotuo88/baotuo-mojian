const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const serverRoot = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-route-tests-"));
const databasePath = path.join(tempRoot, "routes.db");
const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
};
const prisma = path.join(serverRoot, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");

execFileSync(prisma, ["db", "push", "--config", "prisma.config.ts"], {
  cwd: serverRoot,
  env,
  stdio: "inherit",
});

const result = spawnSync(process.execPath, ["--test", "tests/routes.test.js"], {
  cwd: serverRoot,
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
