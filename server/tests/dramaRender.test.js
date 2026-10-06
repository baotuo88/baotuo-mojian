const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');

class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
function loadRender(relative, fixture = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const sandbox = { module, exports: module.exports, process, console, Buffer, URL, AbortSignal, AbortController, setTimeout, clearTimeout, Date, Set, Map, JSON, require(id) {
      if (fixture.mocks?.[id]) return fixture.mocks[id];
      if (id.endsWith('/middleware/errorHandler')) return { AppError };
      if (id.endsWith('/db/prisma')) return { prisma: fixture.db };
      if (id.endsWith('/runtime/appPaths')) return { resolveGeneratedMediaRoot: () => fixture.mediaRoot };
      if (id.endsWith('/modules/media')) return {
        resolveMediaAssetPath: (kind, filename) => path.join(fixture.mediaRoot, kind, filename),
        publishMediaAssetFile: async ({ filePath }) => { assert.ok(fs.statSync(filePath).size > 0); fixture.published = true; return { url: '/api/media/assets/video/finished.mp4' }; },
      };
      if (id.endsWith('/DramaExportService')) return { dramaExportService: { exportEpisode: async () => ({ body: JSON.stringify(fixture.timeline) }) } };
      if (id.endsWith('/revisions')) return { assertCurrentStoryboard: async () => {
        if (fixture.stale) throw new AppError('台本或分镜有新版本', 409);
        return { id: 'board', projectId: 'project', episodeId: 'episode', sourceRevision: 1, episode: fixture.episode };
      } };
      if (id.endsWith('/ffmpegRenderer') && fixture.render) return { ensureRenderTools: async () => {}, renderTimelineToMp4: fixture.render };
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
      return require(id);
    } };
    vm.runInNewContext(source, sandbox, { filename: file });
    return module.exports;
  }
  return load(path.resolve(__dirname, '../src/services/drama/render', relative));
}
function timeline() {
  return { storyboardId: 'board', sourceRevision: 1, episode: { id: 'episode', durationSec: 2 }, tracks: {
    video: [{ shotId: 'shot1', shotOrder: 1, startSec: 0, endSec: 1, durationSec: 1, sourceUrl: '/api/media/assets/video/clip1.mp4', status: 'succeeded' },
      { shotId: 'shot2', shotOrder: 2, startSec: 1, endSec: 2, durationSec: 1, sourceUrl: '/api/media/assets/video/clip2.mp4', status: 'succeeded' }],
    audio: [{ shotId: 'shot1', audioUrl: '/api/media/assets/tts/voice.wav', startSec: 0, endSec: 0.8, durationSec: 0.8 }],
    subtitles: [{ startSec: 0, endSec: 0.8, text: '角色：我们出发吧' }, { startSec: 1, endSec: 2, text: '继续前进' }],
  } };
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
}
function serviceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-render-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const f = { mediaRoot: root, episode: { id: 'episode', projectId: 'project', order: 1, revision: 1 }, timeline: timeline(), rows: [], renderCalls: 0 };
  f.render = async ({ directory, signal, onProgress }) => {
    f.renderCalls++;
    if (f.onRender) await f.onRender({ signal });
    signal.throwIfAborted();
    await onProgress(95);
    const output = path.join(directory, 'result.mp4'); fs.writeFileSync(output, Buffer.alloc(100)); return output;
  };
  f.db = {
    dramaEpisode: { findUnique: async () => structuredClone(f.episode) },
    dramaRenderJob: {
      findFirst: async ({ where }) => structuredClone(f.rows.find(row => matches(row, where)) ?? null),
      findUnique: async ({ where }) => structuredClone(f.rows.find(row => matches(row, where)) ?? null),
      findUniqueOrThrow: async ({ where }) => { const row = f.rows.find(row => matches(row, where)); assert.ok(row); return structuredClone(row); },
      findMany: async ({ where }) => structuredClone(f.rows.filter(row => matches(row, where))),
      count: async ({ where }) => f.rows.filter(row => matches(row, where)).length,
      create: async ({ data }) => { const row = { id: 'job' + (f.rows.length + 1), progress: 0, createdAt: new Date(), updatedAt: new Date(), resultUrl: null, failureReason: null, ...data }; f.rows.push(row); return structuredClone(row); },
      updateMany: async ({ where, data }) => { const rows = f.rows.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    },
  };
  f.db.$transaction = fn => fn(f.db);
  f.service = new (loadRender('application/DramaRenderService.ts', f).DramaRenderService)();
  t.after(async () => { await f.service.shutdown(); });
  f.settle = async () => { for (let i = 0; i < 4; i++) { if (f.service.worker) await f.service.worker; await new Promise(resolve => setImmediate(resolve)); } };
  return f;
}

test('render contract rejects missing videos and invalid audio before processing', () => {
  const { validateRenderTimeline, readRenderLimits } = loadRender('domain/renderContract.ts');
  const limits = readRenderLimits();
  const missing = timeline(); missing.tracks.video[1].sourceUrl = null;
  assert.throws(() => validateRenderTimeline(missing, limits), /镜头 2/);
  const invalidAudio = timeline(); invalidAudio.tracks.audio[0].audioUrl = null;
  assert.throws(() => validateRenderTimeline(invalidAudio, limits), /配音/);
  const oversized = timeline(); oversized.tracks.video[1].endSec = 9999; oversized.tracks.video[1].durationSec = 9998;
  assert.throws(() => validateRenderTimeline(oversized, limits), /时长上限/);
});

test('measured TTS duration extends its shot and moves subtitle timing without truncating dialogue', () => {
  const { retimeShotForMeasuredAudio } = loadRender('domain/renderContract.ts');
  const source = timeline();
  const first = retimeShotForMeasuredAudio({ clip: source.tracks.video[0], audio: source.tracks.audio, measuredDurations: [3.5], subtitles: source.tracks.subtitles, startSec: 0 });
  assert.equal(first.clip.durationSec, 3.5); assert.equal(first.audio[0].endSec, 3.5); assert.equal(first.subtitles[0].endSec, 3.5);
  const second = retimeShotForMeasuredAudio({ clip: source.tracks.video[1], audio: [], measuredDurations: [], subtitles: source.tracks.subtitles, startSec: first.clip.endSec });
  assert.equal(second.clip.startSec, 3.5); assert.equal(second.subtitles[0].startSec, 3.5); assert.equal(second.clip.endSec, 4.5);
});

test('media URLs block private, metadata, mapped IPv6, reserved and unusual protocols', async () => {
  const { isPublicMediaAddress, resolvePublicMediaUrl } = loadRender('infrastructure/mediaInput.ts');
  for (const ip of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '172.16.2.3', '192.168.1.1', '100.64.0.1', '198.18.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2002:7f00:1::', '2001:db8::1', '2::1']) assert.equal(isPublicMediaAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicMediaAddress(ip), true, ip);
  for (const url of ['http://127.0.0.1/a.mp4', 'http://2130706433/a.mp4', 'http://[::ffff:127.0.0.1]/a.mp4', 'file:///etc/passwd', 'https://user:secret@example.com/a.mp4', 'https://example.com:9443/a.mp4']) {
    await assert.rejects(resolvePublicMediaUrl(url));
  }
});

test('local media cannot escape the media root through symbolic links and respects size limits', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-render-input-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mediaRoot = path.join(root, 'media'); fs.mkdirSync(path.join(mediaRoot, 'video'), { recursive: true });
  fs.writeFileSync(path.join(root, 'outside.mp4'), 'private');
  fs.symlinkSync(path.join(root, 'outside.mp4'), path.join(mediaRoot, 'video', 'outside.mp4'));
  const { MediaInputResolver } = loadRender('infrastructure/mediaInput.ts', { mediaRoot });
  const { readRenderLimits } = loadRender('domain/renderContract.ts');
  const resolver = new MediaInputResolver({ ...readRenderLimits(), maxAssetBytes: 4 }, new AbortController().signal);
  await assert.rejects(resolver.materialize('/api/media/assets/video/outside.mp4', path.join(root, 'copy')), /路径无效/);
  fs.writeFileSync(path.join(mediaRoot, 'video', 'large.mp4'), '12345');
  await assert.rejects(resolver.materialize('/api/media/assets/video/large.mp4', path.join(root, 'copy')), /大小上限/);
  await assert.rejects(resolver.materialize('/api/media/assets/video/../outside.mp4', path.join(root, 'copy')));
});

test('remote download pins DNS, rejects private redirects and enforces streaming byte limits', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-render-download-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let calls = 0; let resolves = 0; let redirect = false;
  const mocks = {
    'node:dns/promises': { lookup: async () => { resolves++; return [{ address: '8.8.8.8', family: 4 }]; } },
    'node:https': { get: (_url, options, callback) => {
      calls++; assert.equal(options.family, 4);
      options.lookup('media.test', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
      const request = new EventEmitter();
      queueMicrotask(() => { const response = new PassThrough(); response.statusCode = redirect ? 302 : 200; response.headers = redirect ? { location: 'http://127.0.0.1/private.mp4' } : {}; callback(response); if (!redirect) response.end(Buffer.from('test-video-data')); });
      return request;
    } },
  };
  const { MediaInputResolver } = loadRender('infrastructure/mediaInput.ts', { mocks });
  const { readRenderLimits } = loadRender('domain/renderContract.ts');
  await new MediaInputResolver(readRenderLimits(), new AbortController().signal).materialize('https://media.test/video.mp4', path.join(root, 'first'));
  assert.equal(fs.readFileSync(path.join(root, 'first'), 'utf8'), 'test-video-data'); assert.equal(resolves, 1); assert.equal(calls, 1);
  redirect = true;
  await assert.rejects(new MediaInputResolver(readRenderLimits(), new AbortController().signal).materialize('https://media.test/redirect', path.join(root, 'second')), /公网/);
  assert.equal(calls, 2);
  redirect = false;
  await assert.rejects(new MediaInputResolver({ ...readRenderLimits(), maxAssetBytes: 4 }, new AbortController().signal).materialize('https://media.test/large', path.join(root, 'third')), /大小上限/);
});

test('inline Base64 audio is imported locally without a network request', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-render-inline-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { MediaInputResolver } = loadRender('infrastructure/mediaInput.ts', { mocks: { 'node:dns/promises': { lookup: () => { throw new Error('must not access DNS'); } } } });
  const { readRenderLimits } = loadRender('domain/renderContract.ts');
  for (const [index, mime] of ['wav', 'mpeg', 'ogg', 'mp4', 'webm'].entries()) {
    const bytes = Buffer.from('RIFF-audio-content-' + index); const destination = path.join(root, `audio-${index}`);
    await new MediaInputResolver(readRenderLimits(), new AbortController().signal).materialize(`data:audio/${mime};base64,${bytes.toString('base64')}`, destination);
    assert.deepEqual(fs.readFileSync(destination), bytes);
  }
});

test('inline imports reject non-audio, malformed Base64, size excess and total-budget excess', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-render-inline-unsafe-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { MediaInputResolver } = loadRender('infrastructure/mediaInput.ts');
  const { readRenderLimits } = loadRender('domain/renderContract.ts');
  const limits = readRenderLimits();
  for (const raw of ['data:text/html;base64,PHNjcmlwdD4=', 'data:video/mp4;base64,dmlkZW8=', 'data:audio/wav,raw', 'data:audio/wav;base64,a===', 'data:audio/wav;base64,Y Q==', 'data:audio/wav;base64,=AAA', 'data:audio/wav;base64,YR==']) {
    await assert.rejects(new MediaInputResolver(limits, new AbortController().signal).materialize(raw, path.join(root, 'invalid')));
  }
  const raw = 'data:audio/wav;base64,' + Buffer.from('12345').toString('base64');
  await assert.rejects(new MediaInputResolver(limits, new AbortController().signal).materialize(raw, path.join(root, 'video'), 'video'), /镜头视频/);
  await assert.rejects(new MediaInputResolver({ ...limits, maxAssetBytes: 4 }, new AbortController().signal).materialize(raw, path.join(root, 'too-large')), /大小上限/);
  const resolver = new MediaInputResolver({ ...limits, maxTotalBytes: 8 }, new AbortController().signal);
  await resolver.materialize(raw, path.join(root, 'first'));
  await assert.rejects(resolver.materialize(raw, path.join(root, 'second')), /大小上限/);
});

test('duplicate start reuses the active render and successful output excludes internal snapshot', async t => {
  const f = serviceFixture(t); let release; let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.onRender = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const first = await f.service.start('project', 1); await ready;
  const duplicate = await f.service.start('project', 1);
  assert.equal(first.id, duplicate.id); assert.equal(f.rows.length, 1); assert.equal('snapshotJson' in first, false);
  release(); await f.settle();
  assert.equal(f.rows[0].status, 'succeeded'); assert.equal(f.rows[0].progress, 100); assert.equal(f.renderCalls, 1);
  assert.equal('snapshotJson' in (await f.service.list('project', 1))[0], false);
});

test('cancellation aborts the active worker, preserves inputs and permits an explicit new render', async t => {
  const f = serviceFixture(t); let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.onRender = ({ signal }) => new Promise((resolve, reject) => { entered(); signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); });
  const job = await f.service.start('project', 1); await ready;
  await f.service.cancel('project', job.id); await f.settle();
  assert.equal(f.rows[0].status, 'cancelled'); assert.equal(f.published, undefined);
  f.onRender = null;
  await f.service.start('project', 1); await f.settle();
  assert.equal(f.rows[1].status, 'succeeded'); assert.equal(f.timeline.tracks.video.length, 2);
});

test('restart recovery exposes interrupted jobs and does not resume work automatically', async t => {
  const f = serviceFixture(t);
  f.rows.push({ id: 'lost', projectId: 'project', episodeId: 'episode', status: 'running', snapshotJson: JSON.stringify(f.timeline), sourceRevision: 1 });
  await f.service.recoverInterruptedJobs();
  assert.equal(f.rows[0].status, 'failed'); assert.match(f.rows[0].failureReason, /重启/); assert.equal(f.renderCalls, 0);
});

test('changed media during rendering preserves output but cannot publish it as current success', async t => {
  const f = serviceFixture(t);
  f.onRender = async () => { f.timeline.tracks.video[0].sourceUrl = '/api/media/assets/video/new-version.mp4'; };
  await f.service.start('project', 1); await f.settle();
  assert.equal(f.rows[0].status, 'failed'); assert.match(f.rows[0].failureReason, /新版本/);
  assert.equal(f.rows[0].resultUrl, '/api/media/assets/video/finished.mp4');
});

test('revision changes during rendering never replace current finished output', async t => {
  const f = serviceFixture(t); f.onRender = async () => { f.stale = true; };
  await f.service.start('project', 1); await f.settle();
  assert.equal(f.rows[0].status, 'failed'); assert.ok(f.rows[0].resultUrl);
});

test('completed results become historical when media changes on the same storyboard', async t => {
  const f = serviceFixture(t); await f.service.start('project', 1); await f.settle();
  assert.equal((await f.service.list('project', 1))[0].isCurrent, true);
  f.timeline.tracks.audio[0].audioUrl = '/api/media/assets/tts/revised.wav';
  const historical = (await f.service.list('project', 1))[0];
  assert.equal(historical.status, 'succeeded'); assert.equal(historical.isCurrent, false); assert.ok(historical.resultUrl);
});

test('media process cancellation waits for child exit and forcibly stops an unresponsive process', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-render-cancel-process-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { runMediaProcess } = loadRender('infrastructure/ffmpegRenderer.ts');
  const controller = new AbortController();
  const running = runMediaProcess(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});require("node:fs").writeFileSync("ready","1");setInterval(()=>{},1000)'], root, controller.signal);
  for (let i = 0; i < 100 && !fs.existsSync(path.join(root, 'ready')); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(fs.existsSync(path.join(root, 'ready')));
  controller.abort(); await assert.rejects(running, /取消或超时/);
});

const hasFfmpeg = spawnSync(process.env.DRAMA_FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
test('real FFmpeg renders two clips with Chinese subtitles, TTS replacement and retained source audio', { skip: !hasFfmpeg && !process.env.DRAMA_REQUIRE_FFMPEG }, async t => {
  assert.equal(hasFfmpeg, true, 'FFmpeg is required in the Docker verification environment');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-render-real-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mediaRoot = path.join(root, 'media'); const work = path.join(root, 'work');
  for (const folder of [path.join(mediaRoot, 'video'), path.join(mediaRoot, 'tts'), work]) fs.mkdirSync(folder, { recursive: true });
  const ffmpeg = process.env.DRAMA_FFMPEG_PATH || 'ffmpeg';
  function make(args) { const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); }
  for (const index of [1, 2]) make(['-f', 'lavfi', '-i', `color=c=${index === 1 ? 'red' : 'blue'}:s=320x180:r=24:d=0.6`, '-f', 'lavfi', '-i', `sine=frequency=${index === 1 ? 330 : 660}:duration=1`, '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(mediaRoot, 'video', `clip${index}.mp4`)]);
  make(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=1.4', path.join(mediaRoot, 'tts', 'voice.wav')]);
  const { renderTimelineToMp4, probeMedia } = loadRender('infrastructure/ffmpegRenderer.ts', { mediaRoot });
  const { readRenderLimits } = loadRender('domain/renderContract.ts');
  const limits = readRenderLimits(); const signal = AbortSignal.timeout(120000); const progress = [];
  const sourceTimeline = timeline();
  sourceTimeline.tracks.audio[0].audioUrl = 'data:audio/wav;base64,' + fs.readFileSync(path.join(mediaRoot, 'tts', 'voice.wav')).toString('base64');
  const output = await renderTimelineToMp4({ timeline: sourceTimeline, directory: work, limits, signal, onProgress: async value => progress.push(value) });
  const probe = await probeMedia(output, work, limits, signal);
  assert.equal(probe.video, true); assert.equal(probe.audio, true); assert.equal(probe.width, 720); assert.equal(probe.height, 1280);
  assert.ok(Math.abs(probe.duration - 2.4) < 0.2); assert.equal(progress.at(-1), 95); assert.ok(fs.statSync(output).size > 1000);
  const subtitlePixels = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '0.3', '-i', output, '-vf', 'crop=680:200:20:1040', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  assert.equal(subtitlePixels.status, 0);
  assert.ok(subtitlePixels.stdout.filter(value => value > 200).length > 100, 'Chinese subtitles must be burned into the lower black margin');
  // Decode narrow windows to mono PCM and estimate frequency from zero crossings.
  // The first shot must contain the 880 Hz TTS, the second its original 660 Hz sound.
  for (const [offset, expected] of [[0.2, 880], [0.9, 880], [1.5, 660]]) {
    const decoded = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(offset), '-i', output, '-t', '0.2', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
    assert.equal(decoded.status, 0); let crossings = 0;
    for (let i = 2; i < decoded.stdout.length; i += 2) if (decoded.stdout.readInt16LE(i - 2) <= 0 && decoded.stdout.readInt16LE(i) > 0) crossings++;
    assert.ok(Math.abs(crossings / 0.2 - expected) < 45, `audio at ${offset}s should be ${expected} Hz, got ${crossings / 0.2}`);
  }
});
