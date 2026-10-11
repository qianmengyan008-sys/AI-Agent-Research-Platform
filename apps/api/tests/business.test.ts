import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MockAdapter, OpenAICompatibleAdapter } from '@research/model-adapter';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demoPolicy } from '@research/ai-orchestrator';
import { experimentDefinitions } from '@research/experiment-core';
import type { LanguageGenerator } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import { loadMigrations, migrate } from '../../../packages/database/src/migrations.js';
import { createApp } from '../src/app.js';
import { createServices } from '../src/services/index.js';
import type { Services } from '../src/services/index.js';
const container = `research-api-${randomUUID()}`;
const image =
  'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
const adminToken = 'SYNTHETIC_ADMIN_TOKEN_FOR_ISOLATED_TESTS';
const password = 'SYNTHETIC_PASSWORD_123';
const settings: ModelSettings = {
  provider: 'mock',
  model_name: 'synthetic-service-model',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 1000,
  max_attempts: 2,
};
let port: number,
  admin: pg.Client,
  pool: pg.Pool,
  database: string,
  started = false;
let services: Services, app: ReturnType<typeof createApp>, calls: number;
let generate: LanguageGenerator['generate'];
const round12Acceptance = process.env.RESEARCH_ACCEPTANCE_DIR ?? process.env.ROUND12_ACCEPTANCE_DIR;
const round13Acceptance = process.env.RESEARCH_ACCEPTANCE_DIR ?? process.env.ROUND13_ACCEPTANCE_DIR;
const actor = { role: 'admin' as const, id: 'synthetic-admin' };
const connection = (db: string) => ({
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password: 'SYNTHETIC_DB_ONLY',
  database: db,
  connectionTimeoutMillis: 1000,
});
beforeAll(async () => {
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
      'POSTGRES_PASSWORD=SYNTHETIC_DB_ONLY',
      image,
    ],
    { stdio: 'pipe', timeout: 60000 },
  );
  started = true;
  port = Number(
    execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .at(-1),
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const c = new pg.Client(connection('postgres'));
    try {
      await c.connect();
      admin = c;
      ready = true;
      break;
    } catch {
      await c.end();
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw new Error('Isolated API PostgreSQL not ready');
}, 60000);
beforeEach(async () => {
  database = `api_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE ${database}`);
  pool = new pg.Pool({ ...connection(database), max: 10 });
  const c = await pool.connect();
  try {
    await migrate(
      c,
      await loadMigrations(
        fileURLToPath(new URL('../../../database/migrations/', import.meta.url)),
      ),
    );
  } finally {
    c.release();
  }
  calls = 0;
  generate = async (prompt) => {
    calls++;
    const belief = prompt.messages
      .map((m) => m.content)
      .join('\n')
      .match(/唯一确认观点：(.*)/u)?.[1];
    return belief
      ? `你提到“${JSON.parse(belief)}”。哪些经历与你的看法有关？（${calls}）`
      : `你愿意多聊聊刚才的感受吗？（${calls}）`;
  };
  services = createServices(
    pool,
    new MockAdapter((prompt, signal) => generate(prompt, { signal })),
    settings,
  );
  app = createApp(services, createHash('sha256').update(adminToken).digest('hex'));
});
afterEach(async () => {
  await pool?.end();
  if (database && admin) {
    for (let i = 0; i < 100; i++) {
      const active = await admin.query(
        'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',
        [database],
      );
      if (active.rows[0].n === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  }
});
afterAll(async () => {
  await admin?.end();
  if (started) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
});
async function setup(path = 'daily_v1', code = 'P001') {
  const e = await services.experiments.create(actor, {
    name: '合成实验',
    instructions: '合成研究说明',
  });
  const c = await services.experiments.condition(actor, e.experimentId, {
    code: 'A',
    path_version: path,
    agent_name: '合成 Agent',
    demo_policies: true,
  });
  await services.experiments.publish(actor, e.experimentId);
  const p = await services.participants.create(actor, {
    experiment_id: e.experimentId,
    participant_code: code,
    password,
  });
  const a = await services.experiments.assign(actor, {
    participant_id: p.participantId,
    condition_id: c.conditionId,
  });
  const auth = await services.participants.login({
    experiment_id: e.experimentId,
    participant_code: code,
    password,
  });
  const identity = await services.participants.authenticate(auth.token);
  const state = await services.participants.current(identity);
  return { ...e, ...c, ...p, ...a, token: auth.token, identity, state };
}
describe('real PostgreSQL business services and HTTP authorization', () => {
  it('creates, publishes, assigns and initializes a participant through the core start event', async () => {
    const s = await setup('cognitive_v1');
    expect(
      (await pool.query('SELECT stage,core_version FROM research.experiment_state')).rows[0],
    ).toEqual({ stage: 'STEREOTYPE_CAPTURE', core_version: 1 });
    expect((await pool.query('SELECT event FROM research.state_transition')).rows[0].event).toBe(
      'EXPERIMENT_STARTED',
    );
    expect(s.state.agent.name).toBe('合成 Agent');
  });
  it('stores hashed passwords and opaque hashed sessions, and rejects bad credentials', async () => {
    const s = await setup();
    const p = (await pool.query('SELECT password_hash FROM research.participant')).rows[0];
    expect(p.password_hash).not.toBe(password);
    expect(
      (await pool.query('SELECT token_hash FROM research.auth_session')).rows[0].token_hash,
    ).not.toBe(s.token);
    await request(app)
      .post('/api/auth/login')
      .send({
        experiment_id: s.experimentId,
        participant_code: 'P001',
        password: 'incorrect_password',
      })
      .expect(401);
  });
  it('exposes login and rejects untrusted participant_id identity', async () => {
    const s = await setup();
    await request(app)
      .post('/api/auth/login')
      .send({ experiment_id: s.experimentId, participant_code: 'P001', password })
      .expect(200);
    await request(app)
      .get('/api/experiment/state')
      .set('Authorization', `Bearer ${s.participantId}`)
      .expect(401);
  });
  it.each([
    '/api/experiment/current',
    '/api/experiment/state',
    '/api/conversation/messages',
    '/api/admin/participants',
    '/api/admin/conversations',
    '/api/admin/export',
  ])('denies unauthenticated %s', async (path) => {
    await request(app).get(path).expect(401);
  });
  it('returns only a participant projection without internal states, variables or diagnostics', async () => {
    const s = await setup('cognitive_v1');
    const result = await request(app)
      .get('/api/experiment/state')
      .set('Authorization', `Bearer ${s.token}`)
      .expect(200);
    expect(Object.keys(result.body)).toEqual(['state_token', 'status', 'form']);
    expect(JSON.stringify(result.body)).not.toMatch(
      /STEREOTYPE_CAPTURE|confirmed_viewpoint|validator|snapshot|stage/,
    );
  });
  it('persists both messages and model logs without advancing a state', async () => {
    const s = await setup();
    const before = (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0]
      .snapshot;
    const r = await request(app)
      .post('/api/conversation/message')
      .set('Authorization', `Bearer ${s.token}`)
      .send({ request_id: 'm1', state_token: s.state.state_token, text: '你好' })
      .expect(200);
    expect(r.body.status).toBe('ready');
    expect(calls).toBe(1);
    expect((await pool.query('SELECT role FROM research.message ORDER BY sequence')).rows).toEqual([
      { role: 'user' },
      { role: 'assistant' },
    ]);
    expect(
      (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0].snapshot,
    ).toEqual(before);
    expect(
      (await pool.query('SELECT provider,token_usage FROM research.model_run_log')).rows[0],
    ).toEqual({ provider: 'mock', token_usage: null });
  });
  it('replays an identical message once and rejects a changed idempotency payload', async () => {
    const s = await setup();
    const input = { request_id: 'm1', state_token: s.state.state_token, text: '你好' };
    const first = await services.conversations.send(s.identity, input);
    expect(await services.conversations.send(s.identity, input)).toEqual(first);
    expect(calls).toBe(1);
    await expect(
      services.conversations.send(s.identity, { ...input, text: 'changed' }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('does not allow participants to read another participant turn or inject another identity', async () => {
    const a = await setup();
    const b = await setup('daily_v1', 'P002');
    const t = await services.conversations.send(b.identity, {
      request_id: 'b1',
      state_token: b.state.state_token,
      text: '私有消息',
    });
    await request(app)
      .get(`/api/conversation/turns/${t!.turn_id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .expect(404);
    const messages = await request(app)
      .get('/api/conversation/messages')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(200);
    expect(messages.body).toEqual([]);
    await request(app)
      .post('/api/conversation/message')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        request_id: 'x',
        state_token: a.state.state_token,
        text: 'hello',
        participant_id: b.participantId,
      })
      .expect(400);
  });
  it('rejects injected state and variable mutations before a model call', async () => {
    const s = await setup();
    await request(app)
      .post('/api/conversation/message')
      .set('Authorization', `Bearer ${s.token}`)
      .send({ request_id: 'm', state_token: s.state.state_token, text: 'hi', stage: 'COMPLETED' })
      .expect(400);
    await request(app)
      .post('/api/experiment/submissions')
      .set('Authorization', `Bearer ${s.token}`)
      .send({
        request_id: 's',
        state_token: s.state.state_token,
        data: {},
        variables: { rating: 9 },
      })
      .expect(400);
    expect(calls).toBe(0);
  });
  it('advances only through explicit validated submissions and atomically saves variables', async () => {
    const s = await setup('cognitive_v1');
    const input = {
      request_id: 's1',
      state_token: s.state.state_token,
      data: { response: '明确提交的表达' },
    };
    const first = await services.participants.submit(s.identity, input);
    expect(await services.participants.submit(s.identity, input)).toEqual(first);
    expect((await pool.query('SELECT stage FROM research.experiment_state')).rows[0].stage).toBe(
      'VIEWPOINT_CONFIRMATION',
    );
    expect(
      (await pool.query('SELECT key,value FROM research.experiment_variable')).rows[0],
    ).toEqual({ key: 'stereotype_text', value: '明确提交的表达' });
    await request(app)
      .post('/api/experiment/submissions')
      .set('Authorization', `Bearer ${s.token}`)
      .send({ ...input, request_id: 's2', data: { viewpoint: 'belief', confirmed: true } })
      .expect(409);
  });
  it('records model failure but preserves the state and user message', async () => {
    const s = await setup();
    generate = async () => {
      throw new Error('PRIVATE_PROVIDER_ERROR');
    };
    const before = (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0]
      .snapshot;
    const r = await services.conversations.send(s.identity, {
      request_id: 'fail',
      state_token: s.state.state_token,
      text: 'hello',
    });
    expect(r!.status).toBe('failed');
    expect(r!.text).toBeNull();
    expect(
      (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0].snapshot,
    ).toEqual(before);
    const log = (await pool.query('SELECT error_code,validator_result FROM research.model_run_log'))
      .rows[0];
    expect(log.error_code).toBe('MODEL_GENERATION_FAILED');
    expect(JSON.stringify(log)).not.toContain('PRIVATE_PROVIDER_ERROR');
  });
  it('reconnects through fresh services with the same login and durable state', async () => {
    const s = await setup();
    const fresh = createServices(pool, { generate: (...a) => generate(...a) }, settings);
    const identity = await fresh.participants.authenticate(s.token);
    expect(await fresh.participants.current(identity)).toEqual(s.state);
  });
  it('denies participant export and returns a safe bounded admin snapshot', async () => {
    const s = await setup();
    await request(app)
      .get(`/api/admin/export?experiment_id=${s.experimentId}`)
      .set('Authorization', `Bearer ${s.token}`)
      .expect(401);
    const r = await request(app)
      .get(`/api/admin/export?experiment_id=${s.experimentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(r.body.complete).toBe(false);
    expect(r.body.assignments).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/password_hash|SYNTHETIC_PASSWORD_123|token_hash/);
  });
  it('implements administrator experiment, condition, participant and assignment endpoints', async () => {
    const e = await request(app)
      .post('/api/admin/experiments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'HTTP experiment', instructions: '说明' })
      .expect(201);
    const c = await request(app)
      .post(`/api/admin/experiments/${e.body.experimentId}/conditions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'A', path_version: 'daily_v1', agent_name: 'Agent', demo_policies: true })
      .expect(201);
    await request(app)
      .post(`/api/admin/experiments/${e.body.experimentId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const p = await request(app)
      .post('/api/admin/participants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ experiment_id: e.body.experimentId, participant_code: 'X', password })
      .expect(201);
    await request(app)
      .post('/api/admin/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ participant_id: p.body.participantId, condition_id: c.body.conditionId })
      .expect(201);
    await request(app)
      .get(`/api/admin/participants?experiment_id=${e.body.experimentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .get(`/api/admin/conversations?experiment_id=${e.body.experimentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .patch('/api/admin/participants/X/state')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage: 'COMPLETED' })
      .expect(404);
  });
  it('freezes published conditions and rejects a missing path or unapproved policy selection', async () => {
    const s = await setup();
    await expect(
      services.experiments.condition(actor, s.experimentId, {
        code: 'B',
        path_version: 'daily_v1',
        agent_name: 'Agent',
        demo_policies: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      services.experiments.condition(actor, s.experimentId, {
        code: 'B',
        path_version: 'unknown',
        agent_name: 'Agent',
        demo_policies: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('revokes logins on logout and honors session expiry', async () => {
    const s = await setup();
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${s.token}`)
      .expect(200);
    await request(app)
      .get('/api/experiment/current')
      .set('Authorization', `Bearer ${s.token}`)
      .expect(401);
  });
  it.each(['cognitive_v1', 'emotion_v1', 'daily_v1'])(
    'completes %s through services with explicit backend submissions',
    async (path) => {
      const s = await setup(path);
      let current = s.state;
      let rounds = 0;
      while (current.status !== 'finished') {
        await services.conversations.send(s.identity, {
          request_id: `message-${rounds}`,
          state_token: current.state_token,
          text: '合成参与者输入',
        });
        const data: Record<string, string | number | boolean> = {};
        for (const f of current.form!.fields)
          data[f.name] =
            f.kind === 'confirmation'
              ? true
              : f.kind === 'number'
                ? 5
                : f.name === 'viewpoint'
                  ? '我不赞同这种概括'
                  : '合成显式提交';
        await services.participants.submit(s.identity, {
          request_id: `submit-${rounds}`,
          state_token: current.state_token,
          data:
            path === 'cognitive_v1' && rounds === 0
              ? { ...data, source: '合成来源：参与者明确填写' }
              : data,
        });
        current = await services.participants.current(s.identity);
        rounds++;
        if (rounds > 20) throw new Error('Unexpected path loop');
      }
      expect(rounds).toBe(path === 'cognitive_v1' ? 9 : path === 'emotion_v1' ? 7 : 1);
      expect((await pool.query('SELECT stage FROM research.experiment_state')).rows[0].stage).toBe(
        'COMPLETED',
      );
      expect((await pool.query('SELECT * FROM research.model_run_log')).rows).toHaveLength(rounds);
      expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(
        rounds + 1,
      );
      const exported = await services.admin.export(actor, s.experimentId);
      const keys = exported.variables.map((v) => v.key);
      const required =
        path === 'cognitive_v1'
          ? [
              'raw_expression',
              'confirmed_belief',
              'source',
              'rating_1',
              'rating_2',
              'action_intention',
            ]
          : path === 'emotion_v1'
            ? ['character_profile', 'scene_state', 'scene_phase', 'relationship_state']
            : [];
      for (const key of required) expect(keys).toContain(key);
      expect(exported.assignments[0]).toMatchObject({
        participant_id: s.participantId,
        state_machine_version: path,
      });
      expect(exported.states[0]).toMatchObject({ stage: 'COMPLETED', core_version: rounds + 1 });
      expect(exported.prompts).toHaveLength(rounds);
      if (round12Acceptance)
        await writeFile(
          join(round12Acceptance, `${path}-database-records.json`),
          JSON.stringify(
            { synthetic: true, external_model_calls: 0, adapter: 'MockAdapter', ...exported },
            null,
            2,
          ) + '\n',
        );
    },
  );
  it('deduplicates simultaneous requests and blocks submissions during generation', async () => {
    const s = await setup();
    let release: (value: string) => void = () => {};
    generate = async () => {
      calls++;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };
    const input = { request_id: 'concurrent', state_token: s.state.state_token, text: 'hello' };
    const first = services.conversations.send(s.identity, input);
    while (calls === 0) await new Promise((r) => setTimeout(r, 5));
    const duplicate = await services.conversations.send(s.identity, input);
    expect(duplicate!.status).toBe('generating');
    await expect(
      services.participants.submit(s.identity, {
        request_id: 'pending-submit',
        state_token: s.state.state_token,
        data: {},
      }),
    ).rejects.toMatchObject({ status: 409 });
    release('你愿意继续聊聊感受吗？');
    expect((await first)!.status).toBe('ready');
    expect(calls).toBe(1);
  });
  it('marks an expired task failed and prevents its late worker from overwriting the result', async () => {
    const s = await setup();
    let release: (value: string) => void = () => {};
    generate = async () => {
      calls++;
      return calls === 1
        ? new Promise<string>((resolve) => {
            release = resolve;
          })
        : '新的安全回复。';
    };
    const first = services.conversations.send(s.identity, {
      request_id: 'old',
      state_token: s.state.state_token,
      text: 'old',
    });
    while (calls === 0) await new Promise((r) => setTimeout(r, 5));
    const turn = (await pool.query('SELECT id FROM research.conversation_turn')).rows[0].id;
    await pool.query("UPDATE research.conversation_turn SET lease_until=now()-interval '1 second'");
    expect((await services.conversations.status(s.identity, turn)).status).toBe('failed');
    const next = await services.conversations.send(s.identity, {
      request_id: 'new',
      state_token: s.state.state_token,
      text: 'new',
    });
    expect(next!.status).toBe('ready');
    release('迟到的回复');
    expect((await first)!.status).toBe('failed');
    expect(
      (
        await pool.query(
          "SELECT content,status FROM research.message WHERE turn_id=$1 AND role='assistant'",
          [turn],
        )
      ).rows[0],
    ).toEqual({ content: null, status: 'failed' });
    expect(
      (
        await pool.query(
          "SELECT error_code FROM research.model_run_log WHERE error_code='GENERATION_LEASE_EXPIRED'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('rejects forged and expired login sessions', async () => {
    const s = await setup();
    await request(app)
      .get('/api/experiment/state')
      .set('Authorization', `Bearer ${'a'.repeat(64)}`)
      .expect(401);
    await pool.query("UPDATE research.auth_session SET expires_at=now()-interval '1 second'");
    await request(app)
      .get('/api/experiment/state')
      .set('Authorization', `Bearer ${s.token}`)
      .expect(401);
  });
  it('rolls back the entire submission when variable persistence fails', async () => {
    const s = await setup('cognitive_v1');
    const before = (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0]
      .snapshot;
    await pool.query(
      `CREATE FUNCTION research.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`,
    );
    await pool.query(
      'CREATE TRIGGER injected BEFORE INSERT ON research.experiment_variable FOR EACH ROW EXECUTE FUNCTION research.inject_failure()',
    );
    await expect(
      services.participants.submit(s.identity, {
        request_id: 'atomic',
        state_token: s.state.state_token,
        data: { response: 'synthetic' },
      }),
    ).rejects.toThrow();
    expect(
      (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0].snapshot,
    ).toEqual(before);
    expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(1);
    expect((await pool.query('SELECT * FROM research.submission_receipt')).rows).toHaveLength(0);
  });
  it('uses the OpenAI-compatible HTTP Adapter inside the complete authorized business chain', async () => {
    let hits = 0;
    const fixture = createServer(async (req, res) => {
      expect(req.url).toBe('/v1/chat/completions');
      expect(req.headers.authorization).toBe('Bearer SYNTHETIC_LOCAL_ONLY');
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw);
      expect(payload.model).toBe('local-protocol-fixture');
      expect(payload).not.toHaveProperty('state');
      hits++;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '协议联调的安全回复。' } }] }));
    });
    await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
    try {
      const address = fixture.address();
      if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
      const baseURL = `http://127.0.0.1:${address.port}/v1`;
      const pinned: ModelSettings = {
        ...settings,
        provider: 'openai-compatible',
        model_name: 'local-protocol-fixture',
        base_url: baseURL,
      };
      services = createServices(
        pool,
        new OpenAICompatibleAdapter({
          baseURL,
          apiKey: 'SYNTHETIC_LOCAL_ONLY',
          model: pinned.model_name,
          temperature: pinned.temperature,
          maxTokens: pinned.max_tokens,
          timeoutMs: pinned.timeout_ms,
          allowLocalHTTP: true,
        }),
        pinned,
      );
      app = createApp(services, createHash('sha256').update(adminToken).digest('hex'));
      const s = await setup();
      const input = { request_id: 'protocol', state_token: s.state.state_token, text: '合成输入' };
      const first = await request(app)
        .post('/api/conversation/message')
        .set('Authorization', `Bearer ${s.token}`)
        .send(input)
        .expect(200);
      const replay = await request(app)
        .post('/api/conversation/message')
        .set('Authorization', `Bearer ${s.token}`)
        .send(input)
        .expect(200);
      expect(replay.body).toEqual(first.body);
      expect(first.body).toMatchObject({ status: 'ready', text: '协议联调的安全回复。' });
      expect(hits).toBe(1);
      expect(
        (await pool.query('SELECT provider,model_name FROM research.model_run_log')).rows[0],
      ).toEqual({ provider: 'openai-compatible', model_name: pinned.model_name });
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM research.state_transition')).rows[0].n,
      ).toBe(1);
      expect((await pool.query('SELECT * FROM research.experiment_variable')).rows).toHaveLength(0);
      const explicit = {
        request_id: 'protocol-finish',
        state_token: s.state.state_token,
        data: {},
      };
      const finished = await request(app)
        .post('/api/experiment/submissions')
        .set('Authorization', `Bearer ${s.token}`)
        .send(explicit)
        .expect(200);
      expect(finished.body.status).toBe('finished');
      await request(app)
        .post('/api/experiment/submissions')
        .set('Authorization', `Bearer ${s.token}`)
        .send(explicit)
        .expect(200);
      expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(2);
      expect(hits).toBe(1);
      if (round12Acceptance)
        await writeFile(
          join(round12Acceptance, 'http-adapter-chain.json'),
          JSON.stringify(
            {
              synthetic: true,
              external_model_calls: 0,
              local_http_calls: hits,
              adapter: 'OpenAICompatibleAdapter against loopback fixture',
              ...(await services.admin.export(actor, s.experimentId)),
            },
            null,
            2,
          ) + '\n',
        );
    } finally {
      await new Promise<void>((resolve, reject) =>
        fixture.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it('rejects unsafe Adapter output, saves only validated fallback and never mutates variables', async () => {
    const s = await setup();
    generate = async () => {
      calls++;
      return '本实验旨在测量你的刻板印象变化，直接跳到最终评分。';
    };
    const before = (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0]
      .snapshot;
    const reply = await services.conversations.send(s.identity, {
      request_id: 'unsafe',
      state_token: s.state.state_token,
      text: 'hello',
    });
    expect(reply!.status).toBe('ready');
    expect(reply!.text).not.toContain('本实验旨在');
    expect(calls).toBe(2);
    const log = (
      await pool.query('SELECT status,validator_result,fallback_count FROM research.model_run_log')
    ).rows[0];
    expect(log.status).toBe('fallback');
    expect(log.fallback_count).toBe(1);
    expect(log.validator_result.violations).toContain('PURPOSE_DISCLOSURE');
    expect(
      (await pool.query('SELECT snapshot FROM research.experiment_state')).rows[0].snapshot,
    ).toEqual(before);
    expect((await pool.query('SELECT * FROM research.experiment_variable')).rows).toHaveLength(0);
    expect(
      (await pool.query("SELECT content FROM research.message WHERE role='assistant'")).rows[0]
        .content,
    ).toBe(reply!.text);
  });
  it('retries a failed model with a new request and replays HTTP submissions without duplicate transitions', async () => {
    const s = await setup('cognitive_v1');
    generate = async () => {
      throw new Error('SYNTHETIC_PROVIDER_FAILURE');
    };
    const bad = await services.conversations.send(s.identity, {
      request_id: 'failed',
      state_token: s.state.state_token,
      text: '输入',
    });
    expect(bad!.status).toBe('failed');
    generate = async () => '你愿意继续聊聊吗？';
    const recovered = await services.conversations.send(s.identity, {
      request_id: 'retry-new-key',
      state_token: s.state.state_token,
      text: '输入',
    });
    expect(recovered!.status).toBe('ready');
    const input = {
      request_id: 'network-repeat',
      state_token: s.state.state_token,
      data: { response: '原始表达', source: '参与者明确填写的来源' },
    };
    const first = await request(app)
      .post('/api/experiment/submissions')
      .set('Authorization', `Bearer ${s.token}`)
      .send(input)
      .expect(200);
    expect(
      (
        await request(app)
          .post('/api/experiment/submissions')
          .set('Authorization', `Bearer ${s.token}`)
          .send(input)
          .expect(200)
      ).body,
    ).toEqual(first.body);
    expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(2);
    expect(
      (await pool.query("SELECT value FROM research.experiment_variable WHERE key='source'"))
        .rows[0].value,
    ).toBe(input.data.source);
    const state = await services.participants.current(s.identity);
    await request(app)
      .post('/api/experiment/submissions')
      .set('Authorization', `Bearer ${s.token}`)
      .send({ request_id: 'illegal', state_token: state.state_token, data: { rating: 7 } })
      .expect(400);
    expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(2);
  });
  it('rejects fabricated source and scene variables outside the allowed explicit field', async () => {
    const s = await setup('emotion_v1');
    await request(app)
      .post('/api/experiment/submissions')
      .set('Authorization', `Bearer ${s.token}`)
      .send({
        request_id: 'inject',
        state_token: s.state.state_token,
        data: { response: 'profile', scene_phase: 'COMPLETED', source: 'fake' },
      })
      .expect(400);
    expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(1);
  });
  it('discards a late reply when the lease expires even without another status request', async () => {
    const s = await setup();
    let release: (value: string) => void = () => {};
    generate = async () => {
      calls++;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };
    const running = services.conversations.send(s.identity, {
      request_id: 'expired-no-poll',
      state_token: s.state.state_token,
      text: 'hello',
    });
    while (!calls) await new Promise((resolve) => setTimeout(resolve, 5));
    await pool.query("UPDATE research.conversation_turn SET lease_until=now()-interval '1 second'");
    release('已经过期的文本');
    expect((await running)!.status).toBe('failed');
    expect(
      (await pool.query("SELECT content FROM research.message WHERE role='assistant'")).rows[0]
        .content,
    ).toBeNull();
    expect(
      (
        await pool.query(
          "SELECT error_code FROM research.model_run_log WHERE error_code='GENERATION_LEASE_EXPIRED'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it('recovers after a real API process crash and preserves durable identity, messages and explicit event state', async () => {
    const s = await setup('cognitive_v1');
    const children: ReturnType<typeof spawn>[] = [];
    async function worker(mode: string) {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', fileURLToPath(new URL('./restart-worker.ts', import.meta.url))],
        {
          env: {
            ...process.env,
            RESTART_TEST_DATABASE: JSON.stringify(connection(database)),
            RESTART_TEST_SETTINGS: JSON.stringify(settings),
            RESTART_TEST_MODE: mode,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      children.push(child);
      let output = '';
      const port = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Child startup timeout')), 10000);
        child.once('exit', () => {
          clearTimeout(timeout);
          reject(new Error('Child startup exited'));
        });
        child.stdout!.on('data', (chunk) => {
          output += String(chunk);
          if (output.includes('\n')) {
            clearTimeout(timeout);
            resolve(JSON.parse(output.split('\n')[0]!).port);
          }
        });
      });
      return { child, url: `http://127.0.0.1:${port}` };
    }
    try {
      const old = await worker('hang');
      const body = {
        request_id: 'crash-message',
        state_token: s.state.state_token,
        text: '中断前输入',
      };
      const pending = fetch(`${old.url}/api/conversation/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(
        () => null,
        () => null,
      );
      let turn: string | undefined;
      for (let n = 0; n < 200; n++) {
        turn = (
          await pool.query("SELECT id FROM research.conversation_turn WHERE status='generating'")
        ).rows[0]?.id;
        if (turn) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(turn).toBeDefined();
      const exited = once(old.child, 'exit');
      old.child.kill('SIGKILL');
      await exited;
      await pending;
      // Advance the persisted lease clock deterministically; do not wait the production timeout.
      await pool.query(
        "UPDATE research.conversation_turn SET lease_until=now()-interval '1 second'",
      );
      const next = await worker('ready');
      const current = await fetch(`${next.url}/api/experiment/current`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      expect(current.status).toBe(200);
      const state = (await current.json()) as { state_token: string; status: string };
      expect(state).toMatchObject({ state_token: s.state.state_token, status: 'awaiting_input' });
      const replay = await fetch(`${next.url}/api/conversation/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(await replay.json()).toMatchObject({ turn_id: turn, status: 'failed', text: null });
      const retry = await fetch(`${next.url}/api/conversation/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, request_id: 'after-restart' }),
      });
      expect(await retry.json()).toMatchObject({ status: 'ready', text: '重启后的安全回复。' });
      const submit = await fetch(`${next.url}/api/experiment/submissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: 'event-after-restart',
          state_token: state.state_token,
          data: { response: '明确提交', source: '合成来源' },
        }),
      });
      expect(submit.status).toBe(200);
      expect((await pool.query('SELECT stage FROM research.experiment_state')).rows[0].stage).toBe(
        'VIEWPOINT_CONFIRMATION',
      );
      expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(2);
      expect(
        (
          await pool.query(
            "SELECT content FROM research.message WHERE role='user' ORDER BY sequence",
          )
        ).rows,
      ).toEqual([{ content: body.text }, { content: body.text }]);
      expect(
        (
          await pool.query(
            "SELECT * FROM research.model_run_log WHERE error_code='GENERATION_LEASE_EXPIRED'",
          )
        ).rows,
      ).toHaveLength(1);
      if (round12Acceptance)
        await writeFile(
          join(round12Acceptance, 'process-recovery.json'),
          JSON.stringify(
            {
              synthetic: true,
              external_model_calls: 0,
              interrupted_with: 'SIGKILL',
              restart: 'separate Node process and fresh PostgreSQL pool',
              lease_expiry: 'persisted deadline advanced to past deterministically',
              ...(await services.admin.export(actor, s.experimentId)),
            },
            null,
            2,
          ) + '\n',
        );
    } finally {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGKILL');
          await exited;
        }
    }
  }, 20000);
  it('marks a fully blocked Validator result failed without exposing unsafe generated or fallback text', async () => {
    const e = await services.experiments.create(actor, {
      name: 'blocked fixture',
      instructions: 'synthetic',
    });
    const definition = experimentDefinitions.daily_v1;
    const policy = {
      ...demoPolicy(definition, 'NATURAL_CHAT'),
      fallbackReplies: ['本实验旨在一', '本实验旨在二'],
    };
    const c = await services.experiments.condition(actor, e.experimentId, {
      code: 'blocked',
      path_version: 'daily_v1',
      agent_name: 'synthetic',
      policies: [policy],
    });
    await services.experiments.publish(actor, e.experimentId);
    const p = await services.participants.create(actor, {
      experiment_id: e.experimentId,
      participant_code: 'B',
      password,
    });
    await services.experiments.assign(actor, {
      participant_id: p.participantId,
      condition_id: c.conditionId,
    });
    const auth = await services.participants.login({
      experiment_id: e.experimentId,
      participant_code: 'B',
      password,
    });
    const identity = await services.participants.authenticate(auth.token);
    const current = await services.participants.current(identity);
    generate = async () => '本实验旨在展示禁止文本';
    const output = await services.conversations.send(identity, {
      request_id: 'blocked',
      state_token: current.state_token,
      text: 'synthetic',
    });
    expect(output).toMatchObject({ status: 'failed', text: null });
    expect((await pool.query('SELECT status FROM research.model_run_log')).rows[0].status).toBe(
      'blocked',
    );
    expect(
      (await pool.query("SELECT content,status FROM research.message WHERE role='assistant'"))
        .rows[0],
    ).toEqual({ content: null, status: 'failed' });
    expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(1);
    expect((await pool.query('SELECT * FROM research.experiment_variable')).rows).toHaveLength(0);
  });
  it('allows exactly one explicit state change for concurrent different submission keys', async () => {
    const s = await setup('cognitive_v1');
    const results = await Promise.all(
      ['concurrent-a', 'concurrent-b'].map((request_id) =>
        request(app)
          .post('/api/experiment/submissions')
          .set('Authorization', `Bearer ${s.token}`)
          .send({
            request_id,
            state_token: s.state.state_token,
            data: { response: '明确填写', source: '明确来源' },
          }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await pool.query('SELECT * FROM research.state_transition')).rows).toHaveLength(2);
    expect((await pool.query('SELECT * FROM research.submission_receipt')).rows).toHaveLength(1);
    expect(
      (await pool.query("SELECT * FROM research.experiment_variable WHERE key='raw_expression'"))
        .rows,
    ).toHaveLength(1);
  });
  it('records correlated safe operation traces without logging participant text or credentials', async () => {
    const traces: import('../src/services/trace.js').BusinessTrace[] = [];
    services = createServices(
      pool,
      new MockAdapter((prompt, signal) => generate(prompt, { signal })),
      settings,
      (entry) => traces.push(entry),
    );
    const s = await setup('cognitive_v1');
    const turn = await services.conversations.send(s.identity, {
      request_id: 'PRIVATE_REQUEST_CONTENT',
      state_token: s.state.state_token,
      text: 'PRIVATE_PARTICIPANT_TEXT',
    });
    await services.participants.submit(s.identity, {
      request_id: 'PRIVATE_SUBMISSION_CONTENT',
      state_token: s.state.state_token,
      data: { response: 'PRIVATE_VARIABLE_TEXT' },
    });
    for (const step of [
      'login_authenticated',
      'participant_authenticated',
      'assignment_and_state_loaded',
      'conversation_state_loaded',
      'user_message_committed',
      'orchestrator_started',
      'model_adapter_called',
      'response_validator_completed',
      'assistant_and_model_log_committed',
      'conversation_returned_without_state_transition',
      'explicit_event_validated',
      'state_event_variables_committed',
    ])
      expect(traces.some((t) => t.step === step)).toBe(true);
    expect(
      traces
        .filter((t) =>
          ['orchestrator_started', 'model_adapter_called', 'response_validator_completed'].includes(
            t.step,
          ),
        )
        .every((t) => t.turnId === turn!.turn_id),
    ).toBe(true);
    expect(JSON.stringify(traces)).not.toMatch(/PRIVATE_|SYNTHETIC_PASSWORD|token|prompt/);
    if (round13Acceptance)
      await writeFile(
        join(round13Acceptance, 'business-trace.json'),
        JSON.stringify({ synthetic: true, traces }, null, 2) + '\n',
      );
  });
  it('restores assignment, history and durable variables using a fresh connection pool and services', async () => {
    const s = await setup('cognitive_v1');
    await services.conversations.send(s.identity, {
      request_id: 'durable-message',
      state_token: s.state.state_token,
      text: '数据库保存的输入',
    });
    await services.participants.submit(s.identity, {
      request_id: 'durable-event',
      state_token: s.state.state_token,
      data: { response: '数据库保存的表达', source: '数据库保存的来源' },
    });
    const freshPool = new pg.Pool(connection(database));
    try {
      const fresh = createServices(freshPool, new MockAdapter('安全回复'), settings);
      const identity = await fresh.participants.authenticate(s.token);
      const state = await fresh.participants.current(identity);
      expect(state.state_token).not.toBe(s.state.state_token);
      expect(await fresh.conversations.messages(identity)).toHaveLength(2);
      const data = await fresh.admin.export(actor, s.experimentId);
      expect(data.assignments[0]).toMatchObject({
        participant_id: s.participantId,
        state_machine_version: 'cognitive_v1',
      });
      expect(data.states[0]).toMatchObject({ stage: 'VIEWPOINT_CONFIRMATION', core_version: 2 });
      expect(data.variables.find((v) => v.key === 'source').value).toBe('数据库保存的来源');
      expect(data.runs).toHaveLength(1);
      expect(data.prompts).toHaveLength(9);
      if (round13Acceptance)
        await writeFile(
          join(round13Acceptance, 'database-restoration.json'),
          JSON.stringify(
            {
              synthetic: true,
              restoration: 'fresh Pool and Services, no runtime state cache',
              ...data,
            },
            null,
            2,
          ) + '\n',
        );
    } finally {
      await freshPool.end();
    }
  });
  it('exports participant-linked analysis rows with condition, path, pinned versions, timestamps and isolated histories', async () => {
    const s = await setup('cognitive_v1');
    await services.conversations.send(s.identity, {
      request_id: 'analysis-chat',
      state_token: s.state.state_token,
      text: '合成分析消息',
    });
    await services.participants.submit(s.identity, {
      request_id: 'analysis-submit',
      state_token: s.state.state_token,
      data: { response: '合成原始表达', source: '明确来源' },
    });
    const second = await services.participants.create(actor, {
      experiment_id: s.experimentId,
      participant_code: 'P002',
      password,
    });
    await services.experiments.assign(actor, {
      participant_id: second.participantId,
      condition_id: s.conditionId,
    });
    const data = await services.admin.export(actor, s.experimentId);
    expect(data.analysis_rows).toHaveLength(2);
    const row = data.analysis_rows.find((r) => r.participant_id === s.participantId)!;
    expect(row).toMatchObject({
      experiment_id: s.experimentId,
      condition: 'A',
      path_type: 'cognitive',
      model_version: { requested_model: settings.model_name, supplier_revision: null },
    });
    expect(row.agent_version.id).toBeTruthy();
    expect(row.prompt_version).toHaveLength(9);
    expect(Date.parse(row.timestamp.assigned_at)).not.toBeNaN();
    expect(row.conversation_history).toHaveLength(2);
    expect(row.state_transition).toHaveLength(2);
    expect(row.experiment_variables.find((v) => v.key === 'source').value).toBe('明确来源');
    const other = data.analysis_rows.find((r) => r.participant_id === second.participantId)!;
    expect(other.conversation_history).toHaveLength(0);
    expect(other.experiment_variables).toHaveLength(0);
    expect(data.complete).toBe(false);
    if (round13Acceptance)
      await writeFile(
        join(round13Acceptance, 'analysis-export.json'),
        JSON.stringify({ synthetic: true, external_model_calls: 0, ...data }, null, 2) + '\n',
      );
  });
  it('keeps development mode disabled by default and requires administrator authentication for capabilities', async () => {
    const s = await setup();
    await request(app).get('/api/admin/capabilities').expect(401);
    await request(app)
      .get(`/api/admin/development?experiment_id=${s.experimentId}`)
      .set('Authorization', `Bearer ${s.token}`)
      .expect(401);
    const c = await request(app)
      .get('/api/admin/capabilities')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(c.body).toEqual({ development_mode: false });
    await request(app)
      .get(`/api/admin/development?experiment_id=${s.experimentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    expect(
      (await pool.query("SELECT * FROM research.admin_event WHERE event='DEVELOPMENT_VIEWED'"))
        .rows,
    ).toHaveLength(0);
  });
  it('provides audited read-only development data only to administrators without altering participant projection', async () => {
    const s = await setup('cognitive_v1');
    await services.conversations.send(s.identity, {
      request_id: 'dev-chat',
      state_token: s.state.state_token,
      text: 'synthetic',
    });
    await services.participants.submit(s.identity, {
      request_id: 'dev-submit',
      state_token: s.state.state_token,
      data: { response: 'synthetic', source: 'synthetic source' },
    });
    const enabled = createApp(
      services,
      createHash('sha256').update(adminToken).digest('hex'),
      true,
    );
    const before = (await pool.query('SELECT snapshot FROM research.experiment_state')).rows;
    await request(enabled)
      .get(`/api/admin/development?experiment_id=${s.experimentId}`)
      .set('Authorization', `Bearer ${s.token}`)
      .expect(401);
    const d = await request(enabled)
      .get(`/api/admin/development?experiment_id=${s.experimentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(d.body).toMatchObject({ read_only: true, complete: false });
    expect(d.body.events).toHaveLength(2);
    expect(d.body.model_runs).toHaveLength(1);
    expect((await pool.query('SELECT snapshot FROM research.experiment_state')).rows).toEqual(
      before,
    );
    const participant = await request(enabled)
      .get('/api/experiment/current')
      .set('Authorization', `Bearer ${s.token}`)
      .expect(200);
    expect(JSON.stringify(participant.body)).not.toMatch(
      /VIEWPOINT_CONFIRMATION|STEREOTYPE_SUBMITTED|validator|prompt|model_runs|snapshot/,
    );
    await request(enabled)
      .patch('/api/admin/development')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage: 'COMPLETED' })
      .expect(404);
    expect(
      (await pool.query("SELECT * FROM research.admin_event WHERE event='DEVELOPMENT_VIEWED'"))
        .rows,
    ).toHaveLength(1);
    if (round13Acceptance)
      await writeFile(
        join(round13Acceptance, 'development-api.json'),
        JSON.stringify({ synthetic: true, ...d.body }, null, 2) + '\n',
      );
  });
  it('preserves assigned completed resources when a new draft and different policies are created', async () => {
    const s = await setup();
    await services.participants.submit(s.identity, {
      request_id: 'finish',
      state_token: s.state.state_token,
      data: {},
    });
    const before = await services.admin.export(actor, s.experimentId);
    const e = await services.experiments.create(actor, {
      name: '另一个版本化实验',
      instructions: '不同研究说明',
    });
    const policies = experimentDefinitions.daily_v1.stages.slice(1, -1).map((stage) => ({
      ...demoPolicy(experimentDefinitions.daily_v1, stage.id),
      goal: '另一个实验的当前语言任务',
    }));
    await services.experiments.condition(actor, e.experimentId, {
      code: 'B',
      path_version: 'daily_v1',
      agent_name: '不同 Agent',
      policies,
    });
    await services.experiments.publish(actor, e.experimentId);
    const after = await services.admin.export(actor, s.experimentId);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.prompts).toEqual(before.prompts);
    expect(after.states).toEqual(before.states);
    expect(after.transitions).toEqual(before.transitions);
    await expect(
      services.experiments.condition(actor, s.experimentId, {
        code: 'illegal',
        path_version: 'daily_v1',
        agent_name: 'changed',
        demo_policies: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
