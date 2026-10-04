const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
function load(relative, fixtures = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const sandbox = { module, exports: module.exports, console, Date, Set, Map, JSON, Buffer, require(id) {
    if (id.endsWith('/db/prisma')) return { prisma: fixtures.db };
    if (id.endsWith('/middleware/errorHandler')) return { AppError };
    if (id.endsWith('/prompting/core/promptRunner')) return { runStructuredPrompt: fixtures.prompt };
    if (id.endsWith('/adaptation/source/SourceContentPort')) return { adaptationSourceRegistry: { register() {}, resolve: () => fixtures.adapter } };
    if (id.endsWith('/adaptation/source/NovelSourceAdapter')) return { novelSourceAdapter: {} };
    if (id.endsWith('/drama/engine/rhythmEngine')) return { rhythmEngine: { listHooks: () => [], getTrack: () => null } };
    if (id.endsWith('/drama/engine/paywallPlanPolicy')) return {};
    if (id === '../production') return { isLiveBatch: job => { try { return job.status === 'running' && JSON.parse(job.progress).leaseExpiresAt > Date.now(); } catch { return false; } } };
    if (id.endsWith('/ComicFactService') && fixtures.factService) return { comicFactService: fixtures.factService };
    if (id.startsWith('.')) {
      let target = path.resolve(path.dirname(filename), id);
      if (fs.existsSync(target + '.ts')) target += '.ts';
      else if (fs.existsSync(path.join(target, 'index.ts'))) target = path.join(target, 'index.ts');
      if (target.endsWith('.ts')) return load(path.relative(path.resolve(__dirname, '../src'), target), fixtures, cache);
    }
    return require(id);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox, { filename });
  return module.exports;
}
function fixture() {
  const f = { saved: [], deleted: [], backups: [], updated: [] };
  const project = { id: 'p', title: '小说改编', sourceType: 'novel_import', sourceRef: 'novel', stylePreset: null, trackId: null, updatedAt: new Date(0), characters: [], characterAssets: [], scenes: [], facts: [], sourceBundle: { id: 'bundle', bundleJson: JSON.stringify({ synopsis: '情节', beats: [1,2,3].map(order => ({ order, summary: `章${order}`, sourceChapterStart: order, sourceChapterEnd: order })), characters: [] }) } };
  const episode = { id: 'e', projectId: 'p', order: 1, title: '第一话', outline: '这是第一话的完整剧情梗概', scriptConfig: JSON.stringify({ sourceRange: { start: 1, end: 3 } }), sourceText: null, updatedAt: new Date(0), panels: [], project };
  f.project = project; f.episode = episode;
  const db = {
    comicProject: { findUnique: async () => project, update: async () => project, updateMany: async () => ({ count: 1 }) },
    comicEpisode: { findUnique: async () => episode, findMany: async () => [], upsert: async a => { f.saved.push(a); return a.create; }, update: async a => { f.updated.push(a); Object.assign(episode, a.data); return episode; }, updateMany: async a => { f.updated.push(a); return { count: 1 }; } },
    comicPanel: { findMany: async () => episode.panels, deleteMany: async () => { f.deleted.push('panels'); return {count: 0}; }, createMany: async () => ({count: 1}) },
    comicFact: { findMany: async () => [], deleteMany: async () => ({count: 0}), createMany: async () => ({count: 0}) },
    comicScene: { createMany: async () => ({count: 0}) },
    comicBatchJob: { findFirst: async () => null, findMany: async () => [], create: async a => { const v = { id: 'backup', ...a.data }; f.backups.push(v); return v; }, findUnique: async () => f.backups.at(-1) },
    comicSourceBundle: { upsert: async () => project.sourceBundle },
    comicCharacter: { findMany: async () => project.characters, deleteMany: async () => { f.deleted.push('characters'); return {count: 1}; }, createMany: async () => ({count: 1}), create: async a => a.data, update: async a => a.data },
  };
  db.$transaction = async fn => fn(db);
  f.db = db; f.factService = { extractAndSave: async () => {} };
  return f;
}

test('outline preserves AI chapter mapping on the episode', async () => {
  const f = fixture();
  f.prompt = async () => ({ output: { episodes: [{ order: 1, title: '首话', synopsis: '一到三章的完整改编情节', isPaywalled: false, sourceChapterStart: 1, sourceChapterEnd: 3 }] } });
  const { ComicEpisodePlanService } = load('services/comic/ComicEpisodePlanService.ts', f);
  await new ComicEpisodePlanService().generateOutline('p', { count: 1 });
  assert.deepEqual(JSON.parse(f.saved[0].create.scriptConfig).sourceRange, { start: 1, end: 3 });
});

test('panel generation uses mapped chapters and retains mapping', async () => {
  const f = fixture(); let requested;
  f.adapter = { loadChapterText: async (_ref, start, end) => { requested = [start, end]; return '全范围正文'; } };
  f.prompt = async () => ({ output: { panels: [{ order: 1, panelType: 'action', action: '动作', visualPrompt: '画面', dialogues: [], characterRefs: [] }], scenes: [] } });
  const { ComicPanelScriptService } = load('services/comic/ComicPanelScriptService.ts', f);
  await new ComicPanelScriptService().generatePanelScript('e');
  assert.deepEqual(requested, [1, 3]);
  const save = f.updated.find(a => a.data.status === 'scripted');
  assert.deepEqual(JSON.parse(save.data.scriptConfig).sourceRange, { start: 1, end: 3 });
});

test('existing panels require explicit replacement before any model call or deletion', async () => {
  const f = fixture(); f.episode.panels = [{id:'old', imageData:'{"status":"done","url":"saved-image"}'}];
  let calls=0; f.prompt = async () => { calls++; return {output:{panels:[],scenes:[]}}; };
  const { ComicPanelScriptService } = load('services/comic/ComicPanelScriptService.ts', f);
  await assert.rejects(new ComicPanelScriptService().generatePanelScript('e'), e => e.statusCode === 409);
  assert.equal(calls, 0); assert.deepEqual(f.deleted, []);
});

test('reimport preserves character identities, visual anchors and assets', async () => {
  const f = fixture(); f.project.characters = [{id:'c',name:'主角',sourceCharacterRef:'source-c',visualAnchor:'用户设置',sheetData:'design',gender:'male'}];
  f.adapter = {loadBundle:async()=>({synopsis:'新梗概',beats:[],characters:[{name:'主角',sourceCharacterRef:'source-c',visualHint:'来自小说的新描述'}]})};
  const { ComicProjectService } = load('services/comic/ComicProjectService.ts', f);
  await new ComicProjectService().importSourceBundle('p');
  assert.deepEqual(f.deleted, []);
});

test('editing dialogues invalidates both generated image and lettered image', async () => {
  const f = fixture(); const panel={id:'panel',episodeId:'e',visualPrompt:'old',dialogues:'[]',imageData:'{"status":"done"}',letteredData:'{"status":"done"}'};
  f.db.comicPanel.findUnique=async()=>panel;
  f.db.comicPanel.update=async a=>{f.updated.push(a);return {...panel,...a.data}};
  f.db.comicPanel.updateMany=async a=>{f.updated.push(a);return {count:1}};
  const { ComicPanelScriptService } = load('services/comic/ComicPanelScriptService.ts', f);
  await new ComicPanelScriptService().updatePanelDialogues('panel',[{speaker:'甲',text:'新台词'}]);
  const saved=f.updated.find(a=>a.data.dialogues); assert.equal(saved.data.imageData,null); assert.equal(saved.data.letteredData,null);
});

test('panel prompt contains the end of full source material', () => {
  const {comicPanelScriptPrompt}=load('prompting/prompts/comic/comic.prompts.ts');
  const rendered=comicPanelScriptPrompt.render({projectTitle:'小说',episodeOrder:1,episodeTitle:'第一话',episodeSynopsis:'剧情',sourceText:'开场'.repeat(2000)+'最终关键事件',characters:[]});
  assert.ok(rendered.map(m=>m.content).join('\n').includes('最终关键事件'));
});

module.exports = { load, fixture };

test('legacy episode mapping is inferred by registered AI and never by episode order', async () => {
  const f=fixture(); f.episode.order=8; f.episode.scriptConfig=null; let reads;
  f.adapter={loadChapterText:async(_ref,start,end)=>{reads=[start,end];return '第二三章的原文';}};
  const calls=[]; f.prompt=async input=>{calls.push(input.asset.id);return input.asset.id==='comic.sourceMapping'
    ? {output:{matched:true,sourceChapterStart:2,sourceChapterEnd:3,rationale:'对应本话事件'}}
    : {output:{panels:[{order:1,panelType:'action',action:'动作',visualPrompt:'画面',dialogues:[],characterRefs:[]}],scenes:[]}};};
  const {ComicPanelScriptService}=load('services/comic/ComicPanelScriptService.ts',f);
  await new ComicPanelScriptService().generatePanelScript('e');
  assert.deepEqual(reads,[2,3]); assert.deepEqual(calls,['comic.sourceMapping','comic.panelScript']);
});

test('unmatched legacy source mapping preserves previous content without drafting', async () => {
  const f=fixture();f.episode.scriptConfig=null;
  f.prompt=async()=>({output:{matched:false,rationale:'没有匹配章节'}});
  const {ComicPanelScriptService}=load('services/comic/ComicPanelScriptService.ts',f);
  await assert.rejects(new ComicPanelScriptService().generatePanelScript('e'),e=>e.statusCode===422);
  assert.deepEqual(f.deleted,[]);assert.deepEqual(f.updated,[]);
});

test('expired image leases allow planning, live image leases block it', async()=>{
  const f=fixture(); let lease=Date.now()-10;
  f.db.comicBatchJob.findMany=async()=>[{type:'episode_image_batch',status:'running',progress:JSON.stringify({leaseExpiresAt:lease})}];
  const {assertPlanningIdle}=load('services/comic/planning/index.ts',f);
  await assertPlanningIdle(f.db,'p',['e']); lease=Date.now()+10000;
  await assert.rejects(assertPlanningIdle(f.db,'p',['e']),e=>e.statusCode===409);
});

test('facts from a superseded script are discarded', async()=>{
  const f=fixture();delete f.factService;
  f.episode.panels=[{id:'panel',order:1,action:'旧情节',dialogues:null,characterRefs:null,visualPrompt:'旧画面'}];
  let inserts=0;f.db.comicFact.createMany=async()=>{inserts++;};
  const baseline=structuredClone(f.episode);
  f.db.comicEpisode.findUnique=async()=>baseline;
  f.prompt=async()=>{ f.db.comicEpisode.findUnique=async()=>({...baseline,scriptConfig:'new revision'}); return {output:{facts:[{text:'旧事实',category:'completed'}]}}; };
  const {ComicFactService}=load('services/comic/ComicFactService.ts',f);
  await new ComicFactService().extractAndSave('e');
  assert.equal(inserts,0);
});

async function sqliteFixture(t) {
  const os=require('node:os');const Database=require('better-sqlite3');
  const {PrismaClient}=require('@prisma/client');const {PrismaBetterSqlite3}=require('@prisma/adapter-better-sqlite3');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'comic-planning-'));
  const filename=path.join(directory,'fixture.sqlite');
  const sqlite=new Database(filename);
  sqlite.exec(fs.readFileSync(path.resolve(__dirname,'../src/prisma/migrations.sqlite/20260612000000_add_comic_module/migration.sql'),'utf8'));
  sqlite.exec(fs.readFileSync(path.resolve(__dirname,'../src/prisma/migrations.sqlite/20260616183000_comic_panel_prompt_metadata/migration.sql'),'utf8'));
  sqlite.exec('ALTER TABLE ComicPanel ADD COLUMN sceneRef TEXT;');sqlite.close();
  const db=new PrismaClient({adapter:new PrismaBetterSqlite3({url:`file:${filename}`})});t.after(()=>db.$disconnect());
  await db.comicProject.create({data:{id:'p',title:'小说',sourceType:'novel_import',sourceRef:'novel'}});
  await db.comicSourceBundle.create({data:{projectId:'p',bundleJson:JSON.stringify({synopsis:'小说梗概',beats:[{order:1,summary:'第一章',sourceChapterStart:1,sourceChapterEnd:1}],characters:[]})}});
  await db.comicEpisode.create({data:{id:'e',projectId:'p',order:1,title:'原话',outline:'旧大纲',scriptConfig:JSON.stringify({sourceRange:{start:1,end:1}})}});
  await db.comicPanel.create({data:{id:'panel',episodeId:'e',order:1,action:'原稿动作',visualPrompt:'原稿画面',imageData:JSON.stringify({status:'done',url:'original.png'})}});
  await db.comicFact.create({data:{projectId:'p',episodeOrder:1,text:'原事实',category:'completed'}});
  const prompt=async()=>({output:{episodes:[{order:1,title:'新话',synopsis:'新规划的完整故事情节',isPaywalled:false,sourceChapterStart:1,sourceChapterEnd:1}]}});
  const {ComicEpisodePlanService}=load('services/comic/ComicEpisodePlanService.ts',{db,prompt});
  return {db,service:new ComicEpisodePlanService()};
}

test('real SQLite replacement archives original records and succeeds after locking',async(t)=>{
  const {db,service}=await sqliteFixture(t);
  await service.generateOutline('p',{count:1,replaceExisting:true});
  const saved=await db.comicEpisode.findUnique({where:{id:'e'}});assert.equal(saved.title,'新话');
  assert.equal(await db.comicPanel.count(),0);
  const backups=await db.comicBatchJob.findMany({where:{type:'planning_backup'}});assert.equal(backups.length,1);
  const archive=JSON.parse(backups[0].progress);assert.equal(archive.episodes[0].panels[0].imageData,'{"status":"done","url":"original.png"}');assert.equal(archive.facts[0].text,'原事实');
});

test('real SQLite backup failure rolls back replacement and retains manuscript and facts',async(t)=>{
  const {db,service}=await sqliteFixture(t);
  await db.$executeRawUnsafe("CREATE TRIGGER reject_comic_backup BEFORE INSERT ON ComicBatchJob BEGIN SELECT RAISE(ABORT, 'backup unavailable'); END");
  await assert.rejects(service.generateOutline('p',{count:1,replaceExisting:true}));
  assert.equal((await db.comicEpisode.findUnique({where:{id:'e'}})).title,'原话');
  assert.equal(await db.comicPanel.count(),1);assert.equal(await db.comicFact.count(),1);assert.equal(await db.comicBatchJob.count(),0);
});
