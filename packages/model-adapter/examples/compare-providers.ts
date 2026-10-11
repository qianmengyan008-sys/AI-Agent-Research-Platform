import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createConfiguredGenerator, MockAdapter, modelSettings } from '../src/index.js';
import {
  runProviderComparison,
  comparisonCases,
  comparisonSuiteHash,
  comparisonMarkdown,
} from './provider-comparison.js';
const [prefix, flag, ...extra] = process.argv.slice(2);
let report: Record<string, unknown> & {
  mode: string;
  status: string;
  summary: Record<string, unknown>[];
};
try {
  if (!prefix || extra.length || (flag && flag !== '--fixture'))
    throw new Error('Invalid arguments');
  const required = ['GPT_API_KEY', 'GPT_MODEL_NAME', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL_NAME'];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (!flag && missing.length) {
    report = {
      mode: 'real-provider',
      status: 'not_run',
      synthetic: true,
      missing_variables: missing,
      suite_sha256: comparisonSuiteHash,
      cases_per_provider: comparisonCases.length,
      external_model_calls: 0,
      summary: ['gpt', 'deepseek'].map((provider_label) => ({
        provider_label,
        status: 'not_run',
        latency_ms: null,
        process_error_rate: null,
        state_violations: null,
        human_language_quality_average: null,
        human_scored_cases: 0,
      })),
      rows: [],
      semantic_review: 'not_run',
      pilot_ready: false,
      formal_ready: false,
    };
    process.exitCode = 2;
  } else {
    const models = (['gpt', 'deepseek'] as const).map((label) => {
      if (flag)
        return {
          label,
          settings: modelSettings({ MODEL_PROVIDER: 'mock' }),
          generator: new MockAdapter(async (prompt) => {
            const belief = prompt.messages[1]?.content.match(/唯一确认观点：(.*)/u)?.[1];
            return belief
              ? label === 'gpt'
                ? `你提到“${JSON.parse(belief)}”。哪些经历与你的看法有关？`
                : `听到你说“${JSON.parse(belief)}”，你觉得哪些因素与此有关？`
              : '在图书馆整理图书的这段经历里，你愿意多聊一点吗？';
          }),
        };
      // Do not fall back to a shared key/endpoint in a two-provider comparison.
      return {
        label,
        ...createConfiguredGenerator({
          ...process.env,
          MODEL_PROVIDER: label,
          MODEL_API_KEY: undefined,
          MODEL_NAME: undefined,
          MODEL_API_BASE_URL: undefined,
        }),
      };
    });
    report = await runProviderComparison(models, flag ? 'local-fixture' : 'real-provider');
    if (
      report.summary.some(
        (s) => Number(s.generation_failures) > 0 || Number(s.state_violations) > 0,
      )
    )
      process.exitCode = 1;
  }
} catch {
  report = {
    mode: flag ? 'local-fixture' : 'real-provider',
    status: 'failed',
    reason: 'configuration_or_runtime_error',
    external_model_calls: null,
    summary: [],
    rows: [],
    semantic_review: 'not_run',
    pilot_ready: false,
    formal_ready: false,
  };
  process.exitCode = 1;
}
if (prefix) {
  await mkdir(dirname(prefix), { recursive: true });
  await writeFile(prefix + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await writeFile(prefix + '.md', comparisonMarkdown(report), { flag: 'wx' });
}
console.info(JSON.stringify({ status: report.status, mode: report.mode, pilot_ready: false }));
