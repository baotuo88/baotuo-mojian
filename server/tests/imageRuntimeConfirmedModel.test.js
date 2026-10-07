const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { sourceLoader } = require("./helpers/comicAssetFixture.cjs");

test("image runtime rejects a changed confirmed model before any provider request or state mutation", async () => {
  let requests = 0,
    writes = 0;
  const load = sourceLoader({
    "/image/provider": {
      resolveImageModel: async () => "new-model",
      isImageProviderSupported: () => true,
      generateImagesByProvider: async () => {
        requests++;
      },
    },
    "/middleware/errorHandler": {
      AppError: class extends Error {
        constructor(message, statusCode) {
          super(message);
          this.statusCode = statusCode;
        }
      },
    },
  });
  const { runImageGeneration } = load(
    path.join(__dirname, "../src/services/image/runtime/runner.ts"),
  );
  await assert.rejects(
    runImageGeneration(
      {
        loadState: async () => {
          writes++;
        },
        saveState: async () => {
          writes++;
        },
      },
      { provider: "openai", prompt: "confirmed comic scene", expectedModel: "confirmed-model" },
    ),
    (e) => e.statusCode === 409,
  );
  assert.equal(requests, 0);
  assert.equal(writes, 0);
});
