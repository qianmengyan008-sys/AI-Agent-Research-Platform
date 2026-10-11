import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createConfiguredGenerator } from '@research/model-adapter';
import { loadMigrations, migrate } from '../../../packages/database/src/migrations.js';
import { runBusinessAcceptance } from '../src/acceptance/business-acceptance.js';
const output = process.argv[2];
const missing = ['MODEL_API_KEY', 'MODEL_NAME'].filter((k) => !process.env[k]?.trim());
let report: Record<string, unknown>;
if (missing.length) {
  report = {
    mode: 'real-provider',
    status: 'not_run',
    reason: 'missing_configuration',
    missing_variables: missing,
    adapter_attempts: 0,
    external_model_calls: 0,
    database_started: false,
    model_run_log: [],
    latency: null,
    retry_count: null,
    validator_result: null,
    fallback_count: null,
    synthetic: true,
    formal_ready: false,
  };
  process.exitCode = 2;
} else {
  const container = `research-live-${randomUUID()}`;
  let started = false,
    pool: pg.Pool | undefined;
  try {
    const { generator, settings } = createConfiguredGenerator({
      ...process.env,
      MODEL_PROVIDER:
        !process.env.MODEL_PROVIDER || process.env.MODEL_PROVIDER === 'mock'
          ? 'openai-compatible'
          : process.env.MODEL_PROVIDER,
    });
    const threshold = Number(process.env.MODEL_ACCEPTANCE_MAX_LATENCY_MS ?? '10000');
    if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Invalid threshold');
    const image =
      'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-d',
        '--name',
        container,
        '--tmpfs',
        '/var/lib/postgresql/data',
        '-p',
        '127.0.0.1::5432',
        '-e',
        'POSTGRES_PASSWORD=SYNTHETIC_LIVE_DATABASE_ONLY',
        image,
      ],
      { stdio: 'pipe', timeout: 60000 },
    );
    started = true;
    const port = Number(
      execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
        .trim()
        .split(':')
        .at(-1),
    );
    pool = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'SYNTHETIC_LIVE_DATABASE_ONLY',
      database: 'postgres',
      connectionTimeoutMillis: 1000,
    });
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try {
        await pool.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    if (!ready) throw new Error('Database unavailable');
    const client = await pool.connect();
    try {
      await migrate(
        client,
        await loadMigrations(
          fileURLToPath(new URL('../../../database/migrations/', import.meta.url)),
        ),
      );
    } finally {
      client.release();
    }
    report = {
      ...(await runBusinessAcceptance(pool, generator, settings, 'real-provider', threshold)),
      database: 'isolated disposable PostgreSQL 17.7; external DATABASE_URL ignored',
    };
    if (['provider_or_flow_failed', 'latency_threshold_exceeded'].includes(String(report.status)))
      process.exitCode = 1;
  } catch {
    report = {
      mode: 'real-provider',
      status: 'failed',
      reason: 'configuration_or_environment_or_flow_failed',
      synthetic: true,
      formal_ready: false,
    };
    process.exitCode = 1;
  } finally {
    await pool?.end();
    if (started) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe', timeout: 10000 });
  }
}
if (output) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.info(
  JSON.stringify({
    status: report.status,
    mode: report.mode,
    external_model_calls: report.external_model_calls ?? null,
    formal_ready: false,
  }),
);
