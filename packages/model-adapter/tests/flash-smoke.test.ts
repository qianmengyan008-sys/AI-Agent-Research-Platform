import { describe, it, expect } from 'vitest';
import { OpenAICompatibleAdapter } from '../src/index.js';
import { runDeepSeekFlashSmoke, latencySummary } from '../examples/deepseek-flash-smoke.js';
const env = { DEEPSEEK_API_KEY: 'SYNTHETIC_SECRET_ONLY', DEEPSEEK_MODEL_NAME: 'deepseek-flash' };
const config = {
  baseURL: 'https://model.example/v1',
  apiKey: 'SYNTHETIC_SECRET_ONLY',
  model: 'deepseek-flash',
  temperature: 0.2,
  maxTokens: 512,
  timeoutMs: 1000,
};
const prompt = {
  systemPrompt: '',
  statePrompt: '',
  memorySummary: '',
  messages: [{ role: 'user' as const, content: 'hello' }],
};
const response = (model?: string) =>
  new Response(
    JSON.stringify({ ...(model ? { model } : {}), choices: [{ message: { content: '你好。' } }] }),
  );
describe('DeepSeek single smoke and per-call identity', () => {
  it('never guesses the returned model from the requested model or routing claim', async () => {
    const adapter = new OpenAICompatibleAdapter(config, async () =>
      response('provider-returned-id'),
    );
    expect(await adapter.generateWithMetadata(prompt)).toMatchObject({
      status: 'completed',
      requested_model: 'deepseek-flash',
      response_model: 'provider-returned-id',
      http_status: 200,
      retry_count: 0,
    });
    const absent = new OpenAICompatibleAdapter(config, async () => response());
    expect((await absent.generateWithMetadata(prompt)).response_model).toBeNull();
    expect(await absent.generate(prompt)).toBe('你好。');
  });
  it('keeps metadata local to concurrent calls instead of retaining a global last model', async () => {
    const adapter = new OpenAICompatibleAdapter(config, async (_url, init) => {
      const content = JSON.parse(String(init!.body)).messages[0].content;
      await new Promise((resolve) => setTimeout(resolve, content === 'a' ? 20 : 1));
      return response(content);
    });
    const [a, b] = await Promise.all(
      ['a', 'b'].map((content) =>
        adapter.generateWithMetadata({ ...prompt, messages: [{ role: 'user', content }] }),
      ),
    );
    expect(a!.response_model).toBe('a');
    expect(b!.response_model).toBe('b');
  });
  it('smoke uses exactly one selected-key request with no GPT/common-key fallback, retry, streaming or enabled thinking', async () => {
    let calls = 0;
    const report = await runDeepSeekFlashSmoke(
      { ...env, MODEL_API_KEY: 'WRONG_GENERIC', GPT_API_KEY: 'WRONG_GPT' },
      async (url, init) => {
        calls++;
        expect(String(url)).toBe('https://api.deepseek.com/v1/chat/completions');
        expect((init!.headers as Record<string, string>).Authorization).toBe(
          'Bearer SYNTHETIC_SECRET_ONLY',
        );
        const body = JSON.parse(String(init!.body));
        expect(body).toMatchObject({
          model: 'deepseek-flash',
          temperature: 0.2,
          max_tokens: 512,
          stream: false,
        });
        expect(body.thinking).toBeUndefined();
        expect(body.reasoning).toBeUndefined();
        return response('observed-id');
      },
    );
    expect(calls).toBe(1);
    expect(report).toMatchObject({
      status: 'completed',
      adapter_attempts: 1,
      response_model: 'observed-id',
      smoke_max_attempts: 1,
      retry_count: 0,
      pilot_ready: false,
      route_claim_verified: false,
    });
    expect(JSON.stringify(report)).not.toContain('SYNTHETIC_SECRET_ONLY');
  });
  it.each([
    [401, 'authentication'],
    [400, 'model_or_endpoint_or_parameter_not_determined'],
    [500, 'provider_unavailable'],
  ] as const)(
    'stops after HTTP %s and never exposes provider error bodies',
    async (status, layer) => {
      let calls = 0;
      const report = await runDeepSeekFlashSmoke(env, async () => {
        calls++;
        return new Response('PRIVATE_ERROR_BODY', { status });
      });
      expect(calls).toBe(1);
      expect(report).toMatchObject({
        status: 'failed',
        http_status: status,
        failure_layer: layer,
        retry_count: 0,
        subsequent_tests_allowed: false,
      });
      expect(JSON.stringify(report)).not.toContain('PRIVATE_ERROR_BODY');
    },
  );
  it('records malformed protocol response and timeout without retrying', async () => {
    const malformed = await runDeepSeekFlashSmoke(env, async () => new Response('not-json'));
    const empty = await runDeepSeekFlashSmoke(
      env,
      async () => new Response(JSON.stringify({ choices: [{ message: { content: ' ' } }] })),
    );
    expect(empty).toMatchObject({
      status: 'failed',
      error_code: 'INVALID_RESPONSE',
      subsequent_tests_allowed: false,
      output: null,
    });
    expect(malformed).toMatchObject({
      status: 'failed',
      http_status: 200,
      failure_layer: 'protocol_or_response_format',
    });
    let calls = 0;
    const timeout = await runDeepSeekFlashSmoke(
      { ...env, MODEL_TIMEOUT_MS: '10' },
      async (_url, init) => {
        calls++;
        return new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            'abort',
            () => reject(new Error('PRIVATE_NETWORK_DETAIL')),
            { once: true },
          ),
        );
      },
    );
    expect(calls).toBe(1);
    expect(timeout).toMatchObject({
      status: 'failed',
      error_code: 'TIMEOUT',
      failure_layer: 'timeout',
      request_sent: null,
    });
    expect(JSON.stringify(timeout)).not.toContain('PRIVATE_NETWORK_DETAIL');
  });
  it('absence of scoped credentials or wrong selected model never invokes transport', async () => {
    let calls = 0;
    const transport = async () => {
      calls++;
      return response();
    };
    expect(
      await runDeepSeekFlashSmoke(
        { MODEL_API_KEY: 'COMMON_ONLY', DEEPSEEK_MODEL_NAME: 'deepseek-flash' },
        transport,
      ),
    ).toMatchObject({
      status: 'not_run',
      missing_variables: ['DEEPSEEK_API_KEY'],
      adapter_attempts: 0,
    });
    expect(
      await runDeepSeekFlashSmoke({ ...env, DEEPSEEK_MODEL_NAME: 'other-model' }, transport),
    ).toMatchObject({
      status: 'not_run',
      failure_layer: 'requested_model_selection',
      adapter_attempts: 0,
    });
    expect(calls).toBe(0);
  });
  it('reports P50/P95/max, strict 3s/5s tail counts and retries/fallback without a 1s gate', () => {
    const result = latencySummary(
      [100, 3000, 3001, 5000, 5001].map((latency_ms, index) => ({
        latency_ms,
        retry_count: index === 1 ? 1 : 0,
        fallback_count: index === 2 ? 1 : 0,
      })),
    );
    expect(result).toMatchObject({
      count: 5,
      p50_ms: 3001,
      p95_ms: 5001,
      max_ms: 5001,
      over_3s_count: 3,
      over_5s_count: 1,
      retry_count: 1,
      fallback_count: 1,
    });
    expect(latencySummary([])).toMatchObject({
      count: 0,
      p50_ms: null,
      over_3s_count: null,
      retry_count: null,
    });
    expect(() =>
      latencySummary([{ latency_ms: NaN, retry_count: 0, fallback_count: 0 }]),
    ).toThrow();
  });
});
