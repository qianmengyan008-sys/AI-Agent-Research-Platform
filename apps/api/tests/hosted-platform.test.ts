import { expect, test } from 'vitest';
import { runHostedConcurrency } from '../../../scripts/hosted-concurrency-fixture.mjs';

test.each([30, 45])(
  'hosted facade handles %s separate users across six concurrent waves, replay and restart',
  async (count) => {
    const report = await runHostedConcurrency(count);
    expect(report.status).toBe('passed');
    expect(report.external_provider_calls).toBe(0);
    expect(report.unique_chat_turns).toBe(count * 6);
    expect(report.metrics.http429).toBe(0);
    expect(report.metrics.http5xx).toBe(0);
    expect(report.metrics.client_timeouts).toBe(0);
    expect(report.metrics.database_errors).toBe(0);
    expect(report.metrics.success_rate).toBe(1);
    expect(report.metrics.max_pool_connections).toBeLessThanOrEqual(10);
    expect(report.metrics.max_parallel_fixture_generations).toBeGreaterThanOrEqual(30);
    expect(report.metrics.retry_count).toBe(2);
    expect(report.metrics.fallback_count).toBe(1);
    expect(report.checks.restart_preserves_all_experiment_records).toBe(true);
    expect(report.checks.user_message_isolation).toBe(true);
    expect(report.checks.variable_isolation).toBe(true);
  },
  90000,
);
