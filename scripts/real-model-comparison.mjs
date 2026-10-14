/** Explicit paid diagnostic runner. Never invoked by install/start/check. */
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createConfiguredGenerator } from '@research/model-adapter';
import { GenerationFailureError } from '@research/ai-orchestrator';
import {
  runProviderComparison,
  comparisonMarkdown,
} from '../packages/model-adapter/examples/provider-comparison.ts';
import { runLongComparison } from './model-long-dialogue-comparison.mjs';
import { normalizeStoppedComparison } from './comparison-run-evidence.mjs';
const [output, ...extra] = process.argv.slice(2);
if (!output || extra.length) throw Error('ONE_NEW_OUTPUT_DIRECTORY_REQUIRED');
const required = ['GPT_API_KEY', 'GPT_MODEL_NAME', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL_NAME'];
if (required.some((k) => !process.env[k]?.trim()))
  throw Error('BOTH_PROVIDER_KEYS_AND_MODEL_NAMES_REQUIRED');
const dir = resolve(output);
await mkdir(dir);
let phase = 'paired',
  fatal = null;
const attempts = [];
const models = ['gpt', 'deepseek'].map((label) => {
  const env = {
    ...process.env,
    MODEL_PROVIDER: label,
    MODEL_API_KEY: undefined,
    MODEL_NAME: undefined,
    MODEL_API_BASE_URL: undefined,
    MODEL_TEMPERATURE: '0.2',
    MODEL_MAX_TOKENS: '512',
    MODEL_TIMEOUT_MS: '10000',
    MODEL_MAX_ATTEMPTS: '2',
  };
  const transport = async (...args) => {
    if (fatal || attempts.length >= 328) throw new GenerationFailureError(false);
    const record = {
      ordinal: attempts.length + 1,
      phase,
      provider_label: label,
      requested_model: env[label === 'gpt' ? 'GPT_MODEL_NAME' : 'DEEPSEEK_MODEL_NAME'],
      response_model: null,
      http_status: null,
      transport_elapsed_ms: null,
      usage: null,
      network_failed: false,
    };
    attempts.push(record);
    const start = performance.now();
    try {
      const response = await fetch(...args);
      record.http_status = response.status;
      if ([400, 401, 403, 404].includes(response.status))
        fatal = { provider_label: label, http_status: response.status, phase };
      try {
        const body = await response.clone().json();
        if (typeof body.model === 'string') record.response_model = body.model.slice(0, 128);
        record.usage = Object.fromEntries(
          [
            'prompt_tokens',
            'completion_tokens',
            'total_tokens',
            'prompt_cache_hit_tokens',
            'prompt_cache_miss_tokens',
          ]
            .filter((k) => Number.isSafeInteger(body.usage?.[k]) && body.usage[k] >= 0)
            .map((k) => [k, body.usage[k]]),
        );
      } catch {
        /* Metadata absent; adapter retains its own protocol validation. */
      }
      return response;
    } catch (error) {
      record.network_failed = true;
      throw error;
    } finally {
      record.transport_elapsed_ms = performance.now() - start;
      await appendFile(resolve(dir, 'http-attempts.jsonl'), JSON.stringify(record) + '\n');
      if (attempts.length % 8 === 0)
        console.info(JSON.stringify({ phase, http_attempts: attempts.length, fatal_stop: fatal }));
    }
  };
  return { label, ...createConfiguredGenerator(env, transport) };
});
const configuration = {
  date: '2026-10-14',
  mode: 'real-provider',
  models: models.map((m) => ({ label: m.label, ...m.settings })),
  maximum_http_attempts: 328,
  secret_values_recorded: false,
};
await writeFile(resolve(dir, 'configuration.json'), JSON.stringify(configuration, null, 2) + '\n');
const paired = normalizeStoppedComparison(
  await runProviderComparison(models, 'real-provider'),
  attempts.filter((a) => a.phase === 'paired'),
  fatal,
);
await writeFile(resolve(dir, 'paired-real.json'), JSON.stringify(paired, null, 2) + '\n');
await writeFile(resolve(dir, 'paired-real.md'), comparisonMarkdown(paired));
let long;
if (
  !fatal &&
  paired.summary.every((s) => s.generation_failures === 0 && s.state_violations === 0)
) {
  phase = 'long';
  long = normalizeStoppedComparison(
    await runLongComparison(models, 'real-provider'),
    attempts.filter((a) => a.phase === 'long'),
    fatal,
  );
} else {
  long = {
    mode: 'real-provider',
    status: 'not_run',
    reason: 'paired_transport_or_state_failure',
    summary: [],
    rows: [],
    semantic_review: 'not_run',
    pilot_ready: false,
    formal_ready: false,
  };
}
await writeFile(resolve(dir, 'long-real.json'), JSON.stringify(long, null, 2) + '\n');
const evidence = {
  mode: 'real-provider',
  paired_status: paired.status,
  long_status: long.status,
  http_transport_attempts: attempts.length,
  fatal_stop: fatal,
  actual_usage: models.map((m) => {
    const own = attempts.filter((a) => a.provider_label === m.label);
    return {
      provider_label: m.label,
      attempts: own.length,
      http_status_counts: own.reduce((o, a) => {
        const k = String(a.http_status ?? 'no_response');
        o[k] = (o[k] ?? 0) + 1;
        return o;
      }, {}),
      response_models: [...new Set(own.map((a) => a.response_model).filter(Boolean))],
      network_failures: own.filter((a) => a.network_failed).length,
      prompt_tokens: own.reduce((n, a) => n + (a.usage?.prompt_tokens ?? 0), 0),
      completion_tokens: own.reduce((n, a) => n + (a.usage?.completion_tokens ?? 0), 0),
      usage_records: own.filter((a) => a.usage?.total_tokens !== undefined).length,
    };
  }),
  human_review: 'pending',
  external_url: null,
  mentor_test_ready: false,
  formal_ready: false,
};
await writeFile(resolve(dir, 'execution.json'), JSON.stringify(evidence, null, 2) + '\n');
console.info(JSON.stringify(evidence));
if (fatal || paired.status === 'completed_with_errors' || long.status !== 'completed')
  process.exitCode = 1;
