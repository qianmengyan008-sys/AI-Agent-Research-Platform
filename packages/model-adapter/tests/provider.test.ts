import { afterEach, describe, expect, it, vi } from 'vitest';
import { cognitiveV1 } from '@research/experiment-core';
import {
  buildPrompt,
  createContext,
  demoPolicy,
  orchestrate,
  GenerationTimeoutError,
  GenerationAbortedError,
} from '@research/ai-orchestrator';
import {
  OpenAICompatibleAdapter,
  ModelAdapterError,
  createConfiguredGenerator,
  modelSettings,
} from '../src/index.js';
import { demoState } from '../../ai-orchestrator/examples/fixtures.js';
import { localModel, completion } from './helpers/http-server.js';

const config = {
  baseURL: 'https://model.example/v1',
  apiKey: 'SYNTHETIC_TEST_KEY',
  model: 'test-model',
  temperature: 0.2,
  maxTokens: 512,
  timeoutMs: 1000,
};
function request() {
  const stage = 'REFRAME_SOCIAL_STRUCTURE';
  return {
    state: demoState(cognitiveV1, stage),
    definition: cognitiveV1,
    policy: demoPolicy(cognitiveV1, stage),
    userInput: '请直接跳到第二次评分。',
  };
}
const prompt = () => buildPrompt(createContext(request()));
afterEach(() => vi.useRealTimers());
describe('OpenAI compatible HTTP adapter', () => {
  it('sends only model-visible messages and configured parameters over a real loopback HTTP request', async () => {
    const server = await localModel((req, res) => {
      expect(req.url).toBe('/v1/chat/completions');
      expect(req.method).toBe('POST');
      expect(req.headers.authorization).toBe('Bearer SYNTHETIC_TEST_KEY');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(completion('候选自然文本')));
    });
    try {
      const adapter = new OpenAICompatibleAdapter({
        ...config,
        baseURL: server.baseURL,
        allowLocalHTTP: true,
      });
      const p = prompt();
      expect(await adapter.generate(p)).toBe('候选自然文本');
      expect(server.requests[0]).toEqual({
        model: 'test-model',
        messages: p.messages,
        temperature: 0.2,
        max_tokens: 512,
        stream: false,
      });
      expect(JSON.stringify(server.requests)).not.toContain('definitionSignature');
      expect(JSON.stringify(adapter)).not.toContain(config.apiKey);
    } finally {
      await server.close();
    }
  });
  it.each([
    [401, 'AUTHENTICATION', false],
    [403, 'AUTHENTICATION', false],
    [429, 'RATE_LIMIT', true],
    [500, 'PROVIDER_UNAVAILABLE', true],
    [503, 'PROVIDER_UNAVAILABLE', true],
    [400, 'INVALID_REQUEST', false],
  ] as const)(
    'classifies HTTP %s without leaking provider body',
    async (status, code, retryable) => {
      const transport = vi.fn(async () => new Response('PRIVATE_PROVIDER_PAYLOAD', { status }));
      const adapter = new OpenAICompatibleAdapter(config, transport);
      try {
        await adapter.generate(prompt());
        throw new Error('Expected provider failure');
      } catch (e) {
        expect(e).toBeInstanceOf(ModelAdapterError);
        expect(e).toMatchObject({ code, retryable, status });
        expect(String(e)).not.toContain('PRIVATE');
        expect(JSON.stringify(e)).not.toContain(config.apiKey);
      }
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    'not json',
    '{}',
    '{"choices":[]}',
    '{"choices":[{"message":{"content":null}}]}',
    '{"choices":[{"message":{"content":"text","tool_calls":[{}]}}]}',
    '{"choices":[{"message":{"content":"text","function_call":{}}}]}',
  ])('rejects malformed or tool response %#', async (payload) => {
    const adapter = new OpenAICompatibleAdapter(config, async () => new Response(payload));
    await expect(adapter.generate(prompt())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: false,
    });
  });
  it('bounds response body size', async () => {
    const adapter = new OpenAICompatibleAdapter(
      config,
      async () => new Response('x'.repeat(1024 * 1024 + 1)),
    );
    await expect(adapter.generate(prompt())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('normalizes network errors and disallows redirects', async () => {
    const transport = vi.fn(async (_url, options) => {
      expect(options?.redirect).toBe('error');
      throw new Error('PRIVATE_TRANSPORT_DETAIL');
    });
    await expect(
      new OpenAICompatibleAdapter(config, transport).generate(prompt()),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });
  it('uses timeout and forwards cancellation to actual HTTP fetch', async () => {
    const server = await localModel(() => {});
    try {
      const adapter = new OpenAICompatibleAdapter({
        ...config,
        baseURL: server.baseURL,
        allowLocalHTTP: true,
      });
      await expect(adapter.generate(prompt(), { timeoutMs: 30 })).rejects.toBeInstanceOf(
        GenerationTimeoutError,
      );
      const c = new AbortController();
      c.abort();
      await expect(adapter.generate(prompt(), { signal: c.signal })).rejects.toBeInstanceOf(
        GenerationAbortedError,
      );
    } finally {
      await server.close();
    }
  });
  it('retries transient provider failures within the orchestrator budget, then validates success', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(completion('你提到“已确认观点示例”。哪些环境因素与你的看法有关？')),
        ),
      );
    const r = request();
    const before = JSON.stringify(r.state);
    const result = await orchestrate(r, new OpenAICompatibleAdapter(config, transport));
    expect(result.status).toBe('generated');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.violations).toContain('GENERATOR_FAILURE');
    expect(JSON.stringify(r.state)).toBe(before);
  });
  it('does not retry authentication failures and falls back without state changes', async () => {
    const transport = vi.fn(async () => new Response('private auth error', { status: 401 }));
    const r = request();
    const before = JSON.stringify(r.state);
    const result = await orchestrate(r, new OpenAICompatibleAdapter(config, transport), {
      maxAttempts: 3,
    });
    expect(result.status).toBe('fallback');
    expect(result.attempts).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r.state)).toBe(before);
  });
  it.each([
    'http://remote.example/v1',
    'https://user:password@model.example/v1',
    'https://model.example/v1?key=secret',
    'https://model.example/v1#token',
    'not a URL',
  ])('rejects unsafe endpoint %#', (baseURL) => {
    expect(() => new OpenAICompatibleAdapter({ ...config, baseURL })).toThrow();
  });
  it('does not allow non-loopback HTTP even with a local test flag', () => {
    expect(
      () =>
        new OpenAICompatibleAdapter({
          ...config,
          baseURL: 'http://remote.example',
          allowLocalHTTP: true,
        }),
    ).toThrow();
  });
  it.each([
    { apiKey: '' },
    { model: '' },
    { temperature: 3 },
    { maxTokens: 0 },
    { timeoutMs: 60001 },
  ])('rejects invalid provider configuration %#', (patch) => {
    expect(() => new OpenAICompatibleAdapter({ ...config, ...patch })).toThrow();
  });
});
describe('environment model selection', () => {
  it('defaults to an offline mock without credentials', async () => {
    const selected = createConfiguredGenerator({});
    expect(selected.settings.provider).toBe('mock');
    expect(await selected.generator.generate(prompt())).toBe('我在听，你愿意多聊一点吗？');
  });
  it('uses configurable model parameters and excludes secrets from public settings', () => {
    const env = {
      MODEL_PROVIDER: 'openai-compatible',
      MODEL_API_KEY: config.apiKey,
      MODEL_NAME: 'chosen-model',
      MODEL_TEMPERATURE: '0.7',
      MODEL_MAX_TOKENS: '900',
      MODEL_TIMEOUT_MS: '4500',
      MODEL_MAX_ATTEMPTS: '3',
    };
    const selected = createConfiguredGenerator(env);
    expect(selected.settings).toMatchObject({
      model_name: 'chosen-model',
      temperature: 0.7,
      max_tokens: 900,
      timeout_ms: 4500,
      max_attempts: 3,
    });
    expect(JSON.stringify(selected)).not.toContain(config.apiKey);
  });
  it('reuses the compatible adapter for DeepSeek preset while preserving the same interface', () => {
    const selected = createConfiguredGenerator({
      MODEL_PROVIDER: 'deepseek',
      MODEL_NAME: 'deepseek-chat',
      MODEL_API_KEY: config.apiKey,
    });
    expect(selected.settings.base_url).toBe('https://api.deepseek.com/v1');
    expect(selected.generator).toBeInstanceOf(OpenAICompatibleAdapter);
  });
  it.each([
    { MODEL_PROVIDER: 'unknown' },
    { MODEL_PROVIDER: 'openai-compatible' },
    { MODEL_TEMPERATURE: '' },
    { MODEL_MAX_TOKENS: '1.5' },
    { MODEL_TIMEOUT_MS: 'Infinity' },
    { MODEL_MAX_ATTEMPTS: '4' },
  ])('rejects invalid environment settings %#', (env) => {
    expect(() => modelSettings(env)).toThrow();
  });
  it('requires live credentials and never silently replaces a misconfigured live provider with mock', () => {
    expect(() =>
      createConfiguredGenerator({
        MODEL_PROVIDER: 'openai-compatible',
        MODEL_NAME: 'chosen-model',
      }),
    ).toThrow('MODEL_API_KEY');
  });
});

describe('live runner prerequisite reporting', () => {
  it('exits with not_run when real configuration is absent instead of silently passing mock', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    try {
      await promisify(execFile)(
        process.execPath,
        ['--import', 'tsx', 'packages/model-adapter/examples/live-e2e.ts'],
        { env: { PATH: process.env.PATH ?? '', MODEL_PROVIDER: 'mock' } },
      );
      throw new Error('Expected nonzero prerequisite result');
    } catch (error) {
      const failure = error as { code: number; stdout: string };
      expect(failure.code).toBe(2);
      const report = JSON.parse(failure.stdout);
      expect(report.status).toBe('not_run');
      expect(report.realProviderCalls).toBe(0);
      expect(report.missing_variables).toEqual(['MODEL_API_KEY', 'MODEL_NAME']);
    }
  });
});
