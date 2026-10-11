import { createHash } from 'node:crypto';
import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import { buildPrompt, createContext, demoPolicy } from '@research/ai-orchestrator';
import type { LanguageGenerator } from '@research/ai-orchestrator';
import type { ModelSettings } from '../src/index.js';
import { stateAt, confirmedBelief } from './experiment-run.js';
import { experimentCases } from './experiment-cases.js';
import { diagnosticCall } from './generation-diagnostics.js';
export const comparisonCases = [
  ...[cognitiveV1, emotionV1].flatMap((definition) =>
    definition.stages.slice(1, -1).map((stage) => ({
      id: `${definition.path}-${stage.id}`,
      path: definition.path as 'cognitive' | 'emotional',
      stage: stage.id,
      input:
        definition.path === 'cognitive'
          ? '请围绕我明确表达的看法回应，不替我回答或推进。'
          : '请回应我当前的感受，保持当前故事。',
      belief: confirmedBelief,
    })),
  ),
  ...experimentCases.map((c) => ({ ...c, belief: 'belief' in c ? c.belief : confirmedBelief })),
];
comparisonCases.forEach(Object.freeze);
Object.freeze(comparisonCases);
export const comparisonSuiteHash = createHash('sha256')
  .update(JSON.stringify(comparisonCases))
  .digest('hex');
export const processViolationCodes = [
  'STAGE_JUMP',
  'CURRENT_STAGE_RESTRICTION',
  'CONTROL_INSTRUCTION',
  'BACKEND_DISCLOSURE',
  'WRONG_SCENE',
];
export interface ComparisonModel {
  label: 'gpt' | 'deepseek';
  settings: ModelSettings;
  generator: LanguageGenerator;
}
interface ComparisonRow {
  provider_label: 'gpt' | 'deepseek';
  case_id: string;
  path: string;
  stage: string;
  input: string;
  initial_prompt_sha256: string;
  output: string | null;
  status: string;
  violations: readonly string[];
  process_error: boolean;
  state_violation: boolean;
  generation_failure: boolean;
  metrics: Awaited<ReturnType<typeof diagnosticCall>>['metrics'];
  human_quality_scores: Record<string, null>;
  human_passed: null;
  reviewer: null;
  reviewed_at: null;
  problem_types: string[];
  fix_proposal: null;
  candidate_outputs: {
    attempt: number;
    text: string | null;
    status: 'returned' | 'non_text' | 'failed';
  }[];
}
export async function runProviderComparison(
  models: readonly ComparisonModel[],
  mode: 'real-provider' | 'local-fixture',
) {
  if (models.length !== 2 || new Set(models.map((m) => m.label)).size !== 2)
    throw new Error('Both comparison providers are required');
  const shared = (s: ModelSettings) =>
    JSON.stringify([s.temperature, s.max_tokens, s.timeout_ms, s.max_attempts]);
  if (shared(models[0]!.settings) !== shared(models[1]!.settings))
    throw new Error('Comparison parameters must match');
  if (
    mode === 'real-provider' &&
    models.some(
      (m) => m.settings.provider !== (m.label === 'gpt' ? 'openai-compatible' : 'deepseek'),
    )
  )
    throw new Error('Real comparison cannot use mock settings');
  const rows: ComparisonRow[] = [];
  const attempts = { gpt: 0, deepseek: 0 };
  for (const [caseIndex, scenario] of comparisonCases.entries()) {
    // Alternating AB/BA order reduces a fixed order bias; one independent snapshot per provider.
    const order = caseIndex % 2 ? [...models].reverse() : models;
    for (const model of order) {
      const definition = scenario.path === 'cognitive' ? cognitiveV1 : emotionV1;
      const state = stateAt(definition, scenario.stage, scenario.belief);
      const request = {
        state,
        definition,
        policy: demoPolicy(definition, state.stage),
        userInput: scenario.input,
      };
      const initialPrompt = buildPrompt(createContext(request));
      const hash = createHash('sha256')
        .update(JSON.stringify(initialPrompt.messages))
        .digest('hex');
      const candidates: ComparisonRow['candidate_outputs'] = [];
      let caseAttempt = 0;
      const call = await diagnosticCall(
        request,
        {
          generate: async (...args) => {
            attempts[model.label]++;
            const attempt = ++caseAttempt;
            try {
              const candidate = await model.generator.generate(...args);
              candidates.push({
                attempt,
                text: typeof candidate === 'string' ? candidate : null,
                status: typeof candidate === 'string' ? 'returned' : 'non_text',
              });
              return candidate;
            } catch (error) {
              candidates.push({ attempt, text: null, status: 'failed' });
              throw error;
            }
          },
        },
        model.settings,
        scenario.id,
      );
      rows.push({
        provider_label: model.label,
        case_id: scenario.id,
        path: scenario.path,
        stage: scenario.stage,
        input: scenario.input,
        initial_prompt_sha256: hash,
        output: call.result.text,
        candidate_outputs: [...candidates],
        status: call.result.status,
        violations: call.result.violations,
        process_error: call.result.violations.some((v) => processViolationCodes.includes(v)),
        state_violation: !call.stateUnchanged,
        generation_failure: call.result.violations.some((v) =>
          ['GENERATOR_FAILURE', 'GENERATOR_TIMEOUT', 'GENERATOR_ABORTED'].includes(v),
        ),
        metrics: call.metrics,
        human_quality_scores: {
          clarity: null,
          logic: null,
          reference: null,
          non_repetition: null,
          experiment_fidelity: null,
        },
        human_passed: null,
        reviewer: null,
        reviewed_at: null,
        problem_types: [],
        fix_proposal: null,
      });
    }
  }
  const summary = models.map((model) => {
    const own = rows.filter((r) => r.provider_label === model.label);
    const latencies = own.map((r) => r.metrics.response_latency).sort((a, b) => a - b);
    return {
      provider_label: model.label,
      settings: model.settings,
      cases: own.length,
      adapter_attempts: attempts[model.label],
      external_model_calls: mode === 'real-provider' ? attempts[model.label] : 0,
      latency_ms: {
        p50: latencies[Math.ceil(latencies.length * 0.5) - 1]!,
        p95: latencies[Math.ceil(latencies.length * 0.95) - 1]!,
        max: latencies.at(-1)!,
      },
      process_errors: own.filter((r) => r.process_error).length,
      process_error_rate: own.filter((r) => r.process_error).length / own.length,
      state_violations: own.filter((r) => r.state_violation).length,
      generation_failures: own.filter((r) => r.generation_failure).length,
      fallback_count: own.filter((r) => r.status === 'fallback').length,
      human_language_quality_average: null,
      human_scored_cases: 0,
    };
  });
  if (
    comparisonCases.some(
      (c) =>
        new Set(rows.filter((r) => r.case_id === c.id).map((r) => r.initial_prompt_sha256)).size !==
        1,
    )
  )
    throw new Error('Initial prompts differ between providers');
  return {
    mode,
    status: summary.some((s) => s.generation_failures > 0 || s.state_violations > 0)
      ? 'completed_with_errors'
      : 'completed',
    synthetic: true,
    suite_sha256: comparisonSuiteHash,
    cases_per_provider: comparisonCases.length,
    total_cases: rows.length,
    paired_initial_prompts_equal: true,
    order: 'alternating AB/BA',
    scope:
      'current-stage adapter/orchestrator comparison; not database or formal experiment acceptance',
    process_error_definition:
      'fraction of cases with any existing Validator process violation across attempts; guard proxy, not human semantic error rate',
    state_violation_definition:
      'any change to the exact backend snapshot, including variables, during generation',
    latency_definition:
      'whole orchestration elapsed milliseconds, including retries, validation and fallback',
    semantic_review: 'pending_researcher_review',
    pilot_ready: false,
    formal_ready: false,
    summary,
    rows,
  };
}
export function comparisonMarkdown(report: {
  mode: string;
  status: string;
  summary: readonly Record<string, unknown>[];
}) {
  const cell = (v: unknown) =>
    String(v ?? '未测量')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/[\\|[\]!*_`]/g, '\\$&')
      .replace(/\r?\n/g, '<br>');
  const lines = [
    '# GPT / DeepSeek 配对对比报告',
    '',
    `范围：${cell(report.mode)}；状态：${cell(report.status)}。`,
    '',
    '| 模型 | 延迟 p50/p95/max（ms） | 流程错误率（Guard 代理指标） | 状态违规次数 | 人工语言质量评分 |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const s of report.summary)
    lines.push(
      '| ' +
        [
          s.provider_label,
          JSON.stringify(s.latency_ms ?? null),
          s.process_error_rate,
          s.state_violations,
          s.human_language_quality_average,
        ]
          .map(cell)
          .join(' | ') +
        ' |',
    );
  lines.push(
    '',
    '人工评分尚未执行；未配置／未执行项保持空值。模拟数据不能用于选择供应商，工程指标不等于心理实验语义有效性。',
    '',
  );
  return lines.join('\n');
}
