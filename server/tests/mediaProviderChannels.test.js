const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const media = require("../dist/modules/media/index.js");
const {
  HttpVideoProvider,
} = require("../dist/modules/media/index.js");
const {
  OpenAiSpeechProvider,
  OpenAiVideoProvider,
} = require("../dist/modules/media/index.js");
const {
  normalizeTaskStatus,
  readPathField,
  resolvePayloadTemplate,
} = require("../dist/modules/media/infrastructure/mediaHttp.js");

function mediaRecord(overrides = {}) {
  return {
    id: overrides.id ?? "mp_test",
    kind: "tts",
    providerKey: "newapi",
    label: "NewAPI 配音",
    description: null,
    protocol: "http_json",
    baseURL: "https://newapi.test/v1",
    apiKey: "sk-live-1234567890",
    model: "tts-1",
    options: null,
    isActive: true,
    isBuiltin: false,
    supportsRefImages: false,
    costPerSecond: 0.05,
    currency: "CNY",
    createdAt: new Date("2026-09-27T00:00:00.000Z"),
    updatedAt: new Date("2026-09-27T00:00:00.000Z"),
    ...overrides,
  };
}

test("media provider options keep only known keys and drops unknown ones", () => {
  const options = media.normalizeMediaProviderOptions(
    JSON.stringify({
      createPath: "/tasks",
      statusPath: "/tasks/{taskId}",
      timeoutMs: 45000,
      unexpected: "ignored",
      headers: { "X-Tenant": "studio", blank: "   " },
    }),
  );
  assert.deepEqual(options, {
    createPath: "/tasks",
    statusPath: "/tasks/{taskId}",
    timeoutMs: 45000,
    headers: { "X-Tenant": "studio" },
  });
  assert.equal(media.normalizeMediaProviderOptions("{not json").createPath, undefined);
  assert.equal(media.serializeMediaProviderOptions({}), null);
  assert.equal(typeof media.serializeMediaProviderOptions({ createPath: "/tasks" }), "string");
});

test("media provider key normalization and api key masking never leak secrets", () => {
  assert.equal(media.normalizeMediaProviderKey("Seedance 1.0 pro"), "seedance_1_0_pro");
  assert.equal(media.normalizeMediaProviderKey("   "), "channel");
  assert.equal(media.maskApiKey("sk-live-1234567890"), "sk-l****7890");
  assert.equal(media.maskApiKey("short"), "sh****");
  assert.equal(media.maskApiKey(null), null);

  const view = media.toMediaProviderView(mediaRecord());
  assert.equal(view.hasApiKey, true);
  assert.equal(view.apiKeyMasked, "sk-l****7890");
  assert.equal(Object.hasOwn(view, "apiKey"), false);
  assert.equal(view.kind, "tts");
  assert.equal(view.currency, "CNY");
});

test("payload templates and response paths adapt vendor specific payloads", () => {
  const body = resolvePayloadTemplate(
    {
      model: "${model}",
      content: [{ type: "text", text: "${prompt}" }],
      images: "${refImages}",
      ratio: "${aspectRatio}",
      duration: "${durationSec}",
    },
    {
      model: "seedance-1-0-pro",
      prompt: "雨夜天台对峙",
      refImages: ["https://example.test/a.png", "https://example.test/b.png"],
      aspectRatio: "9:16",
      durationSec: 5,
    },
  );
  assert.deepEqual(body, {
    model: "seedance-1-0-pro",
    content: [{ type: "text", text: "雨夜天台对峙" }],
    images: ["https://example.test/a.png", "https://example.test/b.png"],
    ratio: "9:16",
    duration: 5,
  });

  assert.equal(readPathField({ data: { task: { id: "t_1" } } }, "data.task.id"), "t_1");
  assert.equal(readPathField({ data: [{ url: "u" }] }, "data.0.url"), "u");
  assert.equal(readPathField({ data: {} }, "data.task.id"), undefined);
  assert.equal(normalizeTaskStatus("succeed", { succeed: "succeeded" }), "succeeded");
  assert.equal(normalizeTaskStatus("in_progress"), "running");
  assert.equal(normalizeTaskStatus("whatever"), "queued");
});

test("buildMediaProviderPorts maps protocol to adapter and skips disabled channels", () => {
  const ports = media.buildMediaProviderPorts([
    mediaRecord(),
    mediaRecord({ id: "mp_video", kind: "video", providerKey: "seedance", protocol: "http_json", supportsRefImages: true }),
    mediaRecord({ id: "mp_openai_video", kind: "video", providerKey: "grok", protocol: "openai_video" }),
    mediaRecord({ id: "mp_openai_tts", kind: "tts", providerKey: "openai_tts", protocol: "openai_speech" }),
    mediaRecord({ id: "mp_music", kind: "music", providerKey: "suno", protocol: "http_json" }),
    mediaRecord({ id: "mp_off", kind: "tts", providerKey: "disabled", isActive: false }),
  ]);

  assert.deepEqual(ports.tts.map((port) => port.provider), ["newapi", "openai_tts"]);
  assert.deepEqual(ports.video.map((port) => port.provider), ["seedance", "grok"]);
  assert.deepEqual(ports.music.map((port) => port.provider), ["suno"]);
  assert.equal(ports.video[0].supportsRefImages, true);
  assert.equal(ports.video[1] instanceof OpenAiVideoProvider, true);
  assert.equal(ports.tts[0].costPerSecond, 0.05);
  assert.equal(ports.tts[0].currency, "CNY");

  assert.throws(
    () => media.buildMediaProviderPorts([mediaRecord({ protocol: "openai_video" })]),
    /不匹配/,
  );
});

test("database channels register into runtime registries without overriding env presets", () => {
  const { ttsProviderRegistry } = media;
  assert.equal(ttsProviderRegistry.hasEnvProvider("mock"), true);

  const custom = media.buildMediaProviderPorts([mediaRecord({ providerKey: "newapi_drama" })]);
  ttsProviderRegistry.replaceDatabaseProviders(custom.tts);
  assert.equal(ttsProviderRegistry.has("newapi_drama"), true);
  assert.equal(ttsProviderRegistry.resolve("newapi_drama").provider, "newapi_drama");

  const conflict = media.buildMediaProviderPorts([mediaRecord({ providerKey: "mock", label: "同名通道" })]);
  ttsProviderRegistry.replaceDatabaseProviders([...custom.tts, ...conflict.tts]);
  assert.equal(ttsProviderRegistry.hasEnvProvider("mock"), true);
  assert.equal(ttsProviderRegistry.resolve("mock").label, "模拟配音通道");

  ttsProviderRegistry.replaceDatabaseProviders([]);
  assert.equal(ttsProviderRegistry.has("newapi_drama"), false);
  assert.equal(ttsProviderRegistry.has("mock"), true);
});

test("http json task provider forwards payload template and response paths", async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : null });
      if (req.method === "POST" && req.url === "/tasks") {
        res.end(JSON.stringify({ data: { task: { id: "seed_42" }, state: "submitted" } }));
        return;
      }
      if (req.method === "GET" && req.url === "/tasks/seed_42") {
        res.end(JSON.stringify({ data: { state: "succeed", output: { url: "https://cdn.test/seed.mp4" } } }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const provider = new HttpVideoProvider({
      provider: "seedance",
      createUrl: `${baseUrl}/tasks`,
      statusUrl: `${baseUrl}/tasks/{taskId}`,
      apiKey: "seedance-key",
      model: "seedance-1-0-pro",
      supportsRefImages: true,
      kindLabel: "视频通道",
      options: {
        payload: {
          model: "${model}",
          content: [{ type: "text", text: "${prompt}" }],
          images: "${refImages}",
          ratio: "${aspectRatio}",
        },
        taskIdPath: "data.task.id",
        statusValuePath: "data.state",
        resultUrlPath: "data.output.url",
        statusMap: { submitted: "queued", succeed: "succeeded" },
      },
    });

    const created = await provider.createTask({
      prompt: "雨夜天台对峙",
      aspectRatio: "9:16",
      refImages: ["https://example.test/a.png"],
    });
    assert.equal(created.providerTaskId, "seed_42");
    assert.equal(created.status, "queued");
    assert.equal(requests[0].authorization, "Bearer seedance-key");
    assert.deepEqual(requests[0].body, {
      model: "seedance-1-0-pro",
      content: [{ type: "text", text: "雨夜天台对峙" }],
      images: ["https://example.test/a.png"],
      ratio: "9:16",
    });

    const refreshed = await provider.getTask("seed_42");
    assert.equal(refreshed.status, "succeeded");
    assert.equal(refreshed.resultUrl, "https://cdn.test/seed.mp4");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("openai compatible video provider reads async task responses", async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
      if (req.method === "POST" && req.url === "/v1/video/generations") {
        res.end(JSON.stringify({ id: "vid_7", status: "queued" }));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/video/generations/vid_7") {
        res.end(JSON.stringify({ status: "completed", output: { url: "https://cdn.test/vid_7.mp4" } }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const provider = new OpenAiVideoProvider({
      provider: "newapi_video",
      baseURL: baseUrl,
      apiKey: "newapi-key",
      model: "seedance-1-0-pro",
      supportsRefImages: true,
    });
    const created = await provider.createTask({
      prompt: "街头追逐",
      aspectRatio: "9:16",
      durationSec: 5,
      refImages: ["https://example.test/frame.png"],
    });
    assert.equal(created.providerTaskId, "vid_7");
    assert.deepEqual(requests[0].body, {
      prompt: "街头追逐",
      model: "seedance-1-0-pro",
      aspect_ratio: "9:16",
      duration: 5,
      image_urls: ["https://example.test/frame.png"],
    });

    const refreshed = await provider.getTask("vid_7");
    assert.equal(refreshed.status, "succeeded");
    assert.equal(refreshed.resultUrl, "https://cdn.test/vid_7.mp4");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("openai compatible speech provider persists binary audio and passes through json urls", async () => {
  const persisted = [];
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({ url: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : null });
      if (req.url === "/v1/audio/speech") {
        const wantsJson = requests.length > 1;
        if (wantsJson) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ data: [{ url: "https://cdn.test/line.mp3" }], durationSec: 2.5 }));
          return;
        }
        res.setHeader("Content-Type", "audio/mpeg");
        res.end(Buffer.from([0x49, 0x44, 0x33, 0x01, 0x02]));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const provider = new OpenAiSpeechProvider({
      provider: "newapi_tts",
      baseURL: baseUrl,
      apiKey: "speech-key",
      model: "tts-1",
      options: { defaultVoice: "alloy", responseFormat: "mp3" },
      persistAsset: async (input) => {
        persisted.push(input);
        return { url: "/api/media/assets/tts/fixture.mp3" };
      },
    });

    const binary = await provider.synthesize({ text: "让董事长下来。", voiceId: "nova", speed: 1.1 });
    assert.equal(binary.audioUrl, "/api/media/assets/tts/fixture.mp3");
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].kind, "tts");
    assert.equal(persisted[0].bytes.byteLength, 5);
    assert.equal(requests[0].authorization, "Bearer speech-key");
    assert.deepEqual(requests[0].body, {
      input: "让董事长下来。",
      voice: "nova",
      response_format: "mp3",
      model: "tts-1",
      speed: 1.1,
    });

    const json = await provider.synthesize({ text: "第二句" });
    assert.equal(json.audioUrl, "https://cdn.test/line.mp3");
    assert.equal(json.durationSec, 2.5);
    assert.equal(requests[1].body.voice, "alloy");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("media assets are written under generated-media and reject path traversal", async () => {
  const saved = await media.saveMediaAsset({
    kind: "tts",
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "audio/mpeg",
  });
  assert.match(saved.fileName, /^[a-z0-9]+-[a-z0-9]+\.mp3$/);
  assert.equal(saved.url, `/api/media/assets/tts/${saved.fileName}`);
  const filePath = media.resolveMediaAssetPath("tts", saved.fileName);
  assert.equal(fs.existsSync(filePath), true);
  assert.equal(media.contentTypeForFileName(saved.fileName), "audio/mpeg");

  assert.throws(() => media.resolveMediaAssetPath("tts", "../../etc/passwd"), /不合法/);
  assert.throws(() => media.resolveMediaAssetPath("unknown", "a.mp3"), /不支持/);

  const root = path.dirname(filePath);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test("drama provider shims keep exporting the same registry instances", () => {
  const ttsShim = require("../dist/services/drama/audio/TTSProviderPort.js");
  const videoShim = require("../dist/services/drama/video/VideoProviderPort.js");
  assert.equal(ttsShim.ttsProviderRegistry, media.ttsProviderRegistry);
  assert.equal(videoShim.videoProviderRegistry, media.videoProviderRegistry);
  assert.equal(ttsShim.ttsProviderRegistry.resolve("mock").provider, "mock");
  assert.equal(videoShim.videoProviderRegistry.resolve("mock").provider, "mock");
  assert.equal(typeof ttsShim.HttpTTSProvider, "function");
  assert.equal(typeof videoShim.HttpVideoProvider, "function");
});

test("media channel migration exists for sqlite, postgres and compose baselines", () => {
  const root = path.join(__dirname, "..", "src", "prisma");
  const migration = path.join("20260927133000_media_provider_channels", "migration.sql");
  const sqlite = fs.readFileSync(path.join(root, "migrations.sqlite", migration), "utf8");
  const postgres = fs.readFileSync(path.join(root, "migrations", migration), "utf8");
  const compose = fs.readFileSync(path.join(root, "migrations.compose", migration), "utf8");
  for (const sql of [sqlite, postgres, compose]) {
    assert.match(sql, /CREATE TABLE "MediaProvider"/);
    assert.match(sql, /"providerKey" TEXT NOT NULL/);
    assert.match(sql, /"apiKey" TEXT/);
    assert.match(sql, /MediaProvider_kind_providerKey_key/);
    assert.match(sql, /MediaProvider_kind_isActive_idx/);
  }
  assert.match(sqlite, /"costPerSecond" REAL NOT NULL DEFAULT 0/);
  assert.match(postgres, /"costPerSecond" DOUBLE PRECISION NOT NULL DEFAULT 0/);
});
