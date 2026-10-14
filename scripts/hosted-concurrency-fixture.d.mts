export interface HostedConcurrencyReport {
  status: 'passed' | 'failed';
  external_provider_calls: number;
  unique_chat_turns: number;
  checks: Record<string, boolean>;
  metrics: {
    http429: number;
    http5xx: number;
    client_timeouts: number;
    database_errors: number;
    success_rate: number;
    max_pool_connections: number;
    max_parallel_fixture_generations: number;
    retry_count: number;
    fallback_count: number;
  };
}
export function runHostedConcurrency(count: number): Promise<HostedConcurrencyReport>;
