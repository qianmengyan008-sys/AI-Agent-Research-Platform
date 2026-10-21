import { afterAll, beforeAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { MockAdapter } from '@research/model-adapter';
import { loadMigrations, migrate } from '../../../packages/database/src/migrations.js';
import { createServices } from '../src/services/index.js';
import { createApp } from '../src/app.js';
import { UnitOfWork } from '../src/repositories/context.js';
import { createHostedPlatform } from '../../../scripts/hosted-platform.mjs';
import type { Services } from '../src/services/index.js';
const image =
  'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
const container = 'chat-flow-' + randomUUID(),
  adminToken = 'SYNTHETIC_CHAT_ADMIN',
  password = 'SYNTHETIC_CHAT_PASSWORD';
const actor = { role: 'admin' as const, id: 'chat-test' };
const settings = {
  provider: 'mock' as const,
  model_name: 'synthetic-chat-model',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 1000,
  max_attempts: 2,
};
let pool: pg.Pool,
  services: Services,
  app: ReturnType<typeof createApp>,
  calls = 0,
  created = false,
  fail = false;
const artifacts = process.env.ROUND39_ACCEPTANCE_DIR;
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
      'POSTGRES_PASSWORD=SYNTHETIC_CHAT_DB',
      image,
    ],
    { stdio: 'pipe' },
  );
  created = true;
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
    password: 'SYNTHETIC_CHAT_DB',
    database: 'postgres',
    connectionTimeoutMillis: 1000,
  });
  for (let i = 0; i < 60; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
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
  services = createServices(
    pool,
    new MockAdapter(async (prompt) => {
      if (fail) throw Error('SYNTHETIC_MODEL_FAILURE');
      calls++;
      const belief = prompt.messages
        .map((m) => m.content)
        .join('\n')
        .match(/唯一确认观点：(.*)/u)?.[1];
      return belief
        ? `对于“${JSON.parse(belief)}”，可以结合具体经历理解。合成交流${calls}。`
        : `Marcus与李阳通过当前交流了解彼此。合成交流${calls}。`;
    }),
    settings,
  );
  app = createApp(services, createHash('sha256').update(adminToken).digest('hex'), true);
}, 60000);
afterAll(async () => {
  await pool?.end();
  if (created) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
});
async function account(path = 'cognitive_v1') {
  const e = await services.experiments.create(actor, {
    name: 'Synthetic ' + randomUUID(),
    instructions: '合成通用说明',
    research_profile: 'mentor-test-v1',
  });
  const c = await services.experiments.condition(actor, e.experimentId, {
    code: 'SYNTH',
    path_version: path,
    agent_name: '研究对话伙伴',
  });
  await services.experiments.publish(actor, e.experimentId);
  const code = 'TEST-' + randomUUID();
  const p = await services.participants.create(actor, {
    experiment_id: e.experimentId,
    participant_code: code,
    password,
  });
  await services.experiments.assign(actor, {
    participant_id: p.participantId,
    condition_id: c.conditionId,
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ experiment_id: e.experimentId, participant_code: code, password })
    .expect(200);
  return { ...e, ...p, code, token: login.body.token as string };
}
type Account = Awaited<ReturnType<typeof account>>;
const auth = (s: Account) => ({ Authorization: 'Bearer ' + s.token });
const current = async (s: Account) =>
  (await request(app).get('/api/experiment/current').set(auth(s)).expect(200)).body;
const bundle = (s: Account) => new UnitOfWork(pool).read((r) => r.states.load(s.participantId));
async function say(s: Account, text: string, id = randomUUID()) {
  const state = await current(s);
  return request(app)
    .post('/api/conversation/message')
    .set(auth(s))
    .send({ interaction: 'chat', state_token: state.state_token, request_id: id, text });
}
async function submit(s: Account, data: unknown, token?: string) {
  return request(app)
    .post('/api/experiment/submissions')
    .set(auth(s))
    .send({
      interaction: 'chat',
      state_token: token ?? (await current(s)).state_token,
      request_id: randomUUID(),
      data,
    });
}
async function start(s: Account) {
  return request(app).post('/api/conversation/start').set(auth(s)).send({}).expect(200);
}
const history = async (s: Account) =>
  (await request(app).get('/api/conversation/messages').set(auth(s)).expect(200)).body as {
    text: string;
    card_record?: unknown;
  }[];
async function save(name: string, data: unknown) {
  if (artifacts) {
    await mkdir(artifacts, { recursive: true });
    await writeFile(artifacts + '/' + name + '.json', JSON.stringify(data, null, 2) + '\n');
  }
}
test('each path starts automatically exactly once; no model/turn/state consumed; refresh and login restore', async () => {
  for (const path of ['cognitive_v1', 'emotion_v1', 'daily_v1']) {
    const s = await account(path),
      before = await bundle(s),
      previous = calls;
    await Promise.all([start(s), start(s)]);
    await start(s);
    const h = await history(s);
    expect(h[0]!.text).toBe(
      '嗨，很高兴认识你！我平时很关注时事新闻，也特别想听听你的看法。你现在方便聊几句吗？',
    );
    expect(h).toHaveLength(2);
    expect(calls).toBe(previous);
    expect((await bundle(s))!.snapshot).toEqual(before!.snapshot);
    if (path === 'emotion_v1') {
      expect(h[1]!.text).toContain('《打破心墙》');
      expect(h[1]!.text).toContain('Marcus');
    }
    if (path === 'cognitive_v1') expect(h[1]!.text).toContain('美国黑人');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ experiment_id: s.experimentId, participant_code: s.code, password })
      .expect(200);
    expect(await history({ ...s, token: login.body.token })).toEqual(h);
  }
});
test('full frozen cognitive path progresses deterministically with two explicit ratings and immutable initial belief', async () => {
  const s = await account();
  await start(s);
  const belief = '我原先认为美国黑人都不重视学习。';
  expect((await say(s, '方便')).status).toBe(200);
  expect((await bundle(s))!.snapshot.stage).toBe('STEREOTYPE_CAPTURE');
  expect((await say(s, belief)).status).toBe(200);
  expect((await bundle(s))!.snapshot.stage).toBe('STEREOTYPE_CAPTURE');
  expect((await say(s, '这个印象来自我以前刷到的短视频。')).status).toBe(200);
  expect((await bundle(s))!.snapshot.stage).toBe('VIEWPOINT_CONFIRMATION');
  expect((await current(s)).confirmation_card.belief).toBe(belief);
  expect((await submit(s, { viewpoint: '另一观点', confirmed: true })).status).toBe(400);
  expect((await submit(s, { viewpoint: belief, confirmed: false })).status).toBe(400);
  expect((await submit(s, { rating: 70 })).status).toBe(400);
  expect((await submit(s, { viewpoint: belief, confirmed: true })).status).toBe(200);
  expect((await current(s)).rating_card.belief).toBe(belief);
  expect((await submit(s, { rating: 101 })).status).toBe(400);
  expect((await submit(s, { rating: 70 })).status).toBe(200);
  for (const stage of [
    'REFRAME_SOCIAL_STRUCTURE',
    'REFRAME_MEDIA_ALGORITHM',
    'REFRAME_COUNTER_FACT',
    'REFRAME_INDIVIDUAL_DIFFERENCE',
  ]) {
    expect((await bundle(s))!.snapshot.stage).toBe(stage);
    expect((await say(s, `我愿意结合具体背景了解这类美国黑人印象，表达一。`)).status).toBe(200);
    expect((await bundle(s))!.snapshot.stage).toBe(stage);
    expect((await submit(s, { rating: 35 })).status).toBe(400);
    expect((await say(s, `我也愿意核实不同个体的具体经历，表达二。`)).status).toBe(200);
  }
  expect((await bundle(s))!.snapshot.stage).toBe('SECOND_RATING');
  expect((await current(s)).rating_card.belief).toBe(belief);
  expect((await submit(s, { rating: 35 })).status).toBe(200);
  expect((await bundle(s))!.snapshot.stage).toBe('ACTION_INTENTION');
  expect((await say(s, '我愿意减少关注一概而论的负面信息。')).status).toBe(200);
  expect((await say(s, '我会核实来源，不传播未经证实的负面刻板印象。')).status).toBe(200);
  const b = await bundle(s);
  expect(b!.snapshot.stage).toBe('COMPLETED');
  expect(b!.snapshot.variables.confirmed_viewpoint).toBe(belief);
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.transitions.map((t) => t.current_state)).toEqual([
    'STEREOTYPE_CAPTURE',
    'VIEWPOINT_CONFIRMATION',
    'INITIAL_RATING',
    'REFRAME_SOCIAL_STRUCTURE',
    'REFRAME_MEDIA_ALGORITHM',
    'REFRAME_COUNTER_FACT',
    'REFRAME_INDIVIDUAL_DIFFERENCE',
    'SECOND_RATING',
    'ACTION_INTENTION',
    'COMPLETED',
  ]);
  expect(data.variables.find((v) => v.key === 'source')!.value).toContain('短视频');
  expect(data.runs.every((r) => String(r.prompt_version).endsWith('-complete-sentences-v1'))).toBe(
    true,
  );
  expect((await history(s)).filter((m) => m.card_record)).toHaveLength(3);
  const record = await request(app)
    .get(
      `/api/admin/history?experiment_id=${s.experimentId}&participant_id=${s.participantId}&path=cognitive&session_id=${b!.session_id}`,
    )
    .auth(adminToken, { type: 'bearer' })
    .expect(200);
  expect(record.body.complete).toBe(true);
  expect(record.body.sessions[0].ended_at).toBeTruthy();
  expect(
    record.body.events
      .filter((e: { event: string }) => e.event === 'RATING_SUBMITTED')
      .map((e: { validated_payload: { rating: number } }) => e.validated_payload.rating),
  ).toEqual([70, 35]);
  expect(
    record.body.messages.every(
      (m: { created_at: string }) => !Number.isNaN(Date.parse(m.created_at)),
    ),
  ).toBe(true);
  await request(app)
    .get(`/api/admin/history?experiment_id=${s.experimentId}&participant_id=${s.participantId}`)
    .set(auth(s))
    .expect(401);
  expect(
    (
      await request(app)
        .get(
          `/api/admin/history?experiment_id=${s.experimentId}&participant_id=${s.participantId}&path=emotional`,
        )
        .auth(adminToken, { type: 'bearer' })
        .expect(200)
    ).body.messages,
  ).toEqual([]);
  await save('cognitive-complete', { synthetic: true, ...data, history: record.body });
});
test('full frozen emotion path keeps identities, five scenes, story budget and exact ending', async () => {
  const s = await account('emotion_v1');
  await start(s);
  const seen: string[] = [];
  for (let i = 0; i < 25; i++) {
    const b = (await bundle(s))!;
    if (b.snapshot.stage === 'COMPLETED') break;
    if (seen.at(-1) !== b.snapshot.stage) seen.push(b.snapshot.stage);
    expect(
      (await say(s, `Marcus喜欢音乐，李阳愿意继续倾听当前经历。合成参与内容${i}。`)).status,
    ).toBe(200);
  }
  expect((await bundle(s))!.snapshot.stage).toBe('COMPLETED');
  expect(seen).toEqual([
    'PERSONA_SETUP',
    'FIRST_CONTACT',
    'MISUNDERSTANDING',
    'RESOLUTION',
    'SHARED_EXPERIENCE',
    'RELATIONSHIP',
    'ENDING_FEEDBACK',
  ]);
  const data = await services.admin.export(actor, s.experimentId);
  const story = data.turns.filter((t) =>
    [
      'FIRST_CONTACT',
      'MISUNDERSTANDING',
      'RESOLUTION',
      'SHARED_EXPERIENCE',
      'RELATIONSHIP',
    ].includes(t.generation_context.stage),
  );
  expect(story.length).toBeGreaterThanOrEqual(11);
  expect(story.length).toBeLessThanOrEqual(14);
  const h = await history(s);
  expect(
    h.filter(
      (m) => m.text === '今天我们一起完成了Marcus和李阳从陌生到理解的故事，谢谢你参与这次创作。',
    ),
  ).toHaveLength(1);
  for (const [stage, place] of [
    ['FIRST_CONTACT', '图书馆'],
    ['MISUNDERSTANDING', '食堂'],
    ['RESOLUTION', '食堂'],
    ['SHARED_EXPERIENCE', '自习室'],
    ['RELATIONSHIP', '校园步道'],
  ])
    expect(
      data.notices.find(
        (n) =>
          n.notice_key ===
          'task-' + data.transitions.find((t) => t.current_state === stage)!.to_version,
      )!.content,
    ).toContain(place);
  expect(await history(s)).toEqual(h);
  await save('emotional-complete', { synthetic: true, ...data });
});
test('failed generation cannot advance or create a completed card; retried and duplicate requests are bounded', async () => {
  const s = await account();
  await start(s);
  const before = (await bundle(s))!.snapshot;
  fail = true;
  try {
    expect((await say(s, '我原先的印象来自短视频。')).body.status).toBe('failed');
  } finally {
    fail = false;
  }
  expect((await bundle(s))!.snapshot).toEqual(before);
  const state = await current(s),
    id = randomUUID(),
    body = {
      interaction: 'chat',
      state_token: state.state_token,
      request_id: id,
      text: '我认为美国黑人都不重视学习。',
    };
  await request(app).post('/api/conversation/message').set(auth(s)).send(body).expect(200);
  const saved = await history(s),
    n = calls;
  await request(app).post('/api/conversation/message').set(auth(s)).send(body).expect(200);
  expect(await history(s)).toEqual(saved);
  expect(calls).toBe(n);
  const h = await request(app)
    .get(`/api/admin/history?experiment_id=${s.experimentId}&participant_id=${s.participantId}`)
    .auth(adminToken, { type: 'bearer' })
    .expect(200);
  expect(h.body.interruptions.some((i: { status: string }) => i.status === 'failed')).toBe(true);
});
test('incremental upgrade and two hosted restarts preserve legacy fixed and researcher-created credentials, messages and assignments', async () => {
  await pool.query('CREATE DATABASE legacy_upgrade');
  const old = new pg.Pool({
    host: pool.options.host,
    port: pool.options.port,
    user: 'postgres',
    password: 'SYNTHETIC_CHAT_DB',
    database: 'legacy_upgrade',
  });
  try {
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      RESEARCH_DATABASE_SCOPE: 'isolated-staging',
      MODEL_PROVIDER: 'deepseek',
      DEEPSEEK_MODEL_NAME: 'deepseek-flash',
      DEEPSEEK_API_KEY: 'SYNTHETIC_NO_CALL_KEY',
      ADMIN_ACCESS_TOKEN: 'SYNTHETIC_LEGACY_ADMIN_TOKEN_1234567890123456',
      RESEARCH_BOOTSTRAP_SECRET: 'SYNTHETIC_LEGACY_SEED_1234567890123456',
      RESEARCH_BOOTSTRAP_BATCH: 'B001',
      RESEARCH_BOOTSTRAP_COUNT: '3',
    };
    const options = {
      env,
      poolOverride: old,
      modelTransportOverride: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: '谢谢你的表达，我们可以结合实际经历继续理解。' },
              },
            ],
          }),
        ),
    };
    const first = await createHostedPlatform(options),
      fixed = first.seed.accounts[0]!;
    const condition = (await first.services.accounts.options(actor, first.seed.experiment_id)).find(
      (c: { path: string }) => c.path === 'daily',
    )!;
    const extra = await first.services.participants.create(actor, {
      experiment_id: first.seed.experiment_id,
      participant_code: 'RESEARCHER-EXISTING-001',
      password,
    });
    await first.services.experiments.assign(actor, {
      participant_id: extra.participantId,
      condition_id: condition.id,
    });
    const fixedLogin = await first.services.participants.login({
      experiment_id: first.seed.experiment_id,
      participant_code: fixed.participant_code,
      password: fixed.password,
    });
    const fixedActor = await first.services.participants.authenticate(fixedLogin.token);
    const state = await first.services.participants.current(fixedActor);
    await first.services.conversations.send(fixedActor, {
      text: '我原先的看法来自媒体内容。',
      request_id: 'legacy-message',
      state_token: state.state_token,
    });
    const original = async () => ({
      participants: (
        await old.query(
          'SELECT id,participant_code,password_hash FROM research.participant ORDER BY id',
        )
      ).rows,
      assignments: (await old.query('SELECT * FROM research.experiment_assignment ORDER BY id'))
        .rows,
      messages: (await old.query('SELECT * FROM research.message ORDER BY id')).rows,
      states: (await old.query('SELECT * FROM research.experiment_state ORDER BY session_id')).rows,
    });
    const c = await old.connect();
    try {
      await migrate(
        c,
        await loadMigrations(
          fileURLToPath(new URL('../../../database/migrations/', import.meta.url)),
        ),
        'down',
      );
    } finally {
      c.release();
    }
    const before = await original();
    for (let i = 0; i < 2; i++) {
      const next = await createHostedPlatform(options);
      expect(await original()).toEqual(before);
      for (const [code, pw] of [
        [fixed.participant_code, fixed.password],
        ['RESEARCHER-EXISTING-001', password],
      ]) {
        const login = await request(next.app)
          .post('/api/auth/login')
          .send({ experiment_id: first.seed.experiment_id, participant_code: code, password: pw })
          .expect(200);
        await request(next.app)
          .get('/api/experiment/current')
          .auth(login.body.token, { type: 'bearer' })
          .expect(200);
      }
    }
    const beforeStart = await original();
    await first.services.participants.start(fixedActor);
    expect(await original()).toEqual(beforeStart); // existing history remains untouched, no fictional opening prepended
    const h = await first.services.conversations.messages(fixedActor);
    expect(h[0]!.text).toBe('我原先的看法来自媒体内容。');
    const rc = await old.connect();
    try {
      await expect(
        migrate(
          rc,
          await loadMigrations(
            fileURLToPath(new URL('../../../database/migrations/', import.meta.url)),
          ),
          'down',
        ),
      ).rejects.toThrow('CHAT_TIMELINE_NOT_EMPTY');
    } finally {
      rc.release();
    }
    await save('upgrade-restart-preservation', {
      synthetic: true,
      incremental_migration: '003 to 004',
      hosted_restarts: 2,
      old_fixed_login: true,
      researcher_created_login: true,
      password_hashes_unchanged: true,
      assignments_messages_states_exactly_equal: true,
      nonempty_timeline_rollback_refused: true,
      live_render_verified: false,
    });
  } finally {
    await old.end();
    await pool.query('DROP DATABASE legacy_upgrade WITH (FORCE)');
  }
}, 60000);
test('old capture conversations resume from actual successful turns without losing content or being blocked by the old cap', async () => {
  const s = await account(),
    identity = { participantId: s.participantId };
  for (let i = 0; i < 3; i++) {
    const state = await services.participants.current(identity);
    await services.conversations.send(identity, {
      request_id: randomUUID(),
      state_token: state.state_token,
      text: i === 0 ? '我原先认为美国黑人都不重视学习。' : `这个印象来自我看过的新闻内容${i}。`,
    });
  }
  const before = (await services.admin.export(actor, s.experimentId)).messages;
  const n = calls;
  await start(s);
  expect((await bundle(s))!.snapshot.stage).toBe('VIEWPOINT_CONFIRMATION');
  expect(calls).toBe(n);
  expect((await services.admin.export(actor, s.experimentId)).messages).toEqual(before);
  expect((await history(s))[0]!.text).toBe(before[0]!.content);
  expect((await current(s)).confirmation_card.belief).toBe('我原先认为美国黑人都不重视学习。');
  expect(
    (await submit(s, { viewpoint: '我原先认为美国黑人都不重视学习。', confirmed: true })).status,
  ).toBe(200);
});
