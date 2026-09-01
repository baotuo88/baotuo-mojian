const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const healthRouter = require("../dist/routes/health.js").default;

async function startApp() {
  const app = express();
  app.use("/api/health", healthRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

test("GET /api/health/live exposes a minimal process liveness probe", async (t) => {
  const { server, baseUrl } = await startApp();
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`${baseUrl}/api/health/live`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data.status, "ok");
  assert.match(payload.data.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("GET /api/health keeps the compatible health endpoint", async (t) => {
  const { server, baseUrl } = await startApp();
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.status, "ok");
});
