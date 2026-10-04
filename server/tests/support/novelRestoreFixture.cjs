const { prisma } = require('../../dist/db/prisma.js');
const { captureNovelRuntimeArchive } = require('../../dist/services/novel/snapshots/infrastructure/NovelRuntimeArchive.js');
const { chapterArtifactDeltaService } = require('../../dist/services/novel/runtime/ChapterArtifactDeltaService.js');
const { ChapterArtifactSyncService } = require('../../dist/services/novel/runtime/ChapterArtifactSyncService.js');
const { NovelVolumeService } = require('../../dist/services/novel/volume/NovelVolumeService.js');
const { payoffLedgerSyncService } = require('../../dist/services/payoff/PayoffLedgerSyncService.js');

function installRestoreFixture() {
  const originals = [];
  let sequence = 0;
  let state = {
    chapter: [{ id:'chapter-1', novelId:'novel-1', title:'归来', order:1, content:'NEW manuscript', generationState:'approved', chapterStatus:'completed', updatedAt:new Date(10) }],
    novel: [{id:'novel-1',outline:'NEW outline',structuredOutline:null}],
    character: [{id:'hero',novelId:'novel-1',name:'林远',background:'保留的原始人物设定',currentState:'NEW state',currentGoal:'NEW goal',lastEvolvedAt:new Date(5)}],
    chapterSummary:[{id:'summary-1',novelId:'novel-1',chapterId:'chapter-1',summary:'NEW facts'}],
    novelSnapshot:[{id:'target',novelId:'novel-1',snapshotData:JSON.stringify({outline:'OLD outline',chapters:[{id:'chapter-1',content:'OLD manuscript'}]})}],
    chapterArtifactSyncCheckpoint:[],ragIndexJob:[],generationJob:[],
  };
  const match = (row, where={}) => Object.entries(where).every(([key,value]) => {
    if (key==='OR') return value.some(clause=>match(row,clause));
    if (key==='AND') return value.every(clause=>match(row,clause));
    if (key==='snapshot'||key==='report') return true;
    if (value && typeof value==='object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key]!==value.not;
      if ('gte' in value) return row[key]>=value.gte;
      if ('lt' in value) return row[key]<value.lt;
      if ('lte' in value) return row[key]<=value.lte;
    }
    return value instanceof Date ? row[key]?.getTime()===value.getTime() : row[key]===value;
  });
  const replace = (object,key,value) => { const old=object[key]; originals.push(()=>{object[key]=old;}); object[key]=value; };
  const models = [
    'novel','chapter','character','novelSnapshot','generationJob','ragIndexJob','chapterArtifactSyncCheckpoint',
    'storyStateSnapshot','characterState','relationState','informationState','foreshadowState',
    'storyStateSnapshotArchive','canonicalStateVersion','stateChangeProposal','openConflict',
    'payoffLedgerItem','characterResourceLedgerItem','characterResourceEvent',
    'characterMindSnapshot','characterCandidate','characterFactionTrack','characterRelationStage',
    'chapterSummary','consistencyFact','characterTimeline','novelFactEntry',
    'storyTimelineEvent','chapterTimeAnchor','timelineHook','timelineConstraint','timelineCheckReport',
    'qualityReport','auditReport','auditIssue','volumePlan','storyPlan','characterInfluenceProposal','characterDialogueInfluence',
  ];
  for (const model of models) {
    state[model] ??= [];
    const rows = args => {
      let found = state[model].filter(row=>match(row,args?.where));
      if (args?.orderBy) for (const order of [...(Array.isArray(args.orderBy)?args.orderBy:[args.orderBy])].reverse()) {
        for (const [key,direction] of Object.entries(order)) found=found.sort((a,b)=>(a[key]>b[key]?1:a[key]<b[key]?-1:0)*(direction==='desc'?-1:1));
      }
      return found;
    };
    replace(prisma[model],'findMany',async args=>structuredClone(rows(args)));
    replace(prisma[model],'findFirst',async args=>structuredClone(rows(args)[0]??null));
    replace(prisma[model],'findUnique',async args=>structuredClone(rows(args)[0]??null));
    replace(prisma[model],'findUniqueOrThrow',async args=>structuredClone(rows(args)[0]));
    replace(prisma[model],'count',async args=>rows(args).length);
    replace(prisma[model],'create',async({data})=>{
      const row={id:`${model}-${++sequence}`,createdAt:new Date(),updatedAt:new Date(),...data};state[model].push(row);return structuredClone(row);
    });
    replace(prisma[model],'createMany',async({data})=>{state[model].push(...structuredClone(data));return {count:data.length};});
    replace(prisma[model],'deleteMany',async(args)=>{const deleted=rows(args);state[model]=state[model].filter(row=>!deleted.includes(row));return {count:deleted.length};});
    replace(prisma[model],'updateMany',async({where,data})=>{const found=rows({where});found.forEach(row=>Object.assign(row,data,{updatedAt:new Date()}));return {count:found.length};});
    replace(prisma[model],'update',async({where,data})=>{const row=rows({where})[0];if(!row)throw new Error('missing '+model);Object.assign(row,data,{updatedAt:new Date()});return structuredClone(row);});
  }
  replace(prisma,'$transaction',async run=>{const before=structuredClone(state);try{return await run(prisma);}catch(error){state=before;throw error;}});
  replace(NovelVolumeService.prototype,'updateVolumesWithOptions',async()=>({volumes:[]}));
  replace(NovelVolumeService.prototype,'migrateLegacyVolumes',async()=>({volumes:[]}));
  replace(ChapterArtifactSyncService.prototype,'syncChapterArtifacts',async()=>{});
  replace(payoffLedgerSyncService,'syncLedger',async()=>({}));
  const calls=[];
  let failRebuild=false;
  replace(chapterArtifactDeltaService,'syncChapterArtifacts',async input=>{
    calls.push(input);
    if(failRebuild)throw new Error('mock AI unavailable');
    state.chapterSummary.push({id:'rebuilt-summary',novelId:input.novelId,chapterId:input.chapterId,summary:input.content});
    state.character[0].currentState=input.content;
    return {requiresFullReconcile:false};
  });
  return {
    get state(){return state;},calls,
    set failRebuild(value){failRebuild=value;},
    async backup(){
      const archive=await captureNovelRuntimeArchive('novel-1');
      const row={id:`backup-${++sequence}`,novelId:'novel-1',snapshotData:JSON.stringify({chapters:archive.chapters,runtimeArchive:archive})};
      state.novelSnapshot.push(row);return {id:row.id};
    },
    restore(){originals.reverse().forEach(fn=>fn());},
  };
}
module.exports={installRestoreFixture};
