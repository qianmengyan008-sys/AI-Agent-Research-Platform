import type { GenerationOptions } from './types.js';

export class GenerationTimeoutError extends Error {
  constructor() {
    super('Generation timed out');
    this.name = 'GenerationTimeoutError';
  }
}
export class GenerationAbortedError extends Error {
  constructor() {
    super('Generation cancelled');
    this.name = 'GenerationAbortedError';
  }
}

/** Bound the wait even if a generator ignores cancellation; discard late output. */
export async function runGeneration<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: GenerationOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw new Error('timeoutMs must be an integer from 1 to 60000');
  if (options.signal?.aborted) throw new GenerationAbortedError();
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (result: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancelled);
      if ('error' in result) reject(result.error);
      else resolve(result.value);
    };
    const cancelled = () => {
      finish({ error: new GenerationAbortedError() });
      controller.abort();
    };
    const timer = setTimeout(() => {
      finish({ error: new GenerationTimeoutError() });
      controller.abort();
    }, timeoutMs);
    options.signal?.addEventListener('abort', cancelled, { once: true });
    // Attach both handlers so a late resolve/reject cannot leak or overwrite fallback.
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new GenerationAbortedError();
        return operation(controller.signal);
      })
      .then(
        (value) => finish({ value }),
        (error) => finish({ error }),
      );
  });
}
