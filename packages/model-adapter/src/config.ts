import type { LanguageGenerator } from '@research/ai-orchestrator';
import { MockAdapter } from './providers/mock-adapter.js';
import { OpenAICompatibleAdapter } from './providers/openai-compatible-adapter.js';
import type { FetchTransport } from './providers/openai-compatible-adapter.js';

export interface ModelSettings {
  readonly provider: 'mock' | 'openai-compatible' | 'deepseek';
  readonly model_name: string;
  readonly base_url: string | null;
  readonly temperature: number;
  readonly max_tokens: number;
  readonly timeout_ms: number;
  readonly max_attempts: number;
}
export type ModelEnvironment = Readonly<Record<string, string | undefined>>;
function number(
  env: ModelEnvironment,
  name: string,
  fallback: number,
  min: number,
  max: number,
  integer = false,
) {
  const raw = env[name];
  const value = raw === undefined ? fallback : raw.trim() === '' ? NaN : Number(raw);
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error(`Invalid ${name}`);
  return value;
}
export function modelSettings(env: ModelEnvironment): ModelSettings {
  const provider = env.MODEL_PROVIDER ?? 'mock';
  if (!['mock', 'openai-compatible', 'deepseek'].includes(provider))
    throw new Error('Invalid MODEL_PROVIDER');
  const model = provider === 'mock' ? 'local-mock' : env.MODEL_NAME;
  if (!model?.trim() || model.length > 128) throw new Error('MODEL_NAME is required');
  return Object.freeze({
    provider: provider as ModelSettings['provider'],
    model_name: model,
    base_url:
      provider === 'mock'
        ? null
        : (env.MODEL_API_BASE_URL ??
          (provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1')),
    temperature: number(env, 'MODEL_TEMPERATURE', 0.2, 0, 2),
    max_tokens: number(env, 'MODEL_MAX_TOKENS', 512, 1, 32768, true),
    timeout_ms: number(env, 'MODEL_TIMEOUT_MS', 10000, 1, 60000, true),
    max_attempts: number(env, 'MODEL_MAX_ATTEMPTS', 2, 1, 3, true),
  });
}
export function createConfiguredGenerator(
  env: ModelEnvironment,
  transport?: FetchTransport,
): { readonly generator: LanguageGenerator; readonly settings: ModelSettings } {
  const settings = modelSettings(env);
  const generator: LanguageGenerator =
    settings.provider === 'mock'
      ? new MockAdapter('我在听，你愿意多聊一点吗？')
      : new OpenAICompatibleAdapter(
          {
            baseURL: settings.base_url!,
            apiKey: env.MODEL_API_KEY ?? '',
            model: settings.model_name,
            temperature: settings.temperature,
            maxTokens: settings.max_tokens,
            timeoutMs: settings.timeout_ms,
          },
          transport,
        );
  return { generator, settings };
}
