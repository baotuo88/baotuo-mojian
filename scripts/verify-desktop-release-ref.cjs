const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop", "package.json"), "utf8"));
const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
const refName = (process.argv[2] || process.env.GITHUB_REF_NAME || "").trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`desktop/package.json must contain stable semver, got ${version || "(empty)"}.`);
}
const expectedRef = `v${version}`;
if (refName !== expectedRef) {
  throw new Error(`Desktop release ref must exactly match ${expectedRef}, got ${refName || "(empty)"}.`);
}
console.log(`[desktop-release] verified ref=${refName} version=${version}`);
