const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { z } = require("zod");
const { runWithExecutionScope } = require("../dist/platform/execution");
const { runWithEnforcedTimeout } = require("../dist/llm/invokeTimeout");
const { parseStructuredLlmRawContentDetailed } = require("../dist/llm/structuredInvoke");
const {
  createPromptStreamControl,
  captureStreamOutput,
  observeStreamCompletion,
} = require("../dist/prompting/core/streaming/PromptStreamLifecycle");

test("ambient execution cancellation interrupts model calls even without an explicit signal", async () => {
  const controller = new AbortController();
  let received;
  const work = runWithExecutionScope({ signal: controller.signal }, () =>
    runWithEnforcedTimeout({
      run: (signal) => {
        received = signal;
        return new Promise(() => {});
      },
    }),
  );
  controller.abort(new Error("lease lost"));
  const outcome = await Promise.race([
    work.then(
      () => "success",
      (e) => e.message,
    ),
    delay(200).then(() => "hung"),
  ]);
  assert.equal(outcome, "lease lost");
  assert.equal(received.aborted, true);
});

test("an already cancelled execution does not start a model request or JSON repair", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled before invoke"));
  let calls = 0;
  await assert.rejects(
    runWithExecutionScope({ signal: controller.signal }, () =>
      runWithEnforcedTimeout({
        run: async () => {
          calls++;
        },
      }),
    ),
    /cancelled before invoke/,
  );
  await assert.rejects(
    runWithExecutionScope({ signal: controller.signal }, () =>
      parseStructuredLlmRawContentDetailed({
        rawContent: "{invalid",
        schema: z.object({ value: z.string() }),
        label: "test cancellation",
        maxRepairAttempts: 3,
      }),
    ),
    /cancelled before invoke/,
  );
  assert.equal(calls, 0);
});

test("cancelling a pending prompt read rejects completion and never accepts partial text", async () => {
  const control = createPromptStreamControl();
  async function* provider() {
    yield { content: "partial" };
    await new Promise(() => {});
  }
  const captured = captureStreamOutput(provider(), control);
  const result = observeStreamCompletion({
    stream: captured.stream,
    complete: captured.completedText,
  });
  const iterator = result.stream[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.content, "partial");
  const pending = iterator.next();
  control.cancel(new Error("stop stream"));
  await assert.rejects(pending, /stop stream/);
  await assert.rejects(result.complete, /stop stream/);
});

test("early consumer exit aborts the provider and observes unused completion rejections", async () => {
  const control = createPromptStreamControl();
  async function* provider() {
    yield { content: "partial" };
    yield { content: "more" };
  }
  const captured = captureStreamOutput(provider(), control);
  observeStreamCompletion({
    stream: captured.stream,
    complete: captured.completedText.then((text) => text),
  });
  for await (const chunk of captured.stream) {
    assert.equal(chunk.content, "partial");
    break;
  }
  assert.equal(control.signal.aborted, true);
  await delay(0);
});
