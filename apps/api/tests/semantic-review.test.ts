import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSemanticReview, semanticReviewMarkdown } from '../src/acceptance/semantic-review.js';
// Handcrafted unit data only; never evidence of external provider use.
const example = () => ({
  mode: 'real-provider',
  status: 'completed',
  external_model_calls: 1,
  paths: [
    {
      path: 'cognitive_v1',
      observations: [
        {
          turn_id: 'turn',
          session_id: 'session',
          stage: 'INITIAL_RATING',
          user_message_id: 'user',
          assistant_message_id: 'assistant',
          reply_status: 'ready',
          state_unchanged: true,
          variables_unchanged: true,
          events_unchanged: true,
        },
      ],
      analysis_export: {
        messages: [
          {
            id: 'assistant',
            session_id: 'session',
            sequence: 2,
            role: 'assistant',
            content: '请针对同一个观点评分。',
          },
          { id: 'user', session_id: 'session', sequence: 1, role: 'user', content: '先暂停评分。' },
        ],
        runs: [
          {
            id: 'run',
            turn_id: 'turn',
            session_id: 'session',
            provider: 'unit-test-only',
            model_name: 'unit-test-only',
            temperature: '0.2',
            max_tokens: 512,
            latency_ms: '12.5',
            retry_count: 1,
            fallback_count: 0,
            validator_result: { status: 'generated' },
            status: 'generated',
          },
        ],
        variables: [
          {
            session_id: 'session',
            key: 'confirmed_belief',
            value: '用户明确观点',
            source_transition_id: 'event',
          },
          {
            session_id: 'other-session',
            key: 'confirmed_belief',
            value: '其他用户',
            source_transition_id: 'other',
          },
        ],
      },
      diagnostics: {
        debug_log: [{ turn_id: 'turn', model_run_id: 'run', state_before: 'INITIAL_RATING' }],
      },
    },
  ],
});
describe('offline semantic review extraction', () => {
  it('preserves not_run with zero fabricated rows, outputs or semantic decisions', () => {
    const result = createSemanticReview({
      mode: 'real-provider',
      status: 'not_run',
      external_model_calls: 0,
      database_started: false,
      missing_variables: ['MODEL_API_KEY', 'MODEL_NAME'],
    });
    expect(result).toMatchObject({
      row_count: 0,
      semantic_review: 'not_run',
      pilot_ready: false,
      formal_ready: false,
    });
    expect(semanticReviewMarkdown(result)).toContain('没有可审核的实际回复');
  });
  it('refuses fixture evidence in the default real scope and marks explicit fixture extraction', () => {
    const source = { ...example(), mode: 'local-fixture', external_model_calls: 0 };
    expect(() => createSemanticReview(source)).toThrow('scope');
    expect(createSemanticReview(source, 'local-fixture')).toMatchObject({
      scope: 'local-fixture',
      row_count: 1,
      pilot_ready: false,
    });
  });
  it('joins by explicit IDs despite reordered messages, retains measurements and leaves judgments pending', () => {
    const input = example(),
      before = structuredClone(input),
      result = createSemanticReview(input);
    expect(result.rows[0]).toMatchObject({
      input: '先暂停评分。',
      model_output: '请针对同一个观点评分。',
      model_run_id: 'run',
      passed: null,
      review_status: 'pending_researcher_review',
      fix_proposal: null,
      model: { model_name: 'unit-test-only', retry_count: 1, latency_ms: '12.5' },
      final_research_variables: [
        { key: 'confirmed_belief', value: '用户明确观点', source_transition_id: 'event' },
      ],
    });
    expect(result.problem_type_options).toHaveLength(6);
    expect(input).toEqual(before);
  });
  it('rejects cross-session replies and absent or ambiguous model trace records', () => {
    const cross = example();
    cross.paths[0]!.analysis_export.messages[0]!.session_id = 'other';
    expect(() => createSemanticReview(cross)).toThrow('provenance');
    const missing = example();
    missing.paths[0]!.observations[0]!.turn_id = 'unknown';
    expect(() => createSemanticReview(missing)).toThrow('missing');
    const duplicate = example();
    duplicate.paths[0]!.analysis_export.runs.push(duplicate.paths[0]!.analysis_export.runs[0]!);
    expect(() => createSemanticReview(duplicate)).toThrow('Ambiguous');
  });
  it('does not treat a mock or zero recorded provider calls as a real-provider sample', () => {
    const mock = example();
    mock.paths[0]!.analysis_export.runs[0]!.provider = 'mock';
    expect(() => createSemanticReview(mock)).toThrow('Mock');
    const zero = example();
    zero.external_model_calls = 0;
    expect(() => createSemanticReview(zero)).toThrow('provider call');
  });
  it('retains failed null replies and timeout measurements without inventing successful text', () => {
    const sample = JSON.parse(JSON.stringify(example()));
    sample.status = 'provider_or_flow_failed';
    sample.paths[0].observations[0].reply_status = 'failed';
    sample.paths[0].analysis_export.messages[0].content = null;
    sample.paths[0].analysis_export.runs[0].error_code = 'MODEL_GENERATION_FAILED';
    sample.paths[0].analysis_export.runs[0].validator_result = {
      violations: ['GENERATOR_TIMEOUT'],
    };
    expect(createSemanticReview(sample).rows[0]).toMatchObject({
      model_output: null,
      reply_status: 'failed',
      passed: null,
      model: {
        error_code: 'MODEL_GENERATION_FAILED',
        validator_result: { violations: ['GENERATOR_TIMEOUT'] },
      },
    });
  });
  it('escapes table-breaking text, HTML and image syntax while JSON keeps the exact reply', () => {
    const source = example(),
      text = 'a|b\n<script> ![x](https://example.com/image)';
    source.paths[0]!.analysis_export.messages[0]!.content = text;
    const result = createSemanticReview(source),
      markdown = semanticReviewMarkdown(result);
    expect(result.rows[0]!.model_output).toBe(text);
    expect(markdown).toContain('a\\|b<br>&lt;script&gt;');
    expect(markdown).not.toContain('![x]');
    expect(markdown).not.toContain('<script>');
  });
  it('CLI generates not_run files and refuses to overwrite existing reviewer work', () => {
    const dir = mkdtempSync(join(tmpdir(), 'research-review-'));
    const input = join(dir, 'input.json'),
      prefix = join(dir, 'review');
    const script = fileURLToPath(new URL('../acceptance/semantic-review.ts', import.meta.url));
    writeFileSync(
      input,
      JSON.stringify({
        mode: 'real-provider',
        status: 'not_run',
        external_model_calls: 0,
        database_started: false,
      }),
    );
    try {
      execFileSync(process.execPath, ['--import', 'tsx', script, input, prefix], {
        stdio: 'pipe',
        timeout: 15000,
      });
      expect(existsSync(prefix + '.md')).toBe(true);
      const original = readFileSync(prefix + '.json', 'utf8');
      expect(JSON.parse(original).row_count).toBe(0);
      expect(() =>
        execFileSync(process.execPath, ['--import', 'tsx', script, input, prefix], {
          stdio: 'pipe',
          timeout: 15000,
        }),
      ).toThrow();
      expect(readFileSync(prefix + '.json', 'utf8')).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
