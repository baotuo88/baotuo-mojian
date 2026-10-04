const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('runtime archives round-trip real SQLite foreign keys and serialized dates', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-runtime-archive-'));
  const databaseUrl = `file:${path.join(directory, 'fixture.sqlite')}`;
  const serverRoot = path.resolve(__dirname, '..');
  const pushed = spawnSync(path.join(serverRoot, 'node_modules/.bin/prisma'), ['db', 'push', '--config', 'prisma.config.ts'], {
    cwd: serverRoot, encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' },
  });
  assert.equal(pushed.status, 0, `${pushed.stdout}\n${pushed.stderr}`);
  process.env.DATABASE_URL = databaseUrl;
  process.env.SQLITE_ENABLE_WAL = 'false';
  const { prisma } = require('../dist/db/prisma.js');
  const { captureNovelRuntimeArchive, clearNovelRuntime, applyNovelRuntimeArchive } = require('../dist/services/novel/snapshots/infrastructure/NovelRuntimeArchive.js');
  t.after(() => prisma.$disconnect());
  await prisma.novel.create({data:{id:'novel',title:'恢复测试小说'}});
  await prisma.chapter.create({data:{id:'chapter',novelId:'novel',title:'旧版本',order:1,content:'旧正文'}});
  const evolvedAt = new Date('2026-10-01T09:10:11.123Z');
  await prisma.character.createMany({data:[
    {id:'hero',novelId:'novel',name:'林远',role:'主角',background:'不能清除的人物设定',currentState:'旧状态',lastEvolvedAt:evolvedAt},
    {id:'ally',novelId:'novel',name:'友人',role:'配角'},
  ]});
  await prisma.storyStateSnapshot.create({data:{id:'state',novelId:'novel',sourceChapterId:'chapter',summary:'旧事实',
    characterStates:{create:{characterId:'hero',summary:'仍然存活'}},
    relationStates:{create:{sourceCharacterId:'hero',targetCharacterId:'ally',summary:'信任'}},
    informationStates:{create:{holderType:'character',holderRefId:'hero',fact:'旧事实',status:'known'}},
    foreshadowStates:{create:{title:'旧伏笔',status:'setup',setupChapterId:'chapter'}},
  }});
  await prisma.canonicalStateVersion.create({data:{id:'version',novelId:'novel',chapterId:'chapter',sourceType:'test',version:1,summary:'旧版本',snapshotJson:'{}'}});
  await prisma.stateChangeProposal.create({data:{novelId:'novel',chapterId:'chapter',committedVersionId:'version',sourceType:'test',proposalType:'character_state_update',riskLevel:'low',status:'committed',summary:'旧状态',payloadJson:'{}'}});
  await prisma.payoffLedgerItem.create({data:{novelId:'novel',ledgerKey:'one',title:'旧伏笔',summary:'待兑现',scopeType:'chapter',currentStatus:'setup',lastSnapshotId:'state',setupChapterId:'chapter'}});
  await prisma.characterResourceLedgerItem.create({data:{id:'resource',novelId:'novel',resourceKey:'key',name:'钥匙',summary:'旧钥匙',resourceType:'item',narrativeFunction:'key',ownerType:'character',ownerCharacterId:'hero',holderCharacterId:'hero',status:'held'}});
  await prisma.characterResourceEvent.create({data:{novelId:'novel',resourceId:'resource',chapterId:'chapter',eventType:'acquired',summary:'获得钥匙'}});
  await prisma.characterMindSnapshot.create({data:{id:'mind',novelId:'novel',characterId:'hero',sourceChapterId:'chapter',sourceType:'chapter',currentInterpretation:'信任朋友'}});
  await prisma.characterInfluenceProposal.create({data:{id:'influence',novelId:'novel',characterId:'hero',proposalSetId:'set',sourceMindSnapshotId:'mind',title:'引导',directionSummary:'同行',recommendationReason:'目标',behaviorGuidance:'同行',readerPayoff:'伙伴同行',risk:'low',status:'applied',acceptedAt:evolvedAt,appliedAt:evolvedAt,resolvedChapterId:'chapter',targetStartChapterOrder:1,targetEndChapterOrder:2}});
  await prisma.chapterSummary.create({data:{novelId:'novel',chapterId:'chapter',summary:'旧摘要'}});
  await prisma.consistencyFact.create({data:{novelId:'novel',chapterId:'chapter',category:'plot',content:'旧事实',source:'chapter_auto_extract'}});
  await prisma.characterTimeline.create({data:{novelId:'novel',characterId:'hero',chapterId:'chapter',title:'旧事件',content:'回家',source:'chapter_extract'}});
  await prisma.auditReport.create({data:{id:'audit',novelId:'novel',chapterId:'chapter',auditType:'continuity',issues:{create:{auditType:'continuity',severity:'low',code:'test',description:'旧问题',evidence:'旧正文',fixSuggestion:'复核'}}}});
  await prisma.volumePlan.create({data:{id:'volume',novelId:'novel',sortOrder:1,title:'卷一',completedSummaryJson:'{"narrativeProgress":"旧结果"}'}});
  await prisma.storyPlan.create({data:{id:'plan',novelId:'novel',chapterId:'chapter',level:'chapter',title:'计划',objective:'目标',status:'ready',sourceStateSnapshotId:'state'}});

  const archive = await prisma.$transaction(tx => captureNovelRuntimeArchive('novel', tx));
  const archivePath = path.join(directory, 'verified-runtime-backup.json');
  fs.writeFileSync(archivePath, JSON.stringify(archive));
  assert.ok(fs.statSync(archivePath).size > 1000);
  const restoredArchive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  await prisma.$transaction(tx => clearNovelRuntime('novel', tx), {timeout:30_000});
  assert.equal(await prisma.storyStateSnapshot.count(),0);
  assert.equal(await prisma.auditIssue.count(),0);
  assert.equal(await prisma.character.count(),2);
  assert.equal((await prisma.storyPlan.findUnique({where:{id:'plan'}})).status,'stale');
  await prisma.$transaction(tx => applyNovelRuntimeArchive('novel', restoredArchive, tx), {timeout:30_000});
  assert.equal(await prisma.characterState.count(),1);
  assert.equal(await prisma.relationState.count(),1);
  assert.equal(await prisma.characterResourceEvent.count(),1);
  assert.equal(await prisma.auditIssue.count(),1);
  const hero = await prisma.character.findUnique({where:{id:'hero'}});
  assert.equal(hero.background,'不能清除的人物设定');
  assert.equal(hero.lastEvolvedAt.toISOString(),evolvedAt.toISOString());
  const influence = await prisma.characterInfluenceProposal.findUnique({where:{id:'influence'}});
  assert.equal(influence.sourceMindSnapshotId,'mind');
  assert.equal(influence.status,'applied');
  assert.equal((await prisma.storyPlan.findUnique({where:{id:'plan'}})).sourceStateSnapshotId,'state');
  assert.equal((await prisma.payoffLedgerItem.findFirst()).lastSnapshotId,'state');
  assert.equal(await prisma.$queryRawUnsafe('PRAGMA foreign_key_check').then(rows=>rows.length),0);
  t.diagnostic(`Isolated SQLite and verified archive retained at ${directory}`);
});
