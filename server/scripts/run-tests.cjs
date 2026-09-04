const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const testsRoot = path.join(serverRoot, "tests");

const integrationTests = new Set([
  "chapterRealSqlitePromptRunner.integration.test.js",
  "directorTaskFactInspection.test.js",
  "directorLeaseRecoveryRealPrisma.test.js",
  "directorWorkerClaimRaceRealPrisma.test.js",
  "directorWorkerProcessRecoveryRealPrisma.test.js",
  "longFormProductionAcceptance.integration.test.js",
  "directorWorkflowStepModules.test.js",
  "novelDirectorPipelineRuntime.test.js",
  "novelDirectorRetry.test.js",
  "novelWorkflowRuntime.test.js",
  "p0bRealPrismaChain.test.js",
  "prompting-governance.test.js",
  "prompting.test.js",
  "promptWorkbench.test.js",
  "postgresBackupArchiveSmoke.test.js",
  "productionStartup.integration.test.js",
  "ragCompatibilityBootstrap.test.js",
  "runtimeMigrations.test.js",
]);

const isolatedDatabaseTests = new Map([
  ["chapter-runtime-routes.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["chapterEditorPreview.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["characterLibrarySync.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelCharacterGenderRoutes.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelDirector.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelDirectorConfirmDedup.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelWorkflowContinue.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelWorkflowNotificationIntegration.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelWorkflowRecoveryNormalization.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelWorkflowStructuredOutlineProgress.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelWorkflowTaskAdapterModelBinding.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["routes.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["volumeRoutes.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["directorTaskFactInspection.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["directorWorkflowStepModules.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelDirectorPipelineRuntime.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelDirectorRetry.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["novelWorkflowRuntime.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["p0bRealPrismaChain.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["prompting-governance.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["prompting.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["promptWorkbench.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["ragCompatibilityBootstrap.test.js", "run-chapter-runtime-route-tests.cjs"],
  ["runtimeMigrations.test.js", "run-chapter-runtime-route-tests.cjs"],
]);

function listTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTestFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".test.js") ? [fullPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function selectTestFiles(mode) {
  const allFiles = listTestFiles(testsRoot);
  if (mode === "integration") {
    return allFiles.filter((file) => integrationTests.has(path.basename(file)));
  }
  if (mode === "fast") {
    return allFiles.filter((file) => !integrationTests.has(path.basename(file)));
  }
  if (mode === "all") {
    return allFiles;
  }
  throw new Error(`Unknown test mode: ${mode}`);
}

const mode = process.argv[2] ?? "fast";
const files = selectTestFiles(mode);

if (files.length === 0) {
  console.error(`No tests selected for mode ${mode}.`);
  process.exit(1);
}

if (mode === "fast" || mode === "integration") {
  for (const file of files) {
    const testRunner = isolatedDatabaseTests.get(path.basename(file));
    const result = spawnSync(
      process.execPath,
      testRunner
        ? [path.join(path.dirname(__filename), testRunner), path.relative(serverRoot, file)]
        : ["--test", file],
      {
      cwd: serverRoot,
      stdio: "inherit",
      },
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
  return;
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: serverRoot,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
