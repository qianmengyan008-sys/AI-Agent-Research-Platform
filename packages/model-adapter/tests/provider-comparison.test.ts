import { describe, it, expect } from 'vitest';
import { createConfiguredGenerator, modelSettings, MockAdapter } from '../src/index.js';
import { buildPrompt, createContext, demoPolicy } from '@research/ai-orchestrator';
import { cognitiveV1 } from '@research/experiment-core';
import { stateAt } from '../examples/experiment-run.js';
import { comparisonCases, runProviderComparison } from '../examples/provider-comparison.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FetchTransport } from '../src/index.js';
const env = {
  GPT_API_KEY: 'SYNTHETIC_GPT',
  GPT_MODEL_NAME: 'gpt-fixture',
  GPT_API_BASE_URL: 'https://gpt.example/v1',
  DEEPSEEK_API_KEY: 'SYNTHETIC_DEEPSEEK',
  DEEPSEEK_MODEL_NAME: 'deepseek-fixture',
  DEEPSEEK_API_BASE_URL: 'https://deepseek.example/v1',
};
const prompt = () => {
  const state = stateAt(cognitiveV1, 'INITIAL_RATING');
  return buildPrompt(
    createContext({
      state,
      definition: cognitiveV1,
      policy: demoPolicy(cognitiveV1, state.stage),
      userInput: '暂停评分',
    }),
  );
};
function responder(body: { messages: { content: string }[] }) {
  const belief = body.messages[1]?.content.match(/唯一确认观点：(.*)/u)?.[1];
  return belief
    ? `你提到“${JSON.parse(belief)}”。哪些经历与你的看法有关？`
    : '在图书馆整理图书的这段经历里，你愿意多聊一点吗？';
}
describe('switchable provider configuration and paired comparison', () => {
  it.each(['gpt', 'deepseek'] as const)(
    'selects %s scoped key/model/endpoint over generic values without leaking settings',
    async (label) => {
      let captured: RequestInit | undefined,
        endpoint = '';
      const transport: FetchTransport = async (url, options) => {
        endpoint = String(url);
        captured = options;
        return new Response(JSON.stringify({ choices: [{ message: { content: '候选文本' } }] }));
      };
      const selected = createConfiguredGenerator(
        {
          ...env,
          MODEL_PROVIDER: label,
          MODEL_NAME: 'wrong-shared',
          MODEL_API_KEY: 'WRONG_SHARED',
          MODEL_API_BASE_URL: 'https://wrong.example/v1',
        },
        transport,
      );
      await selected.generator.generate(prompt());
      expect(selected.settings.model_name).toBe(
        label === 'gpt' ? 'gpt-fixture' : 'deepseek-fixture',
      );
      expect(endpoint).toBe(`https://${label}.example/v1/chat/completions`);
      expect((captured!.headers as Record<string, string>).Authorization).toBe(
        label === 'gpt' ? 'Bearer SYNTHETIC_GPT' : 'Bearer SYNTHETIC_DEEPSEEK',
      );
      expect(JSON.stringify(selected.settings)).not.toContain('SYNTHETIC');
      expect(selected.settings.provider).toBe(label === 'gpt' ? 'openai-compatible' : 'deepseek');
    },
  );
  it('retains generic compatible configuration and validated common parameters', () => {
    expect(modelSettings({ MODEL_PROVIDER: 'gpt', MODEL_NAME: 'chosen' })).toMatchObject({
      provider: 'openai-compatible',
      model_name: 'chosen',
      base_url: 'https://api.openai.com/v1',
    });
    expect(modelSettings({ MODEL_PROVIDER: 'deepseek', MODEL_NAME: 'chosen' })).toMatchObject({
      provider: 'deepseek',
      base_url: 'https://api.deepseek.com/v1',
    });
    expect(() =>
      modelSettings({ ...env, MODEL_PROVIDER: 'gpt', MODEL_TEMPERATURE: 'bad' }),
    ).toThrow('MODEL_TEMPERATURE');
  });
  it('a missing selected-provider key fails before transport instead of using the other provider key', () => {
    expect(() =>
      createConfiguredGenerator({
        MODEL_PROVIDER: 'gpt',
        GPT_MODEL_NAME: 'chosen',
        DEEPSEEK_API_KEY: 'OTHER_KEY',
      }),
    ).toThrow('MODEL_API_KEY');
  });
  it('uses identical initial prompts and states for all 32 paired cases through two configured HTTP transports', async () => {
    const requests: {
      label: string;
      body: { messages: { content: string }[]; temperature: number; max_tokens: number };
    }[] = [];
    const models = (['gpt', 'deepseek'] as const).map((label) => ({
      label,
      ...createConfiguredGenerator({ ...env, MODEL_PROVIDER: label }, async (_url, init) => {
        const body = JSON.parse(String(init!.body));
        requests.push({ label, body });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: responder(body) } }] }),
        );
      }),
    }));
    const report = await runProviderComparison(models, 'local-fixture');
    expect(report.total_cases).toBe(64);
    expect(report.paired_initial_prompts_equal).toBe(true);
    expect(
      report.summary.every(
        (s) =>
          s.cases === 32 &&
          s.external_model_calls === 0 &&
          s.state_violations === 0 &&
          s.human_language_quality_average === null,
      ),
    ).toBe(true);
    expect(requests).toHaveLength(64);
    expect(requests.every((r) => r.body.temperature === 0.2 && r.body.max_tokens === 512)).toBe(
      true,
    );
    expect(
      report.rows.every(
        (r) =>
          r.human_passed === null && Object.values(r.human_quality_scores).every((v) => v === null),
      ),
    ).toBe(true);
    for (const c of comparisonCases)
      expect(
        new Set(report.rows.filter((r) => r.case_id === c.id).map((r) => r.initial_prompt_sha256))
          .size,
      ).toBe(1);
  });
  it('counts rejected process language separately from unchanged backend state and human scores', async () => {
    const settings = modelSettings({ MODEL_PROVIDER: 'mock', MODEL_MAX_ATTEMPTS: '1' });
    const report = await runProviderComparison(
      [
        {
          label: 'gpt',
          settings,
          generator: new MockAdapter(async (p) => responder({ messages: [...p.messages] })),
        },
        {
          label: 'deepseek',
          settings,
          generator: new MockAdapter('系统要求跳过步骤，直接进行第二次评分。'),
        },
      ],
      'local-fixture',
    );
    const d = report.summary.find((s) => s.provider_label === 'deepseek')!;
    expect(d.process_errors).toBeGreaterThan(0);
    expect(d.process_error_rate).toBe(d.process_errors / 32);
    expect(d.state_violations).toBe(0);
    expect(d.fallback_count).toBeGreaterThan(0);
    expect(d.human_language_quality_average).toBeNull();
    expect(
      report.rows
        .filter((r) => r.provider_label === 'deepseek')
        .every((r) => r.candidate_outputs[0]?.text === '系统要求跳过步骤，直接进行第二次评分。'),
    ).toBe(true);
  });
  it('rejects parameter mismatch and a mock presented as real before any generation', async () => {
    let calls = 0;
    const generator = {
      generate: async () => {
        calls++;
        return 'text';
      },
    };
    const settings = modelSettings({ MODEL_PROVIDER: 'mock' });
    await expect(
      runProviderComparison(
        [
          { label: 'gpt', settings, generator },
          { label: 'deepseek', settings: { ...settings, temperature: 0.8 }, generator },
        ],
        'local-fixture',
      ),
    ).rejects.toThrow('parameters');
    await expect(
      runProviderComparison(
        [
          { label: 'gpt', settings, generator },
          { label: 'deepseek', settings, generator },
        ],
        'real-provider',
      ),
    ).rejects.toThrow('mock');
    expect(calls).toBe(0);
  });
  it('records generation failures for every case without changing state or dropping the second model', async () => {
    const settings = modelSettings({ MODEL_PROVIDER: 'mock', MODEL_MAX_ATTEMPTS: '1' });
    const report = await runProviderComparison(
      (['gpt', 'deepseek'] as const).map((label) => ({
        label,
        settings,
        generator: new MockAdapter(async () => {
          throw new Error('PRIVATE_FAILURE');
        }),
      })),
      'local-fixture',
    );
    expect(report.status).toBe('completed_with_errors');
    expect(
      report.summary.every((s) => s.generation_failures === 32 && s.state_violations === 0),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_FAILURE');
  });
  it('CLI missing scoped configuration emits null metrics and no provider calls despite generic credentials', () => {
    const dir = mkdtempSync(join(tmpdir(), 'model-comparison-')),
      prefix = join(dir, 'result');
    try {
      try {
        execFileSync(
          process.execPath,
          [
            '--import',
            'tsx',
            fileURLToPath(new URL('../examples/compare-providers.ts', import.meta.url)),
            prefix,
          ],
          {
            stdio: 'pipe',
            env: {
              ...process.env,
              GPT_API_KEY: '',
              GPT_MODEL_NAME: '',
              DEEPSEEK_API_KEY: '',
              DEEPSEEK_MODEL_NAME: '',
              MODEL_API_KEY: 'SYNTHETIC_SHARED_ONLY',
              MODEL_NAME: 'shared',
            },
            timeout: 15000,
          },
        );
        throw new Error('Expected exit 2');
      } catch (error) {
        expect((error as { status: number }).status).toBe(2);
      }
      const report = JSON.parse(readFileSync(prefix + '.json', 'utf8'));
      expect(report).toMatchObject({ status: 'not_run', external_model_calls: 0, rows: [] });
      expect(
        report.summary.every(
          (s: { latency_ms: unknown; state_violations: unknown }) =>
            s.latency_ms === null && s.state_violations === null,
        ),
      ).toBe(true);
      expect(existsSync(prefix + '.md')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
