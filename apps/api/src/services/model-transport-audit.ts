import { AsyncLocalStorage } from 'node:async_hooks';
import type { ModelSettings } from '@research/model-adapter';

export interface TransportAttempt {
  attempt: number;
  provider: string;
  requested_model: string;
  response_model: string | null;
  http_status: number | null;
  network_failed: boolean;
}
export interface TransportAudit {
  settings: ModelSettings;
  attempts: TransportAttempt[];
}
export const modelTransportScope = new AsyncLocalStorage<TransportAudit>();

/** Per-generation observation; never captures request headers, body, keys or provider error text. */
export function auditedModelTransport(transport: typeof fetch = fetch): typeof fetch {
  return async (...args) => {
    const scope = modelTransportScope.getStore();
    if (!scope) return transport(...args);
    const attempt: TransportAttempt = {
      attempt: scope.attempts.length + 1,
      provider: scope.settings.provider,
      requested_model: scope.settings.model_name,
      response_model: null,
      http_status: null,
      network_failed: false,
    };
    scope.attempts.push(attempt);
    try {
      const response = await transport(...args);
      attempt.http_status = response.status;
      try {
        const body: unknown = await response.clone().json();
        const model = (body as { model?: unknown } | null)?.model;
        if (typeof model === 'string' && /^[A-Za-z0-9._:/-]{1,128}$/.test(model))
          attempt.response_model = model;
      } catch {
        // A missing identity stays null. Original adapter validates the original response.
      }
      return response;
    } catch (error) {
      attempt.network_failed = true;
      throw error;
    }
  };
}
