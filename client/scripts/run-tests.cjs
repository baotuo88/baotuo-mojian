const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
function listTests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTests(file);
    return entry.isFile() && /\.test\.(?:js|mjs)$/.test(entry.name) ? [file] : [];
  });
}
const files = ["src", "tests"].flatMap((dir) => listTests(path.join(root, dir))).sort();
if (files.length === 0) throw new Error("No client tests found.");
console.log(`Running ${files.length} client test files`);
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
