#!/usr/bin/env node
// Run only against an empty, disposable PostgreSQL database after Compose migrations.
// All product services, Prisma transactions, image files and exports are real; only AI responses are fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');

async function main() {
  assert.equal(process.env.COMIC_SMOKE_ALLOW_WRITES, '1', 'Explicit disposable smoke database opt-in is required');
  const database = new URL(process.env.DATABASE_URL || '');
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol));
  assert.match(database.pathname, /^\/comic_smoke(?:_[a-z0-9_]+)?$/, 'Refusing a non-smoke database');
  assert.equal(process.env.AI_NOVEL_DATABASE_MODE, 'postgresql');
  assert.equal(process.env.AI_NOVEL_COMPOSE_BASELINE, 'true');
  const dist = path.resolve(__dirname, '../dist');
  const promptCalls = [];
  const imageCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('External HTTP is forbidden in the comic smoke test'); };
  const inject = (relative, exports) => {
    const id = require.resolve(path.join(dist, relative));
    require.cache[id] = { id, filename: id, loaded: true, exports };
  };
  const sourceText = '林舟穿着蓝色旅行外套进入大厅，带回地图并帮助伙伴找到出口。结尾：两人平安回家。';
  inject('prompting/core/promptRunner.js', { async runStructuredPrompt({ asset, promptInput }) {
    promptCalls.push(asset.id);
    let output;
    switch (asset.id) {
      case 'comic.sourceBundle':
        assert.equal(promptInput.sourceInput, sourceText);
        output = { synopsis: sourceText, beats: [{ order: 1, summary: sourceText }],
          characters: [{ name: '林舟', gender: 'male', persona: '耐心可靠', visualHint: '黑发青年，蓝色旅行外套' }], hardFacts: [] };
        break;
      case 'comic.episodeOutline':
        output = { episodes: [{ order: 1, title: '回家的地图', synopsis: '林舟在大厅中找到地图，并与伙伴一起平安回家。',
          isPaywalled: false, ...(promptInput.requireSourceRange ? { sourceChapterStart: 2, sourceChapterEnd: 2 } : {}) }] };
        break;
      case 'comic.panelScript':
        output = { scenes: [{ name: '大厅', sceneType: 'interior', palette: '暖黄色', keyElements: '木门与地图桌' }],
          panels: Array.from({ length: 10 }, (_, index) => index + 1).map(order => ({ order, panelType: order === 1 ? 'establishing' : 'reaction',
            focus: '林舟与地图', action: order === 1 ? '林舟进入大厅' : '林舟带着地图回家',
            visualPrompt: order === 1 ? '林舟进入大厅查看桌上的地图' : '林舟带着地图与伙伴平安回家',
            sceneRef: '大厅', dialogues: [{ speaker: '林舟', text: order === 1 ? '找到地图了。' : '我们回家吧。', bubbleType: 'round' }],
            characterRefs: [{ name: '林舟', costume: '旅行外套', expression: 'happy' }] })) };
        break;
      case 'comic.factExtraction':
        output = { facts: [{ text: '林舟带着地图平安回家。', category: 'completed' }] };
        break;
      default: throw new Error('Unexpected AI prompt in smoke: ' + asset.id);
    }
    output = asset.outputSchema.parse(output);
    if (asset.postValidate) output = asset.postValidate(output, promptInput);
    assert.ok(asset.render(promptInput).length > 0);
    return { output };
  } });
  inject('services/image/provider.js', {
    isImageProviderSupported: () => true, resolveImageModel: async () => 'smoke-fixture',
    async generateImagesByProvider(input) {
      for (const filename of input.refImagePaths || []) await fs.access(filename);
      imageCalls.push(input);
      const image = await sharp({ create: { width: 800, height: 1200, channels: 3,
        background: imageCalls.length % 2 ? '#9cb8c7' : '#e0c7b4' } }).png().toBuffer();
      return { images: [{ url: 'data:image/png;base64,' + image.toString('base64') }] };
    },
  });
  const { prisma } = require(path.join(dist, 'db/prisma.js'));
  try {
    const [identity] = await prisma.$queryRawUnsafe('SELECT current_database() AS name, version() AS version');
    assert.match(identity.name, /^comic_smoke(?:_[a-z0-9_]+)?$/);
    assert.match(identity.version, /^PostgreSQL 17\./);
    assert.equal(await prisma.comicProject.count(), 0, 'Smoke database contains prior comic data; create a new database/volume');
    assert.equal(await prisma.novel.count(), 0, 'Smoke database contains prior novel data; create a new database/volume');
    const fontFamilies = execFileSync('fc-list', [':lang=zh', 'family'], { encoding: 'utf8' });
    const font = fontFamilies.split('\n').find(family => family.includes('Noto Sans CJK SC'));
    assert.ok(font, 'CJK fallback font is required for Chinese comic lettering');
    const service = name => require(path.join(dist, 'services/comic', name + '.js'));
    const comicProjectService = new (service('ComicProjectService').ComicProjectService)();
    const comicEpisodePlanService = new (service('ComicEpisodePlanService').ComicEpisodePlanService)();
    const comicPanelScriptService = new (service('ComicPanelScriptService').ComicPanelScriptService)();
    const { comicCharacterImageService } = service('ComicCharacterImageService');
    const { comicCharacterAssetService } = service('ComicCharacterAssetService');
    const { comicSceneService } = service('ComicSceneService');
    const { comicPanelImageService } = service('ComicPanelImageService');
    const { comicBubbleLayoutService } = service('ComicBubbleLayoutService');
    const { comicExportService } = service('ComicExportService');
    const project = await comicProjectService.createProject({ title: 'Comic PostgreSQL smoke', sourceType: 'text_import', rawText: sourceText,
      stylePreset: JSON.stringify({ style: 'webtoon_color', format: 'webtoon' }) });
    const imported = await comicProjectService.importSourceBundle(project.id);
    assert.equal(JSON.parse(imported.sourceBundle.bundleJson).rawText, sourceText);
    const original = await comicProjectService.createProject({ title: 'Smoke original story', sourceType: 'original', inspiration: sourceText });
    const originalBundle = await comicProjectService.importSourceBundle(original.id);
    assert.equal(originalBundle.characters[0].name, '林舟');
    assert.ok(JSON.parse(originalBundle.sourceBundle.bundleJson).beats.length > 0);
    const character = imported.characters[0];
    await comicCharacterImageService.generateCharacterSheet(character.id);
    const asset = await comicCharacterAssetService.createAsset({ projectId: project.id, characterId: character.id, assetType: 'costume', name: '旅行外套' });
    const png = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'blue' } }).png().toBuffer();
    await comicCharacterAssetService.uploadAssetImage(asset.id, png, 'image/png');
    const oldAssetFile = await comicCharacterAssetService.serveAssetImage(asset.id);
    const jpeg = await sharp(png).jpeg().toBuffer();
    await comicCharacterAssetService.uploadAssetImage(asset.id, jpeg, 'image/jpeg');
    assert.equal((await comicCharacterAssetService.serveAssetImage(asset.id)).mimeType, 'image/jpeg');
    await fs.access(oldAssetFile.filePath);
    const { createAssetReferenceAdapter } = require(path.join(dist, 'services/comic/assets/index.js'));
    const snapshot = await prisma.comicCharacterAsset.findUniqueOrThrow({ where: { id: asset.id },
      include: { character: true, project: { select: { stylePreset: true } } } });
    const late = createAssetReferenceAdapter(snapshot);
    await late.saveState({ status: 'generating' });
    const lateFile = late.diskPath('png'); await fs.mkdir(path.dirname(lateFile), { recursive: true });
    await fs.writeFile(lateFile, png);
    await comicCharacterAssetService.uploadAssetImage(asset.id, jpeg, 'image/jpeg');
    const winner = (await prisma.comicCharacterAsset.findUniqueOrThrow({ where: { id: asset.id } })).imageData;
    await assert.rejects(late.saveState({ status: 'done' }), error => error.statusCode === 409);
    await late.saveState({ status: 'error' });
    assert.equal((await prisma.comicCharacterAsset.findUniqueOrThrow({ where: { id: asset.id } })).imageData, winner);
    await comicEpisodePlanService.generateOutline(project.id, { count: 1 });
    const episode = await prisma.comicEpisode.findFirstOrThrow({ where: { projectId: project.id } });
    const script = await comicPanelScriptService.generatePanelScript(episode.id, { targetPanelCount: 10 });
    assert.equal(script.panels.length, 10);
    assert.equal(await prisma.comicFact.count({ where: { projectId: project.id } }), 1);
    const scene = await prisma.comicScene.findFirstOrThrow({ where: { projectId: project.id } });
    await comicSceneService.generateSceneSheet(scene.id);
    for (const panel of script.panels) {
      const generated = await comicPanelImageService.generatePanelImage(panel.id);
      assert.equal(generated.referenceImages.length, 3);
      assert.ok(generated.referenceImages.every(reference => reference.url.includes('?revision=')));
      await comicBubbleLayoutService.letterPanel(panel.id);
    }
    const exported = await comicExportService.exportEpisode(episode.id, 'sliced', { sliceWidth: 400, sliceMaxHeight: 3500 });
    assert.equal(exported.artifacts.length, 2);
    assert.equal(exported.artifacts.reduce((sum, artifact) => sum + artifact.height, 0), 6000);
    for (const artifact of exported.artifacts) {
      const meta = await sharp(artifact.filePath).metadata();
      assert.equal(meta.width, 400);
      assert.ok(await comicExportService.getArtifactFile(exported.jobId, path.basename(artifact.filePath)));
    }
    const completed = await comicExportService.getExportJob(exported.jobId);
    assert.equal(completed.status, 'done');
    assert.equal(JSON.parse(completed.spec).inputSnapshot.panels.length, 10);

    // Exercise the real shared novel adapter and source range mapping on PostgreSQL, not a mock repository.
    const novel = await prisma.novel.create({ data: { title: 'Smoke source novel', description: sourceText } });
    await prisma.character.create({ data: { novelId: novel.id, name: '林舟', role: '主角', gender: 'male', appearance: '黑发青年' } });
    await prisma.chapter.createMany({ data: [
      { novelId: novel.id, order: 1, title: '开场', content: 'FIRST_CHAPTER_ONLY 林舟离家出发。' },
      { novelId: novel.id, order: 2, title: '回家', content: 'SECOND_CHAPTER_ONLY ' + sourceText },
    ] });
    const adaptation = await comicProjectService.createProject({ title: 'Smoke novel adaptation', sourceType: 'novel_import', sourceRef: novel.id });
    await comicProjectService.importSourceBundle(adaptation.id);
    await comicEpisodePlanService.generateOutline(adaptation.id, { count: 1 });
    const mapped = await prisma.comicEpisode.findFirstOrThrow({ where: { projectId: adaptation.id } });
    assert.deepEqual(JSON.parse(mapped.scriptConfig).sourceRange, { start: 2, end: 2 });
    const adapted = await comicPanelScriptService.generatePanelScript(mapped.id, { targetPanelCount: 10 });
    assert.ok(adapted.sourceText.includes('SECOND_CHAPTER_ONLY'));
    assert.ok(!adapted.sourceText.includes('FIRST_CHAPTER_ONLY'));
    assert.ok(promptCalls.includes('comic.sourceBundle') && promptCalls.includes('comic.episodeOutline') && promptCalls.includes('comic.panelScript'));
    // Exercise the separate running API through the same Nginx entrypoint used by browsers.
    // The hostname belongs only to this isolated Compose network; model calls remain stubbed above.
    const base = 'http://web:8080';
    const home = await originalFetch(base);
    assert.equal(home.status, 200);
    const html = await home.text();
    const entry = html.match(/<script[^>]+src="([^"]+)"/);
    assert.ok(entry && entry[1].startsWith('/assets/'), 'Built frontend entrypoint missing');
    assert.equal((await originalFetch(base + entry[1])).status, 200);
    assert.equal((await originalFetch(base + '/api/health/live')).status, 200);
    const listed = await originalFetch(base + '/api/comic/projects');
    assert.equal(listed.status, 200);
    assert.ok((await listed.json()).data.some(item => item.id === project.id));
    const currentAsset = JSON.parse(winner);
    const assetResponse = await originalFetch(base + currentAsset.url);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get('content-type'), /image\/jpeg/);
    assert.equal((await sharp(Buffer.from(await assetResponse.arrayBuffer())).metadata()).format, 'jpeg');
    for (const artifact of exported.artifacts) {
      const response = await originalFetch(base + artifact.url);
      assert.equal(response.status, 200);
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      assert.equal(metadata.width, artifact.width);
      assert.equal(metadata.height, artifact.height);
    }
    console.log(JSON.stringify({ result: 'passed', database: identity.name, postgres: identity.version.split(' ').slice(0, 2).join(' '),
      node: process.versions.node, font, projectId: project.id, exportJobId: exported.jobId, artifacts: exported.artifacts.length,
      httpChecks: 5 + exported.artifacts.length,
      promptCalls: promptCalls.length, imageCalls: imageCalls.length, externalHttpCalls: 0,
      imageRoot: path.dirname(path.dirname(path.dirname(exported.artifacts[0].filePath))) }, null, 2));
  } finally {
    global.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error('[comic-postgres-smoke]', error.message); process.exitCode = 1; });
