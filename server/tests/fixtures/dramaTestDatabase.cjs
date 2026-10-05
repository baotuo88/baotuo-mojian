const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Run before importing Prisma: even direct `node --test` must never use a developer DB.
module.exports = function prepareDramaDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drama-workspace-tests-"));
  process.env.DATABASE_URL = `file:${path.join(root, "fixture.sqlite").replace(/\\/g, "/")}`;
  process.env.NODE_ENV = "test";
  const server = path.resolve(__dirname, "../..");
  const executable = path.join(server, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
  execFileSync(executable, ["db", "push", "--config", "prisma.config.ts"], {
    cwd: server, env: process.env, stdio: "pipe",
  });
};
