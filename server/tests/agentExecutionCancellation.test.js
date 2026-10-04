const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./support/executionFenceFixture.cjs');
const orchestrator = require('../dist/agents/orchestrator.js');
const registry = require('../dist/agents/toolRegistry.js');
const composer = require('../dist/agents/runtime/answerComposer.js');
const { AgentRuntime } = require('../dist/agents/runtime/AgentRuntime.js');
const { RunExecutionService } = require('../dist/agents/runtime/RunExecutionService.js');

test('agent cancellation completes immediately and blocks an ignoring tool at persistence', async (t) => {
  const { raw, client, value } = await fixture(t);
  let release, started;
  const blocked = new Promise((resolve) => { release = resolve; });
  const firstTool = new Promise((resolve) => { started = resolve; });
  let toolCalls = 0;
  const row = { id: 'run', status: 'queued' };
  const store = {
    listRuns: async () => [], createRun: async () => row,
    updateRun: async (_id, patch) => {
      Object.assign(row, patch);
      if (patch.status) await raw.agentRun.updateMany({ where: { id: 'run' }, data: { status: patch.status } });
    },
    addStep: async () => ({ id: 'step' }), findToolResultByIdempotencyKey: async () => null,
    getRunDetail: async () => ({ run: { ...row }, steps: [], approvals: [] }), expireAllPendingApprovals: async () => {},
  };
  t.mock.method(orchestrator, 'createStructuredPlan', async () => ({
    actions: [{ agent: 'Planner', reasoning: 'review', calls: [1, 2].map((number) => ({
      tool: 'create_novel', idempotencyKey: String(number), input: { number }, reason: 'review',
    })) }], validationWarnings: [],
  }));
  t.mock.method(registry, 'getAgentToolDefinition', () => ({
    inputSchema: { parse: (value) => value }, outputSchema: { parse: (value) => value },
    execute: async () => {
      toolCalls++;
      started();
      await blocked;
      await client.appSetting.updateMany({ where: { key: 'result' }, data: { value: 'late tool write' } });
      return {};
    },
  }));
  t.mock.method(composer, 'composeAssistantMessage', async () => 'mock');
  const runtime = Object.create(AgentRuntime.prototype);
  runtime.store = store; runtime.executor = new RunExecutionService(store); runtime.approvals = {};
  const pending = runtime.start({ sessionId: 'session', goal: 'review', contextMode: 'global' });
  const settled = pending.then(() => null, (error) => error);
  await firstTool;
  const cancellation = runtime.cancelRun('run');
  const immediate = await Promise.race([cancellation.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 80))]);
  release();
  const error = await settled;
  await cancellation;
  assert.equal(immediate, true, 'cancel must not queue behind the plan execution lock');
  assert.match(error?.message ?? '', /取消/);
  assert.equal(toolCalls, 1);
  assert.equal(row.status, 'cancelled');
  assert.deepEqual(await value(), { value: 'original' });
});
