const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('../dist/agents/orchestrator.js');
const { CreativeHubLangGraph } = require('../dist/creativeHub/CreativeHubLangGraph.js');

function mockGraph(t) {
  const runs = [];
  const store = {
    listRuns: async () => runs.map((row) => ({ ...row })),
    createRun: async () => {
      const row = { id: `run-${runs.length + 1}`, status: 'queued' }; runs.push(row); return { ...row };
    },
    updateRun: async (id, patch) => Object.assign(runs.find((row) => row.id === id), patch),
    getRun: async (id) => ({ ...runs.find((row) => row.id === id) }),
    addStep: async () => ({ id: 'step' }),
  };
  t.mock.method(planner, 'createStructuredPlan', async () => ({
    actions: [], validationWarnings: [], source: 'mock',
    structuredIntent: { confidence: 1, intent: 'general_chat', note: 'mock' }, plan: {},
  }));
  const graph = new CreativeHubLangGraph(); graph.store = store;
  return { graph, runs };
}
const input = { threadId: 'review-thread', messages: [{ type: 'human', content: 'review' }], resourceBindings: {}, runSettings: {} };

test('aborting at a graph node boundary closes the owned run and permits another turn', async (t) => {
  const { graph, runs } = mockGraph(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    await assert.rejects(graph.runThread(input, (frame) => {
      if (frame.event === 'metadata' && frame.data?.planner) controller.abort();
    }, controller.signal), /abort/i);
    assert.equal(runs[attempt]?.status, 'cancelled');
  }
  assert.equal(runs.length, 2);
  assert.equal(graph.invocations.size, 0);
});

test('graph cancellation preserves a durable approval gate', async (t) => {
  const { graph, runs } = mockGraph(t);
  const controller = new AbortController();
  await assert.rejects(graph.runThread(input, (frame) => {
    if (frame.event === 'metadata' && frame.data?.planner) {
      runs[0].status = 'waiting_approval';
      controller.abort();
    }
  }, controller.signal), /abort/i);
  assert.equal(runs[0].status, 'waiting_approval');
});

test('unexpected graph errors close only the invocation run as failed', async (t) => {
  const { graph, runs } = mockGraph(t);
  await assert.rejects(graph.runThread(input, (frame) => {
    if (frame.event === 'metadata' && frame.data?.planner) throw new Error('node boundary failure');
  }), /node boundary failure/);
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].error, 'node boundary failure');
});
