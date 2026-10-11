import { describe, expect, it } from 'vitest';
import { dailyV1 } from '@research/experiment-core';
import { demoPolicy, orchestrate } from '@research/ai-orchestrator';
import { experimentLog } from '../src/index.js';
import type { ModelSettings } from '../src/index.js';
import { stateAt } from '../examples/experiment-run.js';
import { boundaryFaultDiagnostics } from '../examples/generation-diagnostics.js';
const settings: ModelSettings = {
  provider: 'openai-compatible',
  model_name: 'synthetic-metadata-fixture',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 20,
  max_attempts: 2,
};
async function logInput() {
  const state = stateAt(dailyV1, 'NATURAL_CHAT');
  const result = await orchestrate(
    { state, definition: dailyV1, policy: demoPolicy(dailyV1, state.stage), userInput: '阅读。' },
    { generate: async () => '你最近喜欢读什么书？' },
  );
  return {
    conversation_id: 'synthetic-c',
    participant_id: 'synthetic-p',
    model_name: settings.model_name,
    state_before: state,
    state_after: state,
    result,
    response_latency: 1,
    fallback_count: 0,
  };
}
describe('round nine report provenance', () => {
  it('records configured provider alongside the required model metrics', async () => {
    const log = experimentLog({ ...(await logInput()), model_parameters: settings });
    expect(log).toMatchObject({
      provider: 'openai-compatible',
      model_name: settings.model_name,
      temperature: 0.2,
      max_tokens: 512,
      retry_count: 0,
      response_latency: 1,
      fallback_count: 0,
    });
    expect(log.validator_result.status).toBe('generated');
  });
  it('does not guess the provider for existing callers', async () => {
    expect(experimentLog(await logInput()).provider).toBeNull();
  });
  it('rejects invalid provider metadata instead of storing arbitrary text', async () => {
    const input = await logInput();
    expect(() =>
      experimentLog({ ...input, model_parameters: { ...settings, provider: 'unrecognized' } }),
    ).toThrow('Invalid model log parameters');
  });
  it('reports injected timeout separately with cancellation and immutable state', async () => {
    const report = await boundaryFaultDiagnostics(settings);
    expect(report.mode).toBe('local-fault-injection');
    expect(report.realProviderCalls).toBe(0);
    expect(report.abortNotifications).toBe(2);
    expect(report.timeout.result.attempts).toBe(2);
    expect(report.timeout.result.violations).toContain('GENERATOR_TIMEOUT');
    expect(report.timeout.stateUnchanged).toBe(true);
    expect(report.timeout.metrics.provider).toBe('mock');
    expect(report.timeout.metrics.model_name).toBe('local-fault-injection');
    expect(
      report.timeout.result.auditEvents
        .filter((e) => e.outcome === 'rejected')
        .every((e) => e.type === 'MODEL_GENERATION_FAILED'),
    ).toBe(true);
  });
});
