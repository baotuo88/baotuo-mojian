const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PrismaClient } = require('../../node_modules/@prisma/client');
const { PrismaBetterSqlite3 } = require('../../node_modules/@prisma/adapter-better-sqlite3');
const { guardPrismaExecutionWrites } = require('../../dist/platform/execution');

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-fence-'));
  const raw = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${path.join(directory, 'fixture.sqlite')}` }) });
  t.after(() => raw.$disconnect());
  for (const sql of [
    `CREATE TABLE AgentRun (
      id TEXT PRIMARY KEY, status TEXT, novelId TEXT, chapterId TEXT,
      sessionId TEXT NOT NULL DEFAULT 'session', goal TEXT NOT NULL DEFAULT 'goal', entryAgent TEXT NOT NULL DEFAULT 'Planner',
      currentStep TEXT, currentAgent TEXT, error TEXT, startedAt DATETIME, finishedAt DATETIME, metadataJson TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    'CREATE TABLE NovelWorkflowTask (id TEXT PRIMARY KEY, status TEXT, cancelRequestedAt DATETIME, updatedAt DATETIME)',
    'CREATE TABLE DirectorRunCommand (id TEXT PRIMARY KEY, taskId TEXT, commandType TEXT NOT NULL DEFAULT \'continue\', status TEXT, leaseOwner TEXT, attempt INTEGER, leaseExpiresAt DATETIME, updatedAt DATETIME)',
    'CREATE TABLE AppSetting (key TEXT PRIMARY KEY, value TEXT, updatedAt DATETIME)',
    'CREATE TABLE Chapter (id TEXT PRIMARY KEY, novelId TEXT, content TEXT, updatedAt DATETIME NOT NULL)',
    'CREATE TABLE ChapterArtifactSyncCheckpoint (id TEXT PRIMARY KEY, status TEXT, metadataJson TEXT, updatedAt DATETIME NOT NULL)',
    "INSERT INTO AgentRun (id,status) VALUES ('run','running')",
    "INSERT INTO NovelWorkflowTask (id,status) VALUES ('task','running')",
    "INSERT INTO AppSetting (key,value) VALUES ('result','original')",
  ]) await raw.$executeRawUnsafe(sql);
  await raw.$executeRaw`INSERT INTO DirectorRunCommand (id,taskId,status,leaseOwner,attempt,leaseExpiresAt) VALUES ('cmd','task','running','worker',1,${new Date(Date.now() + 60_000)})`;
  return {
    raw, client: guardPrismaExecutionWrites(raw),
    fence: { kind: 'director', commandId: 'cmd', leaseOwner: 'worker', attempt: 1 },
    value: () => raw.appSetting.findUnique({ where: { key: 'result' }, select: { value: true } }),
  };
}


module.exports = { fixture };
