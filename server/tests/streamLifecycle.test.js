const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { guardStreamStall } = require("../dist/llm/streamStallGuard.js");
const { attachClientAbort, streamToSSE, runClientSSE } = require("../dist/llm/streaming.js");
const { getExecutionAbortSignal } = require("../dist/platform/execution");

function response() {
  return Object.assign(new EventEmitter(), {
    writableEnded: false,
    destroyed: false,
    frames: [],
    setHeader() {},
    flushHeaders() {},
    write(frame) {
      this.frames.push(frame);
    },
    end() {
      this.writableEnded = true;
    },
  });
}

test("POST body completion does not abort SSE but response disconnection does", () => {
  const req = Object.assign(new EventEmitter(), { aborted: false });
  const res = response();
  const abort = attachClientAbort(req, res);
  req.emit("close");
  assert.equal(abort.signal.aborted, false);
  res.destroyed = true;
  res.emit("close");
  assert.equal(abort.signal.aborted, true);
  abort.dispose();
  assert.equal(res.listenerCount("close"), 0);
});

test("normal response completion is not cancellation; an already disconnected response is", () => {
  const req = new EventEmitter();
  const res = response();
  const abort = attachClientAbort(req, res);
  res.end();
  res.emit("close");
  assert.equal(abort.signal.aborted, false);
  abort.dispose();
  const closed = response();
  closed.destroyed = true;
  const late = attachClientAbort(req, closed);
  assert.equal(late.signal.aborted, true);
  late.dispose();
});

test("stalled async generator rejects without waiting for its blocked return", async () => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  async function* provider() {
    await blocked;
    yield "late output";
  }
  let cancellations = 0;
  const iterator = guardStreamStall(provider(), {
    stallTimeoutMs: 15,
    onStall: () => {
      cancellations++;
    },
  })[Symbol.asyncIterator]();
  const pending = iterator.next();
  try {
    const outcome = await Promise.race([
      pending.then(
        () => "resolved",
        (error) => error.message,
      ),
      delay(200).then(() => "hung"),
    ]);
    assert.match(outcome, /stalled/);
    assert.equal(cancellations, 1);
  } finally {
    release();
    await pending.catch(() => {});
  }
});

test("abort interrupts a pending read without starting another read or waiting for cleanup", async () => {
  const controller = new AbortController();
  let reads = 0;
  const stream = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          reads++;
          return new Promise(() => {});
        },
        return() {
          return new Promise(() => {});
        },
      };
    },
  };
  const pending = guardStreamStall(stream, { signal: controller.signal, stallTimeoutMs: 1000 })
    [Symbol.asyncIterator]()
    .next();
  controller.abort(new Error("cancel requested"));
  const outcome = await Promise.race([
    pending.then(
      () => "resolved",
      (e) => e.message,
    ),
    delay(200).then(() => "hung"),
  ]);
  assert.equal(outcome, "cancel requested");
  assert.equal(reads, 1);
});

test("cancelled SSE never finalizes partial content", async () => {
  const controller = new AbortController();
  async function* stream() {
    yield { content: "partial" };
    controller.abort();
    yield { content: "late" };
  }
  let finalized = false;
  const res = response();
  await streamToSSE(
    res,
    stream(),
    async () => {
      finalized = true;
    },
    controller.signal,
  );
  assert.equal(finalized, false);
  assert.equal(
    res.frames.some((frame) => frame.includes('"type":"done"')),
    false,
  );
});

test("chapter HTTP lifetime cancels model preparation and disposes listeners", async () => {
  const req = new EventEmitter();
  const res = response();
  let received;
  const work = runClientSSE(req, res, async () => {
    received = getExecutionAbortSignal();
    await new Promise((_resolve, reject) =>
      received.addEventListener("abort", () => reject(received.reason), { once: true }),
    );
    assert.fail("cancelled preparation must not finalize");
  });
  req.emit("close");
  assert.equal(received.aborted, false);
  res.destroyed = true;
  res.emit("close");
  await assert.rejects(work, { name: "AbortError" });
  assert.equal(res.listenerCount("close"), 0);
});
