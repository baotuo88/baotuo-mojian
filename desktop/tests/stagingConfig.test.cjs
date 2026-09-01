const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

test("desktop staging keeps pnpm shared-lockfile deploy compatibility enabled", () => {
  const npmrc = fs.readFileSync(path.join(repoRoot, ".npmrc"), "utf8");
  assert.match(npmrc, /^inject-workspace-packages=true$/m);
  assert.match(npmrc, /^force-legacy-deploy=true$/m);
});
