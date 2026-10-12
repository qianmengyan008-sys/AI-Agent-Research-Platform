import { createConfiguredGenerator, modelSettings, OpenAICompatibleAdapter } from '../src/index.js';
import type { FetchTransport, ModelEnvironment } from '../src/index.js';
/** One protocol/authentication attempt, never experiment prompts or backend transitions. */
export async function runDeepSeekFlashSmoke(env: ModelEnvironment, transport?: FetchTransport) {
  const selected: ModelEnvironment = {
    ...env,
    MODEL_PROVIDER: 'deepseek',
    MODEL_NAME: undefined,
    MODEL_API_KEY: undefined,
    MODEL_API_BASE_URL: undefined,
  };
  const missing = ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL_NAME'].filter((k) => !selected[k]?.trim());
  const base = {
    mode: transport ? 'local-fixture' : 'real-provider',
    provider: 'deepseek',
    requested_model: env.DEEPSEEK_MODEL_NAME ?? null,
    response_model: null,
    route_claim_verified: false,
    scope: 'single protocol smoke, not study semantic acceptance',
    retry_count: 0,
    fallback_count: 0,
    pilot_ready: false,
    formal_ready: false,
  };
  if (missing.length)
    return {
      ...base,
      status: 'not_run',
      failure_layer: 'runtime_configuration',
      missing_variables: missing,
      adapter_attempts: 0,
      external_model_calls: 0,
      request_sent: false,
      http_status: null,
      latency_ms: null,
      output: null,
      error_code: null,
    };
  if (selected.DEEPSEEK_MODEL_NAME !== 'deepseek-flash')
    return {
      ...base,
      status: 'not_run',
      failure_layer: 'requested_model_selection',
      missing_variables: [],
      adapter_attempts: 0,
      external_model_calls: 0,
      request_sent: false,
      http_status: null,
      latency_ms: null,
      output: null,
      error_code: null,
    };
  try {
    const settings = modelSettings(selected);
    const { generator } = createConfiguredGenerator(selected, transport);
    if (!(generator instanceof OpenAICompatibleAdapter))
      throw new Error('Expected compatible adapter');
    const measurement = await generator.generateWithMetadata({
      systemPrompt: '请提供简短自然语言回复。',
      statePrompt: '',
      memorySummary: '',
      messages: [
        { role: 'system', content: '请提供简短自然语言回复。' },
        { role: 'user', content: '请用一句简短中文问候。' },
      ],
    });
    const errorCode =
      measurement.error_code ??
      (measurement.status === 'completed' && !measurement.text?.trim() ? 'INVALID_RESPONSE' : null);
    const status = errorCode ? 'failed' : measurement.status;
    const layers = {
      AUTHENTICATION: 'authentication',
      RATE_LIMIT: 'rate_limit',
      PROVIDER_UNAVAILABLE: 'provider_unavailable',
      INVALID_REQUEST: 'model_or_endpoint_or_parameter_not_determined',
      INVALID_RESPONSE: 'protocol_or_response_format',
      NETWORK_ERROR: 'network',
      TIMEOUT: 'timeout',
      ABORTED: 'cancelled',
      UNEXPECTED: 'unexpected',
    };
    return {
      ...base,
      ...measurement,
      settings,
      status,
      error_code: errorCode,
      text: status === 'completed' ? measurement.text : null,
      configured_max_attempts: settings.max_attempts,
      smoke_max_attempts: 1,
      adapter_attempts: 1,
      external_model_calls: transport ? 0 : 1,
      request_sent: measurement.http_status !== null ? true : null,
      http_response_received: measurement.http_status !== null,
      output: status === 'completed' ? measurement.text : null,
      failure_layer: errorCode ? layers[errorCode] : null,
      subsequent_tests_allowed: status === 'completed',
      formal_prompt_required_before_study: true,
    };
  } catch {
    return {
      ...base,
      status: 'failed',
      failure_layer: 'configuration_validation',
      adapter_attempts: 0,
      external_model_calls: 0,
      request_sent: false,
      http_status: null,
      latency_ms: null,
      output: null,
      error_code: 'INVALID_CONFIGURATION',
    };
  }
}
export function latencySummary(
  samples: readonly { latency_ms: number; retry_count: number; fallback_count: number }[],
) {
  if (
    samples.some(
      (s) =>
        !Number.isFinite(s.latency_ms) ||
        s.latency_ms < 0 ||
        !Number.isSafeInteger(s.retry_count) ||
        s.retry_count < 0 ||
        !Number.isSafeInteger(s.fallback_count) ||
        s.fallback_count < 0,
    )
  )
    throw new Error('Invalid latency samples');
  const values = samples.map((s) => s.latency_ms).sort((a, b) => a - b);
  return {
    count: values.length,
    p50_ms: values.length ? values[Math.ceil(values.length * 0.5) - 1] : null,
    p95_ms: values.length ? values[Math.ceil(values.length * 0.95) - 1] : null,
    max_ms: values.at(-1) ?? null,
    over_3s_count: values.length ? values.filter((v) => v > 3000).length : null,
    over_5s_count: values.length ? values.filter((v) => v > 5000).length : null,
    retry_count: values.length ? samples.reduce((n, s) => n + s.retry_count, 0) : null,
    fallback_count: values.length ? samples.reduce((n, s) => n + s.fallback_count, 0) : null,
    definition: 'whole operation elapsed time; no 1-second cutoff; no fabricated zero measurements',
  };
}
