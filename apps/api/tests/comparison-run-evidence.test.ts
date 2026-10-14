import { expect, test } from 'vitest';
import {
  normalizeStoppedComparison,
  selectAccountChatModel,
} from '../../../scripts/comparison-run-evidence.mjs';
const report = {
  status: 'completed_with_errors',
  rows: Array.from({ length: 64 }, () => ({ output: 'controller fallback' })),
  summary: [
    { provider_label: 'gpt', adapter_attempts: 32, external_model_calls: 32 },
    { provider_label: 'deepseek', adapter_attempts: 32, external_model_calls: 32 },
  ],
};
test('one forbidden request cannot be counted as 64 paid cases or provider-quality failures', () => {
  const r = normalizeStoppedComparison(report, [{ provider_label: 'gpt' }], { http_status: 403 });
  expect(r.status).toBe('stopped_configuration_error');
  expect(r.rows).toEqual([]);
  expect(r.summary.map((s) => s.external_model_calls)).toEqual([1, 0]);
  expect(
    r.summary.every(
      (s) =>
        'process_error_rate' in s &&
        s.process_error_rate === null &&
        'latency_ms' in s &&
        s.latency_ms === null,
    ),
  ).toBe(true);
  expect(report.rows).toHaveLength(64);
});
test('successful transport runs retain actual comparison rows', () => {
  expect(normalizeStoppedComparison(report, [], null)).toBe(report);
});

test('model discovery replaces unavailable configured ids and refuses listed embeddings', () => {
  const ids = ['gpt-4', 'text-embedding-ada-002'];
  expect(selectAccountChatModel(ids, 'gpt-4.1')).toBe('gpt-4');
  expect(selectAccountChatModel(ids, 'text-embedding-ada-002')).toBe('gpt-4');
  expect(selectAccountChatModel(['text-embedding-ada-002'], undefined)).toBeUndefined();
});
test('an actually listed chat model remains selected without changing to another listed model', () => {
  expect(selectAccountChatModel(['gpt-4', 'gpt-4o'], 'gpt-4o')).toBe('gpt-4o');
});
