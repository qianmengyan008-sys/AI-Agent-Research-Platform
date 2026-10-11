import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  services = createServices(pool, { generate: (...args) => generate(...args) }, settings);
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
          data,
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
});
