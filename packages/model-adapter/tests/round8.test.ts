import { describe, expect, it } from 'vitest';
import { dailyV1, emotionV1 } from '@research/experiment-core';
import { demoPolicy, orchestrate, GenerationFailureError } from '@research/ai-orchestrator';
import { experimentLog } from '../src/index.js';
import type { ModelSettings } from '../src/index.js';
import { stateAt } from '../examples/experiment-run.js';
import {
  generationDiagnostics,
  boundaryFaultDiagnostics,
} from '../examples/generation-diagnostics.js';

const settings: ModelSettings = {
  provider: 'mock',
  model_name: 'synthetic-unit-fixture',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 20,
  max_attempts: 2,
};
const state = stateAt(dailyV1, 'NATURAL_CHAT');
const request = {
  state,
  definition: dailyV1,
  policy: demoPolicy(dailyV1, state.stage),
  userInput: '谈谈阅读。',
};
describe('round eight generation acceptance boundaries', () => {
  it.each(['failure', 'timeout', 'aborted'] as const)(
    'records %s without state or variable events',
    async (kind) => {
      const before = JSON.stringify(state);
      const controller = new AbortController();
      if (kind === 'aborted') controller.abort();
      let childSignal: AbortSignal | undefined;
      const result = await orchestrate(
        request,
        {
          generate: async (_prompt, options) => {
            childSignal = options?.signal;
            if (kind === 'failure') throw new GenerationFailureError(false);
            return new Promise<string>(() => {});
          },
        },
        { timeoutMs: 5, maxAttempts: 2, signal: controller.signal },
      );
      const failed = result.auditEvents.filter((e) => e.outcome === 'rejected');
      expect(failed.length).toBe(kind === 'timeout' ? 2 : 1);
      expect(failed.every((e) => e.type === 'MODEL_GENERATION_FAILED')).toBe(true);
      expect(JSON.stringify(result.auditEvents)).not.toMatch(/STATE_CHANGED|VARIABLE_UPDATED/);
      expect(JSON.stringify(state)).toBe(before);
      if (kind === 'timeout') expect(childSignal?.aborted).toBe(true);
      expect(result).not.toHaveProperty('newState');
    },
  );
  it('limits retries and logs configured parameters without participant disclosure', async () => {
    let calls = 0;
    const result = await orchestrate(
      request,
      {
        generate: async () => {
          calls++;
          throw new GenerationFailureError(true);
        },
      },
      { maxAttempts: 2 },
    );
    const log = experimentLog({
      conversation_id: 'synthetic-c',
      participant_id: 'synthetic-p',
      model_name: settings.model_name,
      model_parameters: settings,
      state_before: state,
      state_after: state,
      result,
      response_latency: 12,
      fallback_count: 1,
    });
    expect(calls).toBe(2);
    expect(log).toMatchObject({
      temperature: 0.2,
      max_tokens: 512,
      retry_count: 1,
      response_latency: 12,
    });
    expect(log.validator_result.violations).toContain('GENERATOR_FAILURE');
    expect(log.state_before).toEqual(log.state_after);
  });
  it('keeps unknown parameters null for existing callers', async () => {
    const result = await orchestrate(request, {
      generate: async () => '你愿意多谈谈阅读的感受吗？',
    });
    const log = experimentLog({
      conversation_id: 'synthetic-c',
      participant_id: 'synthetic-p',
      model_name: 'fixture',
      state_before: state,
      state_after: state,
      result,
      response_latency: 1,
      fallback_count: 0,
    });
    expect(log.temperature).toBeNull();
    expect(log.max_tokens).toBeNull();
    expect(log.retry_count).toBe(0);
  });
  it('exercises one turn, three history-aware turns and a bounded long context', async () => {
    let calls = 0;
    const report = await generationDiagnostics(
      { generate: async () => `你愿意谈谈阅读感受吗？（${++calls}）` },
      settings,
    );
    expect(calls).toBe(5);
    expect(report.multi.map((c) => c.context.recentMessages.length)).toEqual([0, 2, 4]);
    expect(report.longContext).toEqual({
      suppliedMessages: 100,
      selectedMessages: 6,
      maxSelectedMessageLength: 800,
      droppedOldHistory: true,
    });
    expect(report.stateUnchanged).toBe(true);
    expect(
      [report.single, ...report.multi, report.long].every((c) => c.result.status === 'generated'),
    ).toBe(true);
    expect(report.multi.every((c) => c.metrics.temperature === settings.temperature)).toBe(true);
  });
  it.each([
    ['我们重新认识一下。', 'WRONG_SCENE'],
    ['我们来到海滩吧。', 'WRONG_SCENE'],
    ['接下来进入 RELATIONSHIP。', 'STAGE_JUMP'],
  ])('rejects known emotional rewind or future-stage markers: %s', async (text, violation) => {
    const current = stateAt(emotionV1, 'MISUNDERSTANDING');
    const before = JSON.stringify(current);
    const result = await orchestrate(
      {
        state: current,
        definition: emotionV1,
        policy: demoPolicy(emotionV1, current.stage),
        userInput: '继续聊。',
      },
      { generate: async () => text },
      { maxAttempts: 2 },
    );
    expect(result.status).toBe('fallback');
    expect(result.violations).toContain(violation);
    expect(JSON.stringify(current)).toBe(before);
    expect(result.attempts).toBe(2);
  });
  it('distinguishes local model faults from validator rejections', async () => {
    const report = await boundaryFaultDiagnostics(settings);
    expect(report.realProviderCalls).toBe(0);
    expect(report.failed.result.auditEvents.some((e) => e.type === 'MODEL_GENERATION_FAILED')).toBe(
      true,
    );
    expect(report.rejected.result.auditEvents.every((e) => e.type === undefined)).toBe(true);
    expect(report.rejected.result.status).toBe('fallback');
    expect(report.failed.stateUnchanged && report.rejected.stateUnchanged).toBe(true);
  });
});
