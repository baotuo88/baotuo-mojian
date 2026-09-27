const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const { buildStructuredError } = require("../dist/llm/structuredInvokeParser.js");
const {
  isRetryableLlmError,
  isTransientStructuredFailure,
  resolveTransientRetryDelayMs,
  runWithTransientRetry,
} = require("../dist/llm/transientRetry.js");

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

test("isRetryableLlmError treats rate limits and gateway 5xx as retryable", () => {
  assert.equal(isRetryableLlmError(apiError("No available account for model x.", 429)), true);
  assert.equal(isRetryableLlmError({ response: { status: 503 } }), true);
  assert.equal(isRetryableLlmError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })), true);
  assert.equal(isRetryableLlmError(apiError("Provider returned an unusable payload.", 400)), false);
  assert.equal(isRetryableLlmError(new Error("模型输出不满足结构要求")), false);
});

test("isTransientStructuredFailure only defers transport-level structured failures", () => {
  const profile = resolveStructuredOutputProfile({
    provider: "ollama",
    model: "deepseek-v4.1-flash",
    baseURL: "https://relay.example/v1",
    executionMode: "structured",
  });
  const transportError = buildStructuredError({
    message: "模型没有返回可用内容，无法执行结构校验或 JSON 修复。",
    category: "transport_error",
    strategy: "json_object",
    profile,
    emptyResponse: true,
  });
  const schemaError = buildStructuredError({
    message: "模型输出未满足目标结构要求",
    category: "schema_mismatch",
    strategy: "json_object",
    profile,
  });

  assert.equal(transportError.emptyResponse, true);
  assert.equal(isTransientStructuredFailure(transportError), true);
  assert.equal(isTransientStructuredFailure(schemaError), false);
  assert.equal(isTransientStructuredFailure(apiError("rate limit exceeded", 429)), true);
});

test("runWithTransientRetry retries retryable failures and gives up after maxAttempts", async () => {
  let attempts = 0;
  const result = await runWithTransientRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw apiError("rate limit exceeded", 429);
    }
    return "ok";
  }, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);

  let failingAttempts = 0;
  await assert.rejects(
    () => runWithTransientRetry(async () => {
      failingAttempts += 1;
      throw apiError("service unavailable", 503);
    }, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 }),
    /service unavailable/,
  );
  assert.equal(failingAttempts, 2);
});

test("runWithTransientRetry does not retry non-retryable failures", async () => {
  let attempts = 0;
  await assert.rejects(
    () => runWithTransientRetry(async () => {
      attempts += 1;
      throw apiError("bad request", 400);
    }, { maxAttempts: 3, baseDelayMs: 1 }),
    /bad request/,
  );
  assert.equal(attempts, 1);
});

test("resolveTransientRetryDelayMs honours Retry-After and caps exponential backoff", () => {
  const retryAfterError = apiError("rate limit", 429);
  retryAfterError.headers = { "retry-after": "2" };
  assert.equal(resolveTransientRetryDelayMs(1, retryAfterError, { baseDelayMs: 500, maxDelayMs: 5_000 }), 2_000);

  const first = resolveTransientRetryDelayMs(1, undefined, { baseDelayMs: 1_000, maxDelayMs: 4_000 });
  const third = resolveTransientRetryDelayMs(3, undefined, { baseDelayMs: 1_000, maxDelayMs: 4_000 });
  assert.ok(first >= 1_000 && first <= 1_200, `unexpected first delay ${first}`);
  assert.ok(third <= 4_000, `unexpected third delay ${third}`);
});
