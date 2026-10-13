import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, errorText, ApiError } from '../../web/src/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('client recovery deadlines', () => {
  it('bounds a hung transport even when it ignores cancellation', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const fetch = vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetch);
    const outcome = expect(
      api('/conversation/message', '', { request_id: 'unchanged-id' }, { timeoutMs: 20 }),
    ).rejects.toMatchObject({ status: 0, code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20);
    await outcome;
    expect(signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string).request_id).toBe('unchanged-id');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds a stalled response body as well as fetching response headers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })),
    );
    const outcome = expect(
      api('/admin/export', '', undefined, { timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20);
    await outcome;
  });
  it('cancels in-flight work without waiting for the deadline', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const outcome = expect(
      api('/conversation/turns/example', '', undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    controller.abort();
    await outcome;
  });
  it('does not send an already cancelled operation', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      api('/experiment/submissions', '', {}, { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cleans its deadline after success and preserves definitive HTTP rejections', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ saved: true }))),
    );
    expect(await api('/test')).toEqual({ saved: true });
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'STATE_CONFLICT' }), { status: 409 })),
    );
    await expect(api('/test')).rejects.toMatchObject({ status: 409, code: 'STATE_CONFLICT' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('explains that timeout does not prove the server failed to save', () => {
    expect(errorText(new ApiError(0, 'REQUEST_TIMEOUT'))).toContain('结果可能已保存');
  });
});
