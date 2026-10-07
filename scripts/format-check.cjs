#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const prettier = require("prettier");

// Keep the existing format command's scope. Explicitly check this gate and its tests
// without silently expanding the historical baseline to previously unchecked scripts.
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md"]);
const gateFiles = new Set(["scripts/format-check.cjs", "scripts/tests/format-check.test.cjs"]);

function contentHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function parseBaseline(text) {
  const baseline = JSON.parse(text);
  if (
    baseline.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(baseline.sourceCommit) ||
    !/^[a-f0-9]{40}$/.test(baseline.comparisonCommit) ||
    !baseline.files ||
    Array.isArray(baseline.files) ||
    typeof baseline.files !== "object"
  ) {
    throw new Error("Invalid format baseline metadata");
  }
  for (const [file, hash] of Object.entries(baseline.files)) {
    if (
      file.startsWith("/") ||
      file.includes("\\") ||
      file.split("/").some((part) => !part || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/.test(hash)
    ) {
      throw new Error(`Invalid format baseline entry: ${file}`);
    }
  }
  return new Map(Object.entries(baseline.files));
}

function discoverFiles(root) {
  // --others includes new local source files; --exclude-standard excludes backups,
  // dependencies and other untracked artifacts without excluding tracked source.
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return [...new Set(output.split("\0"))]
    .filter((file) => extensions.has(path.extname(file)) || gateFiles.has(file))
    .sort();
}

async function checkFiles(root, files, baseline, formatter = prettier) {
  const result = { checked: 0, formatted: 0, debt: 0, skipped: 0, failures: [] };
  for (const file of files) {
    const absolutePath = path.join(root, file);
    try {
      let stat;
      try {
        stat = await fs.lstat(absolutePath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        result.skipped += 1;
        continue;
      }
      if (!stat.isFile()) {
        result.skipped += 1;
        continue;
      }
      const info = await formatter.getFileInfo(absolutePath, {
        ignorePath: path.join(root, ".prettierignore"),
      });
      if (info.ignored) {
        result.skipped += 1;
        continue;
      }
      const content = await fs.readFile(absolutePath);
      const options = (await formatter.resolveConfig(absolutePath)) ?? {};
      result.checked += 1;
      // Run the formatter before consulting the baseline: parser/configuration
      // errors must never turn into an accepted historical formatting difference.
      if (await formatter.check(content.toString("utf8"), { ...options, filepath: absolutePath })) {
        result.formatted += 1;
      } else if (baseline.get(file) === contentHash(content)) {
        result.debt += 1;
      } else {
        result.failures.push({
          file,
          reason: baseline.has(file)
            ? "Changed historical file must be formatted; baseline hash does not match"
            : "New or changed file must be formatted",
        });
      }
    } catch (error) {
      result.failures.push({ file, reason: `Formatter error: ${error.message}` });
    }
  }
  return result;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const baseline = parseBaseline(
    await fs.readFile(path.join(root, "scripts/quality/format-baseline.json"), "utf8"),
  );
  const result = await checkFiles(root, discoverFiles(root), baseline);
  for (const failure of result.failures) {
    console.error(`[format] ${failure.file}: ${failure.reason}`);
  }
  console.log(
    `Format check: ${result.checked} checked, ${result.formatted} formatted, ` +
      `${result.debt} unchanged historical debts, ${result.failures.length} failures, ` +
      `${result.skipped} ignored/deleted files.`,
  );
  if (result.debt > 0) {
    console.log("Historical debt is frozen by content hash; format every file you change.");
  }
  process.exitCode = result.failures.length > 0 ? 1 : 0;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[format] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { checkFiles, contentHash, discoverFiles, parseBaseline };
