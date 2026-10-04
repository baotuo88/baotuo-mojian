const test=require('node:test');
const assert=require('node:assert/strict');
const { NovelSnapshotRestoreService }=require('../dist/services/novel/snapshots/application/NovelSnapshotRestoreService.js');
const { captureNovelRuntimeArchive }=require('../dist/services/novel/snapshots/infrastructure/NovelRuntimeArchive.js');
const { NovelProductionOrchestrator }=require('../dist/services/novel/production/NovelProductionOrchestrator.js');
const { hasPendingRestoredNovelIndex }=require('../dist/services/rag/retrieval/RestoredNovelIndexBarrier.js');
const { installRestoreFixture }=require('./support/novelRestoreFixture.cjs');

test('legacy restore rebuilds summaries and runtime state from restored text while retaining character definitions',async()=>{
  const f=installRestoreFixture();try{
    await new NovelSnapshotRestoreService().restore('novel-1','target',()=>f.backup());
    assert.equal(f.state.chapter[0].content,'OLD manuscript');
    assert.equal(f.state.chapter[0].generationState,'drafted');
    assert.equal(f.state.chapterSummary[0].summary,'OLD manuscript');
    assert.equal(f.state.character[0].currentState,'OLD manuscript');
    assert.equal(f.state.character[0].background,'保留的原始人物设定');
    assert.equal(f.calls.length,1);
    assert.equal(f.state.chapterArtifactSyncCheckpoint[0].status,'succeeded');
    assert.equal(await hasPendingRestoredNovelIndex('novel-1'),true);
    const pendingJob = f.state.ragIndexJob.pop();
    assert.equal(await hasPendingRestoredNovelIndex('novel-1'),true);
    f.state.ragIndexJob.push(pendingJob);
    f.state.ragIndexJob.forEach(job=>{job.status='succeeded';});
    assert.equal(await hasPendingRestoredNovelIndex('novel-1'),false);
    f.state.ragIndexJob.length=0;
    assert.equal(await hasPendingRestoredNovelIndex('novel-1'),false);
    const backup=JSON.parse(f.state.novelSnapshot.find(row=>row.id.startsWith('backup')).snapshotData);
    assert.equal(backup.runtimeArchive.characters[0].currentState,'NEW state');
    assert.equal(backup.runtimeArchive.tables.chapterSummary[0].summary,'NEW facts');
  }finally{f.restore();}
});

test('full runtime snapshots restore their own facts without asking AI to reconstruct them',async()=>{
  const f=installRestoreFixture();try{
    const archive=await captureNovelRuntimeArchive('novel-1');
    archive.chapters[0].content='OLD manuscript';
    archive.tables.chapterSummary[0].summary='OLD saved facts';
    archive.characters[0].currentState='OLD saved state';
    const payload=JSON.parse(f.state.novelSnapshot[0].snapshotData);payload.runtimeArchive=archive;
    f.state.novelSnapshot[0].snapshotData=JSON.stringify(payload);
    await new NovelSnapshotRestoreService().restore('novel-1','target',()=>f.backup());
    assert.equal(f.state.chapterSummary[0].summary,'OLD saved facts');
    assert.equal(f.state.character[0].currentState,'OLD saved state');
    assert.equal(f.calls.length,0);
  }finally{f.restore();}
});

test('a failed rebuild stays recoverable and prevents production until retry succeeds',async()=>{
  const f=installRestoreFixture();try{
    const service=new NovelSnapshotRestoreService();f.failRebuild=true;
    await assert.rejects(service.restore('novel-1','target',()=>f.backup()),/资料尚未恢复完成/);
    assert.equal(f.state.chapter[0].content,'OLD manuscript');
    assert.equal(f.state.chapterArtifactSyncCheckpoint[0].status,'failed');
    const orchestrator=new NovelProductionOrchestrator();let called=false;
    orchestrator.register('chapter_preparation',{run:async()=>{called=true;return {};}});
    await assert.rejects(orchestrator.runStage({novelId:'novel-1',stage:'chapter_preparation',policy:{advanceMode:'manual'}}),/资料尚未恢复完成/);
    assert.equal(called,false);
    f.failRebuild=false;await service.ensureReady('novel-1');
    assert.equal(f.state.chapterArtifactSyncCheckpoint[0].status,'succeeded');
    assert.equal(f.state.chapterSummary.length,1);
  }finally{f.restore();}
});

test('concurrent edits abort the entire restore and preserve the newer manuscript',async()=>{
  const f=installRestoreFixture();try{
    await assert.rejects(new NovelSnapshotRestoreService().restore('novel-1','target',async()=>{
      const backup=await f.backup();f.state.chapter[0].content='CONCURRENT manuscript';return backup;
    }),/恢复期间被修改/);
    assert.equal(f.state.chapter[0].content,'CONCURRENT manuscript');
    assert.equal(f.state.chapterSummary[0].summary,'NEW facts');
    assert.equal(f.state.chapterArtifactSyncCheckpoint.length,0);
  }finally{f.restore();}
});

test('restore refuses to change text without a verified complete backup',async()=>{
  const f=installRestoreFixture();try{
    await assert.rejects(new NovelSnapshotRestoreService().restore('novel-1','target',async()=>({id:'target'})),/备份未通过校验/);
    assert.equal(f.state.chapter[0].content,'NEW manuscript');
  }finally{f.restore();}
});

test('a null-content snapshot restores an empty chapter instead of retaining later text',async()=>{
  const f=installRestoreFixture();try{
    f.state.novelSnapshot[0].snapshotData=JSON.stringify({outline:null,chapters:[{id:'chapter-1',content:null}]});
    await new NovelSnapshotRestoreService().restore('novel-1','target',()=>f.backup());
    assert.equal(f.state.chapter[0].content,null);
    assert.equal(f.state.chapter[0].generationState,'planned');
    assert.equal(f.state.chapterSummary.length,0);
    assert.equal(f.state.novel[0].outline,null);
  }finally{f.restore();}
});


test('legacy core restore delegates to the same application recovery capability', async () => {
  const shared = require('../dist/services/novel/application/sharedNovelServices.js');
  const { NovelCoreSnapshotService } = require('../dist/services/novel/novelCoreSnapshotService.js');
  const original = shared.getSharedNovelServices;
  const calls = [];
  shared.getSharedNovelServices = () => ({ restoreFromSnapshot: async (...args) => { calls.push(args); return { id: 'restored' }; } });
  try {
    const result = await new NovelCoreSnapshotService().restoreFromSnapshot('novel-1', 'target');
    assert.deepEqual(calls, [['novel-1', 'target']]);
    assert.equal(result.id, 'restored');
  } finally { shared.getSharedNovelServices = original; }
});
