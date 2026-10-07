"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkFiles, contentHash, discoverFiles, parseBaseline } = require("../format-check.cjs");

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "format-check-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, ".prettierrc"), '{"semi":true,"singleQuote":false}\n');
  await fs.writeFile(path.join(root, ".prettierignore"), "dist/\n");
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  return root;
}

test("only identical legacy bytes receive the formatting exception", async (t) => {
  const original = "const value='old'\n";
  const root = await fixture(t, { "legacy.js": original });
  const baseline = new Map([["legacy.js", contentHash(original)]]);
  const initial = await checkFiles(root, ["legacy.js"], baseline);
  assert.equal(initial.debt, 1);
  assert.deepEqual(initial.failures, []);

  await fs.writeFile(path.join(root, "legacy.js"), "const value='edited'\n");
  const changed = await checkFiles(root, ["legacy.js"], baseline);
  assert.equal(changed.debt, 0);
  assert.equal(changed.failures.length, 1);
  assert.match(changed.failures[0].reason, /hash does not match/);

  await fs.writeFile(path.join(root, "legacy.js"), 'const value = "edited";\n');
  const fixed = await checkFiles(root, ["legacy.js"], baseline);
  assert.equal(fixed.debt, 0);
  assert.equal(fixed.formatted, 1);
  assert.deepEqual(fixed.failures, []);
});

test("new files and renamed historical files must pass the real formatter", async (t) => {
  const source = "const value=1\n";
  const root = await fixture(t, { "new.js": source, "renamed.js": source });
  const result = await checkFiles(
    root,
    ["new.js", "renamed.js"],
    new Map([["old.js", contentHash(source)]]),
  );
  assert.equal(result.debt, 0);
  assert.equal(result.failures.length, 2);
});

test("a parser failure cannot be hidden even by an identical baseline hash", async (t) => {
  const invalid = "const = ;\n";
  const root = await fixture(t, { "broken.js": invalid });
  const result = await checkFiles(
    root,
    ["broken.js"],
    new Map([["broken.js", contentHash(invalid)]]),
  );
  assert.equal(result.debt, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].reason, /^Formatter error:/);
});

test("formatter configuration and invocation errors fail closed", async (t) => {
  const root = await fixture(t, { "source.js": 'const value = "ok";\n' });
  await fs.writeFile(path.join(root, ".prettierrc"), "{invalid json");
  const result = await checkFiles(root, ["source.js"], new Map());
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].reason, /^Formatter error:/);
});

test("Git discovery checks tracked and new source but excludes ignored artifacts", async (t) => {
  const root = await fixture(t, {
    ".gitignore": "ignored/\n",
    "tracked.js": "const tracked=1\n",
    "new.ts": "const added=2\n",
    "ignored/backup.js": "not valid JavaScript",
    "dist/generated.js": "not valid JavaScript",
    "scripts/format-check.cjs": "module.exports = {};\n",
    "unchanged-tool.cjs": "module.exports={}\n",
  });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "tracked.js"], { cwd: root });
  const files = discoverFiles(root);
  assert.deepEqual(files, [
    "dist/generated.js",
    "new.ts",
    "scripts/format-check.cjs",
    "tracked.js",
  ]);
  const result = await checkFiles(root, files, new Map());
  assert.equal(result.checked, 3);
  assert.equal(result.skipped, 1);
  assert.equal(result.failures.length, 2);

  await fs.unlink(path.join(root, "tracked.js"));
  const deleted = await checkFiles(root, ["tracked.js"], new Map());
  assert.equal(deleted.skipped, 1);
  assert.deepEqual(deleted.failures, []);
});

test("baseline loading rejects malformed metadata, paths and hashes", () => {
  const baseline = {
    schemaVersion: 1,
    sourceCommit: "a".repeat(40),
    comparisonCommit: "b".repeat(40),
    files: { "legacy.js": "c".repeat(64) },
  };
  assert.equal(parseBaseline(JSON.stringify(baseline)).get("legacy.js"), "c".repeat(64));
  assert.throws(() => parseBaseline("not json"));
  assert.throws(() => parseBaseline(JSON.stringify({ ...baseline, schemaVersion: 2 })));
  assert.throws(() => parseBaseline(JSON.stringify({ ...baseline, files: [] })));
  for (const file of ["../outside.js", "/outside.js", "dir\\file.js", "dir//file.js"]) {
    assert.throws(() =>
      parseBaseline(JSON.stringify({ ...baseline, files: { [file]: "c".repeat(64) } })),
    );
  }
  assert.throws(() =>
    parseBaseline(JSON.stringify({ ...baseline, files: { "legacy.js": "invalid" } })),
  );
});
