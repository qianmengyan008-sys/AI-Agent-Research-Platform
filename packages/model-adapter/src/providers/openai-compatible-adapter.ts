import { runGeneration, GenerationFailureError } from '@research/ai-orchestrator';
import { GenerationTimeoutError, GenerationAbortedError } from '@research/ai-orchestrator';
import type { GenerationOptions, LanguageGenerator, PromptBundle } from '@research/ai-orchestrator';

export type ProviderErrorCode =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'OUTPUT_TRUNCATED'
  | 'NETWORK_ERROR';
export class ModelAdapterError extends GenerationFailureError {
  constructor(
    readonly code: ProviderErrorCode,
    retryable: boolean,
    readonly status?: number,
  ) {
    super(retryable);
    this.name = 'ModelAdapterError';
  }
}
export interface OpenAICompatibleConfig {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
  /** Loopback HTTP is allowed only for explicit local protocol tests. */
  readonly allowLocalHTTP?: boolean;
}
export type FetchTransport = typeof fetch;
export interface ModelGenerationMeasurement {
  readonly status: 'completed' | 'failed';
  readonly requested_model: string;
  readonly response_model: string | null;
  readonly http_status: number | null;
  readonly latency_ms: number;
  readonly retry_count: 0;
  readonly text: string | null;
  readonly error_code: ProviderErrorCode | 'TIMEOUT' | 'ABORTED' | 'UNEXPECTED' | null;
}
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** One HTTP request per call. Retry budget belongs to the orchestrator. */
export class OpenAICompatibleAdapter implements LanguageGenerator {
  readonly #config: OpenAICompatibleConfig;
  readonly #endpoint: string;
  readonly #transport: FetchTransport;
  constructor(config: OpenAICompatibleConfig, transport: FetchTransport = fetch) {
    let url: URL;
    try {
      url = new URL(config.baseURL);
    } catch {
      throw new Error('Invalid model base URL');
    }
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(url.protocol === 'https:' || (config.allowLocalHTTP && local && url.protocol === 'http:'))
    )
      throw new Error('Model base URL requires HTTPS without credentials, query or fragment');
    if (typeof config.apiKey !== 'string' || !config.apiKey.trim() || /[\r\n]/u.test(config.apiKey))
      throw new Error('MODEL_API_KEY is required');
    if (typeof config.model !== 'string' || !config.model.trim() || config.model.length > 128)
      throw new Error('MODEL_NAME is required and must be bounded');
    if (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2)
      throw new Error('Temperature must be within 0–2');
    if (!Number.isSafeInteger(config.maxTokens) || config.maxTokens < 1 || config.maxTokens > 32768)
      throw new Error('maxTokens must be an integer within 1–32768');
    if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 60000)
      throw new Error('timeoutMs must be an integer within 1–60000');
    this.#config = { ...config };
    this.#endpoint = `${url.toString().replace(/\/$/u, '')}/chat/completions`;
    this.#transport = transport;
  }
  generate(prompt: PromptBundle, options: GenerationOptions = {}): Promise<string> {
    return this.#request(prompt, options);
  }
  /** Single adapter attempt; metadata belongs to this call, never shared across requests. */
  async generateWithMetadata(
    prompt: PromptBundle,
    options: GenerationOptions = {},
  ): Promise<ModelGenerationMeasurement> {
    let httpStatus: number | null = null,
      responseModel: string | null = null;
    const started = performance.now();
    try {
      const text = await this.#request(prompt, options, (status, model) => {
        httpStatus = status;
        responseModel = model;
      });
      return {
        status: 'completed',
        requested_model: this.#config.model,
        response_model: responseModel,
        http_status: httpStatus,
        latency_ms: performance.now() - started,
        retry_count: 0,
        text,
        error_code: null,
      };
    } catch (error) {
      return {
        status: 'failed',
        requested_model: this.#config.model,
        response_model: responseModel,
        http_status: httpStatus,
        latency_ms: performance.now() - started,
        retry_count: 0,
        text: null,
        error_code:
          error instanceof ModelAdapterError
            ? error.code
            : error instanceof GenerationTimeoutError
              ? 'TIMEOUT'
              : error instanceof GenerationAbortedError
                ? 'ABORTED'
                : 'UNEXPECTED',
      };
    }
  }
  #request(
    prompt: PromptBundle,
    options: GenerationOptions,
    observe?: (status: number, model: string | null) => void,
  ): Promise<string> {
    return runGeneration(
      async (signal) => {
        try {
          const response = await this.#transport(this.#endpoint, {
            method: 'POST',
            signal,
            redirect: 'error',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.#config.apiKey}`,
            },
            // No debug bundle, state snapshot, tools, future tasks or provider metadata.
            body: JSON.stringify({
              model: this.#config.model,
              messages: prompt.messages,
              temperature: this.#config.temperature,
              max_tokens: this.#config.maxTokens,
              stream: false,
            }),
          });
          observe?.(response.status, null);
          if (!response.ok) {
            await response.body?.cancel();
            const code: ProviderErrorCode =
              response.status === 401 || response.status === 403
                ? 'AUTHENTICATION'
                : response.status === 429
                  ? 'RATE_LIMIT'
                  : response.status >= 500
                    ? 'PROVIDER_UNAVAILABLE'
                    : 'INVALID_REQUEST';
            throw new ModelAdapterError(
              code,
              response.status === 429 || response.status >= 500,
              response.status,
            );
          }
          if (!response.body) throw new ModelAdapterError('INVALID_RESPONSE', false);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let size = 0;
          let text = '';
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.byteLength;
              if (size > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                throw new ModelAdapterError('INVALID_RESPONSE', false);
              }
              text += decoder.decode(chunk.value, { stream: true });
            }
            text += decoder.decode();
          } finally {
            reader.releaseLock();
          }
          let payload: unknown;
          try {
            payload = JSON.parse(text);
          } catch {
            throw new ModelAdapterError('INVALID_RESPONSE', false);
          }
          const responseModel =
            payload &&
            typeof payload === 'object' &&
            'model' in payload &&
            typeof payload.model === 'string' &&
            payload.model.length > 0 &&
            payload.model.length <= 128
              ? payload.model
              : null;
          observe?.(response.status, responseModel);
          if (
            !payload ||
            typeof payload !== 'object' ||
            !('choices' in payload) ||
            !Array.isArray(payload.choices)
          )
            throw new ModelAdapterError('INVALID_RESPONSE', false);
          if (payload.choices[0]?.finish_reason === 'length')
            throw new ModelAdapterError('OUTPUT_TRUNCATED', true);
          if (payload.choices[0]?.finish_reason && payload.choices[0]?.finish_reason !== 'stop')
            throw new ModelAdapterError('INVALID_RESPONSE', false);
          const message: unknown = payload.choices[0]?.message;
          if (
            !message ||
            typeof message !== 'object' ||
            !('content' in message) ||
            typeof message.content !== 'string' ||
            ('tool_calls' in message &&
              Array.isArray(message.tool_calls) &&
              message.tool_calls.length > 0) ||
            ('function_call' in message && message.function_call != null)
          )
            throw new ModelAdapterError('INVALID_RESPONSE', false);
          return message.content;
        } catch (error) {
          if (error instanceof ModelAdapterError) throw error;
          throw new ModelAdapterError('NETWORK_ERROR', true);
        }
      },
      { ...options, timeoutMs: options.timeoutMs ?? this.#config.timeoutMs },
    );
  }
}
