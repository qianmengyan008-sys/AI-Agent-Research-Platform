import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { createHostedPlatform, createHostedDeployment } from '../../../scripts/hosted-platform.mjs';
test('new hosted batches pin models, preserve old-batch routing and persist request-local actual identities without schema change', async () => {
  const name = 'research-dual-' + randomUUID();
  let pool: pg.Pool | undefined,
    created = false;
  const docker = (...args: string[]) =>
    execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    docker(
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD=OFFLINE_DUAL_PG',
      'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2',
    );
    created = true;
    const port = Number(docker('port', name, '5432/tcp').split(':').at(-1));
    pool = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'OFFLINE_DUAL_PG',
      database: 'postgres',
      max: 10,
    });
    for (let i = 0; i < 60; i++) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const env = {
      RESEARCH_DATABASE_SCOPE: 'isolated-staging',
      ADMIN_ACCESS_TOKEN: 'OFFLINE_DUAL_ADMIN_SECRET_32_CHARS',
      RESEARCH_BOOTSTRAP_SECRET: 'OFFLINE_DUAL_BOOTSTRAP_SEED_32_CHARS',
      DEEPSEEK_API_KEY: 'OFFLINE_DS_KEY',
      GPT_API_KEY: 'OFFLINE_GPT_KEY',
      DEEPSEEK_MODEL_NAME: 'deepseek-flash',
      GPT_MODEL_NAME: 'gpt-4',
      DEEPSEEK_API_BASE_URL: 'https://deepseek.fixture/v1',
      GPT_API_BASE_URL: 'https://gpt.fixture/v1',
      MODEL_TEMPERATURE: '0.2',
      MODEL_MAX_TOKENS: '512',
      MODEL_TIMEOUT_MS: '10000',
      MODEL_MAX_ATTEMPTS: '2',
      RESEARCH_BOOTSTRAP_COUNT: '6',
      MODEL_PROVIDER: 'deepseek',
      RESEARCH_BOOTSTRAP_BATCH: 'B001',
    };
    let calls = 0;
    const transport: typeof fetch = async (url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      const marker = (JSON.stringify(body.messages).match(/ID_[A-Z0-9_-]+/) ?? [])[0];
      if (!marker) throw Error('TEST_MARKER_MISSING');
      await new Promise((r) => setTimeout(r, marker.endsWith('1') ? 40 : 5));
      return new Response(
        JSON.stringify({
          model: (String(url).includes('deepseek') ? 'ds-actual-' : 'gpt-actual-') + marker,
          choices: [{ message: { content: `对于当前表达${marker}，你愿意补充印象来源吗？` } }],
        }),
      );
    };
    const deep = await createHostedDeployment({
      env: { ...env, RESEARCH_AB_PREVIEW: 'true', RESEARCH_AB_COUNT: '6' },
      poolOverride: pool,
      modelTransportOverride: transport,
    });
    expect(deep.previewBatches).toHaveLength(1);
    const gpt = await createHostedPlatform({
      env: { ...env, MODEL_PROVIDER: 'gpt', RESEARCH_BOOTSTRAP_BATCH: 'B002' },
      poolOverride: pool,
      modelTransportOverride: transport,
    });
    const accounts = await request(deep.app)
      .get('/api/admin/hosted-accounts')
      .auth(env.ADMIN_ACCESS_TOKEN, { type: 'bearer' })
      .expect(200);
    expect(accounts.body.additional_batches[0].experiment_id).toBe(gpt.seed.experiment_id);
    expect(accounts.body.additional_batches[0].accounts).toHaveLength(6);
    // Both old and new accounts use the NEW deployment app. No participant supplies a model selector.
    const app = gpt.app;
    const selected = [
      ...deep.seed.accounts
        .filter((a) => a.path === 'cognitive_v1')
        .map((a) => ({
          ...a,
          experiment: deep.seed.experiment_id,
          provider: 'deepseek',
          requested: 'deepseek-flash',
          actual: 'ds-actual-',
        })),
      ...gpt.seed.accounts
        .filter((a) => a.path === 'cognitive_v1')
        .map((a) => ({
          ...a,
          experiment: gpt.seed.experiment_id,
          provider: 'openai-compatible',
          requested: 'gpt-4',
          actual: 'gpt-actual-',
        })),
    ];
    await Promise.all(
      selected.map(async (a) => {
        const login = await request(app)
          .post('/api/auth/login')
          .send({
            experiment_id: a.experiment,
            participant_code: a.participant_code,
            password: a.password,
          })
          .expect(200);
        const token = login.body.token;
        const current = await request(app)
          .get('/api/experiment/current')
          .auth(token, { type: 'bearer' })
          .expect(200);
        await request(app)
          .post('/api/conversation/message')
          .auth(token, { type: 'bearer' })
          .send({
            state_token: current.body.state_token,
            request_id: 'same-isolated-request',
            text: '我从媒体形成了一个印象，还想核实。 ID_' + a.participant_code,
          })
          .expect(200);
        await request(app)
          .get('/api/admin/hosted-accounts')
          .auth(token, { type: 'bearer' })
          .expect(401);
        const row = (
          await pool!.query(
            'SELECT r.*,t.generation_context FROM research.model_run_log r JOIN research.conversation_turn t ON t.id=r.turn_id WHERE r.experiment_id=$1 AND r.session_id IN (SELECT s.id FROM research.experiment_session s JOIN research.experiment_assignment a ON a.id=s.assignment_id WHERE a.participant_id=$2)',
            [a.experiment, a.participant_id],
          )
        ).rows[0];
        expect(row.provider).toBe(a.provider);
        expect(row.model_name).toBe(a.requested);
        expect(row.prompt_version).toMatch(/^stage-language-v3-/);
        expect(row.validator_result.model_transport_attempts).toEqual([
          {
            attempt: 1,
            provider: a.provider,
            requested_model: a.requested,
            response_model: a.actual + 'ID_' + a.participant_code,
            http_status: 200,
            network_failed: false,
          },
        ]);
        expect(JSON.stringify(current.body)).not.toContain('model_transport_attempts');
      }),
    );
    expect(calls).toBe(4);
    const before = (await pool.query('SELECT count(*)::int AS n FROM research.message')).rows[0].n;
    await expect(
      createHostedPlatform({
        env: { ...env, MODEL_PROVIDER: 'gpt' },
        poolOverride: pool,
        modelTransportOverride: transport,
      }),
    ).rejects.toThrow('PINNED_RESEARCH_CONFIG_MISMATCH');
    expect((await pool.query('SELECT count(*)::int AS n FROM research.message')).rows[0].n).toBe(
      before,
    );
    const exports = [];
    for (const id of [deep.seed.experiment_id, gpt.seed.experiment_id]) {
      const out = await request(app)
        .get('/api/admin/export')
        .query({ experiment_id: id })
        .auth(env.ADMIN_ACCESS_TOKEN, { type: 'bearer' })
        .expect(200);
      expect(out.body.complete).toBe(true);
      const json = JSON.stringify(out.body);
      for (const secret of [
        env.ADMIN_ACCESS_TOKEN,
        env.RESEARCH_BOOTSTRAP_SECRET,
        env.GPT_API_KEY,
        env.DEEPSEEK_API_KEY,
      ])
        expect(json).not.toContain(secret);
      exports.push({
        batch: id === deep.seed.experiment_id ? 'B001' : 'B002',
        complete: out.body.complete,
        model_runs: out.body.runs.length,
      });
    }
    const researchVersions = (
      await pool.query(
        "SELECT DISTINCT configuration->'research_config'->>'version' AS v FROM research.template_version",
      )
    ).rows;
    expect(researchVersions).toEqual([{ v: 'mentor-test-v1' }]);
    if (process.env.ROUND33_ACCEPTANCE_DIR)
      await writeFile(
        process.env.ROUND33_ACCEPTANCE_DIR + '/hosted-dual-model.json',
        JSON.stringify(
          {
            status: 'passed',
            fixture: true,
            external_calls: 0,
            checks: {
              old_batch_keeps_deepseek: true,
              new_batch_uses_gpt: true,
              concurrent_metadata_isolated: true,
              provider_requested_actual_model_in_database: true,
              prompt_research_versions_retained: true,
              same_batch_model_switch_refused: true,
              participant_diagnostics_denied: true,
              complete_export_secret_free: true,
            },
            participant_message_cases: 4,
            exports,
          },
          null,
          2,
        ) + '\n',
      );
  } finally {
    await pool?.end();
    if (created) docker('rm', '-f', name);
  }
}, 90000);
