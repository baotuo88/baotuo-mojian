const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const { guardPrismaExecutionWrites } = require('../../dist/platform/execution');
const { ComicBatchOrchestrator } = require('../../dist/services/comic/ComicBatchOrchestrator');
const { confirmedPanelImage, panelSourceFingerprint } = require('../../dist/services/comic/assets');

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-production-'));
  const raw = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${path.join(root, 'fixture.sqlite')}` }) });
  t.after(() => raw.$disconnect());
  for (const sql of [
    `CREATE TABLE ComicEpisode (id TEXT PRIMARY KEY, projectId TEXT, "order" INTEGER, title TEXT,
      hookType TEXT, cliffhanger TEXT, isPaywalled BOOLEAN DEFAULT false, outline TEXT, sourceText TEXT,
      status TEXT DEFAULT 'scripted', scriptConfig TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE ComicPanel (id TEXT PRIMARY KEY, episodeId TEXT, "order" INTEGER, panelType TEXT,
      action TEXT, dialogues TEXT, characterRefs TEXT, sceneRef TEXT, visualPrompt TEXT, densityLevel TEXT,
      focus TEXT, layoutData TEXT, imageData TEXT, letteredData TEXT, motionData TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE ComicBatchJob (id TEXT PRIMARY KEY, projectId TEXT, episodeId TEXT, type TEXT,
      status TEXT, progress TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  ]) await raw.$executeRawUnsafe(sql);
  await raw.comicEpisode.create({ data: { id: 'episode', projectId: 'project', order: 1 } });
  for (let i = 1; i <= 3; i++) await raw.comicPanel.create({ data: {
    id: `panel-${i}`, episodeId: 'episode', order: i, action: `动作${i}`, visualPrompt: `画面${i}`,
  } });
  const client = guardPrismaExecutionWrites(raw);
  const pending = [], calls = [];
  const publish = async (id, db = client) => {
    const panel = await db.comicPanel.findUnique({ where: { id } });
    await db.comicPanel.updateMany({ where: { id }, data: { imageData: JSON.stringify({
      status: 'done', revision: `revision-${id}`, sourceFingerprint: panelSourceFingerprint(panel),
    }) } });
  };
  const deps = { db: client, launch: work => pending.push(work), resolveModel: async provider => `${provider}-image-model`,
    hasImage: async panel => Boolean(confirmedPanelImage(panel)),
    generate: async (id, provider) => { calls.push({ id, provider }); await publish(id); },
  };
  const service = new ComicBatchOrchestrator(deps);
  return { raw, client, deps, service, pending, calls, publish,
    progress: async id => JSON.parse((await raw.comicBatchJob.findUnique({ where: { id } })).progress),
    expire: async id => {
      const job = await raw.comicBatchJob.findUnique({ where: { id } });
      await raw.comicBatchJob.updateMany({ where: { id }, data: {
        progress: JSON.stringify({ ...JSON.parse(job.progress), leaseExpiresAt: Date.now() - 1 }),
      } });
    },
  };
}
module.exports = { fixture };
