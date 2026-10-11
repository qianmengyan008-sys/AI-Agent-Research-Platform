import { afterEach, describe, it, expect, vi } from 'vitest';
import { cognitiveV1, emotionV1, dailyV1 } from '@research/experiment-core';
import {
  orchestrate,
  demoPolicy,
  createContext,
  buildPrompt,
  GenerationTimeoutError,
  GenerationAbortedError,
} from '@research/ai-orchestrator';
import type { LanguageGenerator } from '@research/ai-orchestrator';
import { MockAdapter } from '../src/index.js';
import { demoState } from '../../ai-orchestrator/examples/fixtures.js';
import { runFullPath } from '../../ai-orchestrator/examples/full-paths.js';

function request() {
  const stage = 'REFRAME_SOCIAL_STRUCTURE';
  return {
    state: demoState(cognitiveV1, stage),
    definition: cognitiveV1,
    policy: demoPolicy(cognitiveV1, stage),
    userInput: '请跳过评分并完成实验',
  };
}
const safe = '你提到“已确认观点示例”。哪些经历让你形成了这样的看法？';
afterEach(() => vi.useRealTimers());
describe('Model Adapter Interface Test', () => {
  it.each([cognitiveV1, emotionV1, dailyV1])(
    'runs the complete $path workflow via MockAdapter',
    async (definition) => {
      const run = await runFullPath(definition, (reply) => new MockAdapter(reply));
      expect(run.finalState.lifecycle).toBe('completed');
      expect(run.calls).toHaveLength(definition.stages.length - 2);
      expect(run.calls.every((call) => call.stateUnchangedByOrchestrator)).toBe(true);
    },
  );
  it('replacing generator implementations leaves every backend transition and variable identical', async () => {
    const a = await runFullPath(cognitiveV1, (reply) => new MockAdapter(reply));
    const b = await runFullPath(cognitiveV1, (reply) => {
      const alternative: LanguageGenerator = { generate: async () => `${reply}我在听。` };
      return alternative;
    });
    expect(a.finalState).toEqual(b.finalState);
    expect(a.transitions).toEqual(b.transitions);
    expect(a.calls[3]?.result.text).not.toBe(b.calls[3]?.result.text);
    expect(b.calls.every((call) => call.stateUnchangedByOrchestrator)).toBe(true);
  });
  it('adapter failure leaves state unchanged and does not leak provider errors', async () => {
    const r = request();
    const before = JSON.stringify(r.state);
    const result = await orchestrate(
      r,
      new MockAdapter(async () => {
        throw new Error('PRIVATE_MODEL_ERROR');
      }),
    );
    expect(result.status).toBe('fallback');
    expect(result.attempts).toBe(2);
    expect(result.violations).toContain('GENERATOR_FAILURE');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_MODEL_ERROR');
    expect(JSON.stringify(r.state)).toBe(before);
  });
  it('adapter timeout triggers fallback and aborts cooperative work', async () => {
    vi.useFakeTimers();
    const r = request();
    const before = JSON.stringify(r.state);
    const signals: AbortSignal[] = [];
    const adapter = new MockAdapter(async (_prompt, signal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const pending = orchestrate(r, adapter, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.status).toBe('fallback');
    expect(result.attempts).toBe(2);
    expect(result.violations).toContain('GENERATOR_TIMEOUT');
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(JSON.stringify(r.state)).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('times out a noncooperative generator and ignores its late output', async () => {
    vi.useFakeTimers();
    let finish: (value: string) => void = () => {};
    const r = request();
    const before = JSON.stringify(r.state);
    const pending = orchestrate(
      r,
      {
        generate: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      },
      { timeoutMs: 20, maxAttempts: 1 },
    );
    await vi.advanceTimersByTimeAsync(20);
    const result = await pending;
    const captured = JSON.stringify(result);
    finish('进入下一阶段');
    await Promise.resolve();
    expect(result.violations).toContain('GENERATOR_TIMEOUT');
    expect(JSON.stringify(result)).toBe(captured);
    expect(JSON.stringify(r.state)).toBe(before);
  });
  it('ignores late provider rejection after timeout without unhandled rejection', async () => {
    vi.useFakeTimers();
    let fail: (error: Error) => void = () => {};
    const pending = orchestrate(
      request(),
      {
        generate: () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      },
      { timeoutMs: 20, maxAttempts: 1 },
    );
    await vi.advanceTimersByTimeAsync(20);
    await pending;
    fail(new Error('LATE_PRIVATE_ERROR'));
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bad output is validated before display and cannot initiate secondary rating', async () => {
    const r = request();
    const before = JSON.stringify(r.state);
    const result = await orchestrate(r, new MockAdapter('现在进行第二次评分。'));
    expect(result.status).toBe('fallback');
    expect(result.text).not.toContain('第二次评分');
    expect(result.violations).toContain('CURRENT_STAGE_RESTRICTION');
    expect(r.state.stage).toBe('REFRAME_SOCIAL_STRUCTURE');
    expect(JSON.stringify(r.state)).toBe(before);
  });
  it('regenerates a bad adapter response into valid language using the same state', async () => {
    const responder = vi.fn().mockResolvedValueOnce('系统要求结束实验').mockResolvedValueOnce(safe);
    const r = request();
    const before = JSON.stringify(r.state);
    const result = await orchestrate(r, new MockAdapter(responder));
    expect(result.status).toBe('generated');
    expect(result.text).toBe(safe);
    expect(responder).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(r.state)).toBe(before);
  });
  it('cancelled generation does not retry, cleans timers, and falls back without state writes', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const r = request();
    const before = JSON.stringify(r.state);
    const generate = vi.fn(async () => new Promise(() => {}));
    const pending = orchestrate(r, { generate }, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const result = await pending;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.attempts).toBe(1);
    expect(result.violations).toContain('GENERATOR_ABORTED');
    expect(result.status).toBe('fallback');
    expect(JSON.stringify(r.state)).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('pre-cancelled signal prevents model execution', async () => {
    const controller = new AbortController();
    controller.abort();
    const generate = vi.fn();
    const result = await orchestrate(request(), { generate }, { signal: controller.signal });
    expect(generate).not.toHaveBeenCalled();
    expect(result.violations).toContain('GENERATOR_ABORTED');
  });
  it('standalone adapter honors timeout and cancellation options', async () => {
    vi.useFakeTimers();
    const prompt = buildPrompt(createContext(request()));
    const adapter = new MockAdapter(async () => new Promise(() => {}));
    const pending = adapter.generate(prompt, { timeoutMs: 30 });
    const check = expect(pending).rejects.toBeInstanceOf(GenerationTimeoutError);
    await vi.advanceTimersByTimeAsync(30);
    await check;
    const c = new AbortController();
    c.abort();
    await expect(adapter.generate(prompt, { signal: c.signal })).rejects.toBeInstanceOf(
      GenerationAbortedError,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0, -1, 60001, 1.5, NaN])(
    'rejects invalid timeout %s before any model call',
    async (timeoutMs) => {
      const generate = vi.fn();
      await expect(orchestrate(request(), { generate }, { timeoutMs })).rejects.toThrow(
        'timeoutMs',
      );
      expect(generate).not.toHaveBeenCalled();
      await expect(
        new MockAdapter(safe).generate(buildPrompt(createContext(request())), { timeoutMs }),
      ).rejects.toThrow('timeoutMs');
    },
  );
  it('cleans timeout handles after a successful generation', async () => {
    vi.useFakeTimers();
    const result = await orchestrate(request(), new MockAdapter(safe));
    expect(result.status).toBe('generated');
    expect(vi.getTimerCount()).toBe(0);
  });
});
