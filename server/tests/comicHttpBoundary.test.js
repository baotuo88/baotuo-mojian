const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const express = require("express");
const router = require("../dist/modules/comic/http/comicRoutes").default;
const { errorHandler } = require("../dist/middleware/errorHandler");
const {
  comicCharacterAssetService: assets,
} = require("../dist/services/comic/ComicCharacterAssetService");
const { comicSceneService: scenes } = require("../dist/services/comic/ComicSceneService");
const { comicPanelImageService: panels } = require("../dist/services/comic/ComicPanelImageService");

async function server(t) {
  const app = express();
  app.use(express.json());
  app.use("/api/comic", router);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}/api/comic`;
}

test("asset prepare/generate accepts an empty body and validates malformed options", async (t) => {
  const url = await server(t);
  let calls = 0;
  t.mock.method(assets, "prepareAssetImage", async () => {
    calls++;
    return {};
  });
  t.mock.method(assets, "generateAssetImage", async () => {
    calls++;
  });
  t.mock.method(assets, "getAsset", async () => ({ id: "a" }));
  for (const action of ["prepare-image", "generate-image"]) {
    const response = await fetch(`${url}/character-assets/a/${action}`, { method: "POST" });
    assert.equal(response.status, 200, await response.text());
    const invalid = await fetch(`${url}/character-assets/a/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: [] }),
    });
    assert.equal(invalid.status, 400);
  }
  assert.equal(calls, 2);
});

test("both upload endpoints enforce MIME, empty-body and size limits before invoking persistence", async (t) => {
  const url = await server(t);
  let calls = 0;
  const receive = async (_id, bytes, mime) => {
    calls++;
    assert.equal(mime, "image/png");
    assert.deepEqual(bytes, Buffer.from([1, 2, 3]));
    return {};
  };
  t.mock.method(assets, "uploadAssetImage", receive);
  t.mock.method(scenes, "uploadSceneImage", receive);
  for (const endpoint of ["character-assets/a", "scenes/s"]) {
    for (const [mime, body, status] of [
      ["image/png", Buffer.from([1, 2, 3]), 200],
      ["text/plain", Buffer.from("bad"), 415],
      ["image/png", Buffer.alloc(0), 400],
      ["image/png", Buffer.alloc(20 * 1024 * 1024 + 1), 413],
    ]) {
      const response = await fetch(`${url}/${endpoint}/upload-image`, {
        method: "POST",
        headers: { "Content-Type": mime },
        body,
      });
      assert.equal(response.status, status, await response.text());
    }
  }
  assert.equal(calls, 2);
});

test("reference file routes preserve revision and panel prepare preserves exclusions", async (t) => {
  const url = await server(t);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comic-http-"));
  const filePath = path.join(root, "sample.png");
  await fs.writeFile(filePath, "sample");
  for (const [service, method, endpoint] of [
    [assets, "serveAssetImage", "character-assets/a"],
    [scenes, "serveSceneImage", "scenes/s"],
  ]) {
    t.mock.method(service, method, async (_id, revision) => {
      assert.equal(revision, "version-2");
      return { filePath, mimeType: "image/png" };
    });
    const response = await fetch(`${url}/${endpoint}/image?revision=version-2`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "sample");
  }
  t.mock.method(panels, "preparePanelImage", async (_id, _provider, options) => {
    assert.deepEqual(options.excludedReferenceImageUrls, ["/api/comic/reference"]);
    return {};
  });
  const response = await fetch(`${url}/panels/p/image/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excludedReferenceImageUrls: ["/api/comic/reference"] }),
  });
  assert.equal(response.status, 200, await response.text());
});
