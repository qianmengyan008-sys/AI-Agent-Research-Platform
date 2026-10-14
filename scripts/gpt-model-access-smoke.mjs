/** Discover actual account models and stream one neutral greeting, no experimental state. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { selectAccountChatModel } from './comparison-run-evidence.mjs';
const [output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
const dir = resolve(output);
await mkdir(dir);
const base = process.env.GPT_API_BASE_URL ?? 'https://api.openai.com/v1',
  key = process.env.GPT_API_KEY;
if (!key?.trim()) throw Error('GPT_API_KEY_REQUIRED');
const headers = { Authorization: 'Bearer ' + key };
const listing = await fetch(base.replace(/\/$/, '') + '/models', {
  headers,
  signal: AbortSignal.timeout(15000),
});
const body = await listing.json();
const ids = Array.isArray(body.data)
  ? body.data
      .map((x) => x.id)
      .filter((x) => typeof x === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(x))
  : [];
const selected = selectAccountChatModel(ids, process.env.GPT_MODEL_NAME);
const report = {
  scope: 'single streaming protocol smoke, not research comparison',
  model_list_http_status: listing.status,
  available_model_ids: ids,
  old_requested_model: process.env.GPT_MODEL_NAME ?? null,
  requested_model: selected ?? null,
  response_model: null,
  base_url_unchanged: true,
  http_status: null,
  first_token_ms: null,
  total_response_ms: null,
  timing_method:
    'First nonempty SSE delta.content observed after starting fetch; total through stream completion',
  first_token_definition: 'first visible text chunk, not exact provider tokenizer token',
  status: 'not_run',
  output: '',
  error_code: null,
  secret_values_logged: false,
};
if (listing.status !== 200 || !selected) {
  report.error_code = 'NO_ACCESSIBLE_CHAT_MODEL';
  process.exitCode = 2;
} else {
  const start = performance.now();
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selected,
        messages: [{ role: 'user', content: '请用一句简短中文问候。' }],
        temperature: 0.2,
        max_tokens: 32,
        stream: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    report.http_status = r.status;
    if (!r.ok) {
      const e = await r.json();
      report.error_code =
        typeof e.error?.code === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(e.error.code)
          ? e.error.code
          : 'HTTP_ERROR';
      report.status = 'failed';
    } else if (!r.headers.get('content-type')?.includes('text/event-stream')) {
      report.status = 'failed';
      report.error_code = 'STREAM_FORMAT_NOT_SSE';
      await r.arrayBuffer();
    } else {
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let pos;
        while ((pos = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, pos).trim();
          buffer = buffer.slice(pos + 1);
          if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') continue;
          const data = JSON.parse(line.slice(5));
          if (typeof data.model === 'string') report.response_model = data.model.slice(0, 128);
          const text = data.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text.length) {
            report.first_token_ms ??= performance.now() - start;
            report.output += text;
          }
        }
      }
      report.status = report.output ? 'passed' : 'failed';
      if (!report.output) report.error_code = 'EMPTY_STREAM';
    }
  } catch {
    report.status = 'failed';
    report.error_code = 'NETWORK_OR_STREAM_OR_TIMEOUT';
  }
  report.total_response_ms = performance.now() - start;
  if (report.status !== 'passed') process.exitCode = 1;
}
await writeFile(resolve(dir, 'smoke.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
