/** Adapter diagnostics only: held-stage 25-turn histories, never experiment progression. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConfiguredGenerator, modelSettings, MockAdapter } from '@research/model-adapter';
import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import { buildPrompt, createContext, orchestrate } from '@research/ai-orchestrator';
import { stateAt } from '../packages/model-adapter/examples/experiment-run.ts';
import { processViolationCodes } from '../packages/model-adapter/examples/provider-comparison.ts';
import { mentorConfig, mentorPolicy } from '../apps/api/src/services/research-profile.ts';
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const inputs = [
  '我好像明白一点了，但还说不清。',
  'emm，不完全是这个意思。',
  '刚才那个“他”是指谁？',
  '能用简单一点的中文说吗？',
  '我不想马上下结论，想再了解具体背景。',
];
const scores = () => ({
  clarity: null,
  logic: null,
  reference: null,
  non_repetition: null,
  experiment_fidelity: null,
  nonstandard_understanding: null,
});
export async function runLongComparison(models, mode) {
  if (!['real-provider', 'local-fixture'].includes(mode)) throw Error('INVALID_COMPARISON_MODE');
  if (
    models.length !== 2 ||
    new Set(models.map((m) => m.label)).size !== 2 ||
    models.some((m) => !['gpt', 'deepseek'].includes(m.label))
  )
    throw Error('TWO_PROVIDERS_REQUIRED');
  const shared = (s) => [s.temperature, s.max_tokens, s.timeout_ms, s.max_attempts];
  if (hash(shared(models[0].settings)) !== hash(shared(models[1].settings)))
    throw Error('PARAMETERS_MUST_MATCH');
  if (
    mode === 'real-provider' &&
    models.some(
      (m) => m.settings.provider !== (m.label === 'gpt' ? 'openai-compatible' : 'deepseek'),
    )
  )
    throw Error('REAL_PROVIDER_REQUIRED');
  const rows = [],
    attempts = { gpt: 0, deepseek: 0 };
  for (const [definition, stage] of [
    [cognitiveV1, 'REFRAME_MEDIA_ALGORITHM'],
    [emotionV1, 'RELATIONSHIP'],
  ]) {
    const states = new Map(
      models.map((m) => [
        m.label,
        stateAt(definition, stage, '我看到一些报道后觉得美国黑人犯罪率高，但还需要核实。'),
      ]),
    );
    const histories = new Map(models.map((m) => [m.label, []]));
    for (let round = 1; round <= 25; round++) {
      for (const model of round % 2 ? models : [...models].reverse()) {
        const state = states.get(model.label),
          history = histories.get(model.label),
          input = inputs[(round - 1) % inputs.length];
        const base = {
          state,
          definition,
          policy: mentorPolicy(definition, stage, mentorConfig),
          userInput: input,
        };
        const request = { ...base, recentMessages: history };
        const context = createContext(request),
          prompt = buildPrompt(context),
          before = hash(state),
          candidates = [];
        const generator = {
          generate: async (...args) => {
            attempts[model.label]++;
            try {
              const value = await model.generator.generate(...args);
              candidates.push({
                attempt: candidates.length + 1,
                status: typeof value === 'string' ? 'returned' : 'non_text',
                text: typeof value === 'string' ? value : null,
              });
              return value;
            } catch (error) {
              candidates.push({ attempt: candidates.length + 1, status: 'failed', text: null });
              throw error;
            }
          },
        };
        const start = performance.now();
        const result = await orchestrate(request, generator, {
          timeoutMs: model.settings.timeout_ms,
          maxAttempts: model.settings.max_attempts,
        });
        const elapsed = performance.now() - start;
        rows.push({
          provider_label: model.label,
          path: definition.path,
          round,
          stage,
          input,
          base_prompt_sha256: hash(buildPrompt(createContext(base)).messages),
          actual_prompt_sha256: hash(prompt.messages),
          stored_history_messages: history.length,
          projected_history_messages: context.recentMessages?.length ?? null,
          output: result.text,
          status: result.status,
          violations: result.violations,
          state_before_sha256: before,
          state_after_sha256: hash(state),
          state_violation: before !== hash(state),
          process_error: result.violations.some((v) => processViolationCodes.includes(v)),
          generation_failure: result.violations.some((v) =>
            ['GENERATOR_FAILURE', 'GENERATOR_TIMEOUT', 'GENERATOR_ABORTED'].includes(v),
          ),
          response_latency_ms: elapsed,
          candidate_outputs: candidates,
          human_quality_scores: scores(),
          human_passed: null,
          reviewer: null,
          reviewed_at: null,
        });
        history.push({ role: 'user', stage, content: input });
        if (result.text) history.push({ role: 'assistant', stage, content: result.text });
      }
    }
  }
  for (const row of rows) {
    const pair = rows.find(
      (x) =>
        x.path === row.path && x.round === row.round && x.provider_label !== row.provider_label,
    );
    if (row.base_prompt_sha256 !== pair.base_prompt_sha256) throw Error('BASE_PROMPT_MISMATCH');
  }
  const summary = models.map((model) => {
    const own = rows.filter((r) => r.provider_label === model.label),
      latencies = own.map((r) => r.response_latency_ms).sort((a, b) => a - b);
    return {
      provider_label: model.label,
      settings: model.settings,
      turns: own.length,
      adapter_attempts: attempts[model.label],
      external_model_calls: mode === 'real-provider' ? attempts[model.label] : 0,
      latency_ms: {
        p50: latencies[Math.ceil(latencies.length * 0.5) - 1],
        p95: latencies[Math.ceil(latencies.length * 0.95) - 1],
        max: latencies.at(-1),
      },
      process_errors: own.filter((r) => r.process_error).length,
      process_error_rate: own.filter((r) => r.process_error).length / own.length,
      state_violations: own.filter((r) => r.state_violation).length,
      generation_failures: own.filter((r) => r.generation_failure).length,
      fallback_count: own.filter((r) => r.status === 'fallback').length,
      retry_count: own.reduce((n, r) => n + Math.max(0, r.candidate_outputs.length - 1), 0),
      failed_attempts: own.reduce(
        (n, r) => n + r.candidate_outputs.filter((c) => c.status === 'failed').length,
        0,
      ),
      human_language_quality_average: null,
      human_scored_cases: 0,
    };
  });
  return {
    mode,
    status: summary.some((s) => s.generation_failures || s.state_violations)
      ? 'completed_with_errors'
      : 'completed',
    synthetic: true,
    scope:
      '25 turns per path at a fixed backend stage; adapter/orchestrator diagnostic, not full experiment or database acceptance',
    frozen_policy_version: mentorConfig.version,
    paired_base_prompts_equal: true,
    full_prompts_identical: rows.every(
      (row) =>
        row.actual_prompt_sha256 ===
        rows.find(
          (other) =>
            other.path === row.path &&
            other.round === row.round &&
            other.provider_label !== row.provider_label,
        ).actual_prompt_sha256,
    ),
    history_comparison:
      'Each model uses its own prior presented outputs. Base policy/state/input match; full prompts may diverge after the first reply. No competitor reply is fed to the other model.',
    suite_sha256: hash({
      inputs,
      paths: ['cognitive:REFRAME_MEDIA_ALGORITHM', 'emotional:RELATIONSHIP'],
      turns: 25,
      config: mentorConfig,
    }),
    state_transitions: [],
    state_transition_scope:
      'No transitions by design; does not measure legal submissions, stage guards or full-path completion.',
    process_error_definition:
      'Existing Validator process-violation proxy across attempts, not a human semantic error rate',
    semantic_review: 'pending_researcher_review',
    pilot_ready: false,
    formal_ready: false,
    summary,
    rows,
  };
}
async function main() {
  const [dir, flag, ...extra] = process.argv.slice(2);
  if (!dir || extra.length || (flag && flag !== '--fixture'))
    throw Error('OUTPUT_DIRECTORY_AND_OPTIONAL_FIXTURE_REQUIRED');
  await mkdir(resolve(dir));
  const fixture = flag === '--fixture',
    missing = ['GPT_API_KEY', 'GPT_MODEL_NAME', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL_NAME'].filter(
      (k) => !process.env[k]?.trim(),
    );
  let report;
  if (!fixture && missing.length) {
    report = {
      mode: 'real-provider',
      status: 'not_run',
      missing_variables: missing,
      external_model_calls: 0,
      summary: [],
      rows: [],
      semantic_review: 'not_run',
      pilot_ready: false,
      formal_ready: false,
    };
    process.exitCode = 2;
  } else {
    const models = ['gpt', 'deepseek'].map((label) =>
      fixture
        ? {
            label,
            settings: modelSettings({ MODEL_PROVIDER: 'mock' }),
            generator: new MockAdapter(async (prompt) => {
              const belief = prompt.messages
                .map((m) => m.content)
                .join('\n')
                .match(/唯一确认观点：(.*)/u)?.[1];
              return (
                (belief
                  ? `对于“${JSON.parse(belief)}”，我们可以继续核实信息。`
                  : 'Marcus和李阳在操场聊起各自的感受。') +
                `当前表达${hash(prompt.messages).slice(0, 8)}：你想进一步说明哪一点？`
              );
            }),
          }
        : {
            label,
            ...createConfiguredGenerator({
              ...process.env,
              MODEL_PROVIDER: label,
              MODEL_API_KEY: undefined,
              MODEL_NAME: undefined,
              MODEL_API_BASE_URL: undefined,
            }),
          },
    );
    report = await runLongComparison(models, fixture ? 'local-fixture' : 'real-provider');
    if (report.status === 'completed_with_errors') process.exitCode = 1;
  }
  await writeFile(resolve(dir, 'comparison.json'), JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      mode: report.mode,
      status: report.status,
      external_model_calls: fixture
        ? 0
        : report.summary.reduce((n, s) => n + s.external_model_calls, 0),
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
