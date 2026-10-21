import { test, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { MockAdapter } from '@research/model-adapter';
import { loginWorkbook } from '../src/services/login-workbook.js';
import { createServices } from '../src/services/index.js';
import { createApp } from '../src/app.js';
import { migrate, loadMigrations } from '../../../packages/database/src/migrations.js';
import { fileURLToPath } from 'node:url';
const actor = { role: 'admin' as const, id: 'account-management-acceptance' };
const settings = {
  provider: 'mock' as const,
  model_name: 'synthetic-account-model',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 2000,
  max_attempts: 2,
};
test('30 random-password accounts are assigned atomically, opened with an independent Excel reader, isolated, and reset without storing plaintext', async () => {
  const name = 'account-batch-' + randomUUID();
  let pool: pg.Pool | undefined,
    created = false;
  try {
    execFileSync(
      'docker',
      [
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
        'POSTGRES_PASSWORD=OFFLINE_ACCOUNTS',
        'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2',
      ],
      { stdio: 'pipe' },
    );
    created = true;
    const port = Number(
      execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' })
        .trim()
        .split(':')
        .at(-1),
    );
    pool = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'OFFLINE_ACCOUNTS',
      database: 'postgres',
    });
    for (let i = 0; i < 60; i++) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
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
    const services = createServices(
      pool,
      new MockAdapter('谢谢你的分享，可以继续补充你的想法。'),
      settings,
    );
    const admin = 'OFFLINE_BATCH_ADMIN_32_CHARACTERS';
    const app = createApp(services, createHash('sha256').update(admin).digest('hex'));
    const e = await services.experiments.create(actor, {
      name: '合成账号验收，仅临时本地数据库',
      instructions: '合成测试，非正式研究。',
    });
    const condition = await services.experiments.condition(actor, e.experimentId, {
      code: 'GROUP-A',
      path_version: 'daily_v1',
      agent_name: '合成智能体甲',
      participant_display: {
        identity: '用于分配隔离验收的合成身份甲',
        avatar: '/agent-avatars/synthetic-a.svg',
      },
      demo_policies: true,
    });
    await services.experiments.publish(actor, e.experimentId);
    const modelBefore = (
      await pool.query(
        'SELECT configuration FROM research.template_version WHERE experiment_id=$1',
        [e.experimentId],
      )
    ).rows[0].configuration.model;
    const input = {
      experiment_id: e.experimentId,
      condition_id: condition.conditionId,
      count: 30,
      prefix: 'SYNTHETIC',
      start: 1,
      request_id: randomUUID(),
    };
    const file = await request(app)
      .post('/api/admin/account-batches')
      .auth(admin, { type: 'bearer' })
      .send(input)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (b) => chunks.push(Buffer.from(b)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(201);
    expect(file.headers['cache-control']).toBe('no-store');
    expect(file.headers['content-type']).toContain('spreadsheetml');
    const workbook = file.body as Buffer;
    // Independent common office reader, not the ZIP writer's implementation.
    const read = (bytes: Buffer) =>
      JSON.parse(
        execFileSync(
          'python',
          [
            '-c',
            'import sys,io,json,openpyxl; w=openpyxl.load_workbook(io.BytesIO(sys.stdin.buffer.read()),read_only=True,data_only=False); print(json.dumps(list(w.active.values),ensure_ascii=False))',
          ],
          { input: bytes, encoding: 'utf8' },
        ),
      ) as string[][];
    const cells = read(workbook),
      headers = cells[0]!;
    expect(cells).toHaveLength(31);
    expect(headers).toContain('initial_password');
    expect(headers).not.toContain('messages');
    const rows = cells
      .slice(1)
      .map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i]!])));
    expect(new Set(rows.map((r) => r.participant_code)).size).toBe(30);
    expect(new Set(rows.map((r) => r.initial_password)).size).toBe(30);
    expect(
      rows.every(
        (r) =>
          r.study_path === 'daily' &&
          r.condition === 'GROUP-A' &&
          r.agent === '合成智能体甲' &&
          r.experiment_id === e.experimentId &&
          r.model_batch === 'mock / synthetic-account-model',
      ),
    ).toBe(true);
    await request(app)
      .post('/api/admin/account-batches')
      .auth(admin, { type: 'bearer' })
      .send(input)
      .expect(409);
    await request(app)
      .post('/api/admin/account-batches')
      .auth(admin, { type: 'bearer' })
      .send({ ...input, request_id: randomUUID(), condition_id: randomUUID() })
      .expect(400);
    await request(app)
      .post('/api/admin/account-batches')
      .send({ ...input, request_id: randomUUID() })
      .expect(401);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM research.participant')).rows[0].n,
    ).toBe(30);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM research.experiment_assignment WHERE condition_id=$1',
          [condition.conditionId],
        )
      ).rows[0].n,
    ).toBe(30);
    const selected = [rows[0]!, rows[29]!];
    const users = await Promise.all(
      selected.map(async (r) => {
        const auth = await request(app)
          .post('/api/auth/login')
          .send({
            experiment_id: r.experiment_id,
            participant_code: r.participant_code,
            password: r.initial_password,
          })
          .expect(200);
        const current = await request(app)
          .get('/api/experiment/current')
          .auth(auth.body.token, { type: 'bearer' })
          .expect(200);
        expect(current.body.agent).toEqual({
          name: '合成智能体甲',
          identity: '用于分配隔离验收的合成身份甲',
          avatar: '/agent-avatars/synthetic-a.svg',
        });
        return { row: r, token: auth.body.token, current: current.body };
      }),
    );
    const turns = await Promise.all(
      users.map(
        async (u) =>
          (
            await request(app)
              .post('/api/conversation/message')
              .auth(u.token, { type: 'bearer' })
              .send({
                state_token: u.current.state_token,
                request_id: 'same-request-isolated',
                text: '今天的独立表达 ' + u.row.participant_code,
              })
              .expect(200)
          ).body,
      ),
    );
    for (let i = 0; i < users.length; i++) {
      const u = users[i]!,
        other = users[1 - i]!;
      const history = await request(app)
        .get('/api/conversation/messages')
        .auth(u.token, { type: 'bearer' })
        .expect(200);
      expect(JSON.stringify(history.body)).toContain(u.row.participant_code);
      expect(JSON.stringify(history.body)).not.toContain(other.row.participant_code);
      await request(app)
        .get('/api/conversation/turns/' + turns[1 - i].turn_id)
        .auth(u.token, { type: 'bearer' })
        .expect(404);
      await request(app)
        .get('/api/admin/account-options?experiment_id=' + e.experimentId)
        .auth(u.token, { type: 'bearer' })
        .expect(401);
      await request(app)
        .post('/api/admin/account-batches')
        .auth(u.token, { type: 'bearer' })
        .send(input)
        .expect(401);
    }
    const p = (
      await pool.query('SELECT id FROM research.participant WHERE participant_code=$1', [
        users[0]!.row.participant_code,
      ])
    ).rows[0];
    const reset = await services.accounts.reset(actor, p.id);
    const resetCells = read(reset),
      fresh = Object.fromEntries(resetCells[0]!.map((h, i) => [h, resetCells[1]![i]]));
    expect(fresh.participant_code).toBe(users[0]!.row.participant_code);
    await request(app)
      .post('/api/auth/login')
      .send({
        experiment_id: e.experimentId,
        participant_code: users[0]!.row.participant_code,
        password: users[0]!.row.initial_password,
      })
      .expect(401);
    await request(app)
      .get('/api/experiment/current')
      .auth(users[0]!.token, { type: 'bearer' })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({
        experiment_id: e.experimentId,
        participant_code: fresh.participant_code,
        password: fresh.initial_password,
      })
      .expect(200);
    // Other participant remains authenticated; records are not reset.
    await request(app)
      .get('/api/experiment/current')
      .auth(users[1]!.token, { type: 'bearer' })
      .expect(200);
    expect((await pool.query('SELECT count(*)::int AS n FROM research.message')).rows[0].n).toBe(4);
    const stored =
      JSON.stringify((await pool.query('SELECT password_hash FROM research.participant')).rows) +
      (await pool.query('SELECT reason FROM research.admin_event')).rows
        .map((r) => r.reason)
        .join('');
    for (const r of rows) expect(stored.includes(r.initial_password!)).toBe(false);
    const exported = await services.admin.export(actor, e.experimentId);
    expect(exported.complete).toBe(true);
    for (const r of rows)
      expect(JSON.stringify(exported).includes(r.initial_password!)).toBe(false);
    expect(
      (
        await pool.query(
          'SELECT configuration FROM research.template_version WHERE experiment_id=$1',
          [e.experimentId],
        )
      ).rows[0].configuration.model,
    ).toEqual(modelBefore);
    if (process.env.ROUND38_ACCEPTANCE_DIR) {
      await writeFile(
        join(process.env.ROUND38_ACCEPTANCE_DIR, 'synthetic-login-accounts.xlsx'),
        workbook,
      );
      await writeFile(
        join(process.env.ROUND38_ACCEPTANCE_DIR, 'account-acceptance.json'),
        JSON.stringify(
          {
            status: 'PASS',
            synthetic: true,
            database_destroyed_after_test: true,
            created: 30,
            unique_usernames: 30,
            unique_random_passwords: 30,
            office_reader: 'openpyxl',
            excel_rows: 30,
            excel_is_credentials_only: true,
            real_http_logins: 2,
            concurrent_message_and_state_isolation: true,
            participant_admin_access_denied: true,
            repeated_batch_rejected_atomically: true,
            wrong_condition_rejected_without_partial_accounts: true,
            password_reset_and_old_session_revocation: true,
            other_account_unaffected: true,
            no_plaintext_in_database_or_analysis_export: true,
            model_binding_unchanged: true,
            external_model_calls: 0,
          },
          null,
          2,
        ) + '\n',
      );
    }
  } finally {
    await pool?.end();
    if (created) execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
  }
}, 90000);

test('login workbook preserves text and escaped metadata without spreadsheet formula execution', () => {
  const bytes = loginWorkbook([
    {
      experiment_id: 'SYNTHETIC-ONLY',
      participant_code: 'SYNTHETIC-ACCOUNT',
      initial_password: 'SYNTHETIC-NOT-A-LIVE-PASSWORD',
      study_path: 'daily',
      condition: 'A & B <group>',
      agent: '=HYPERLINK("https://invalid.example")',
      model_batch: '合成模型',
      batch_id: 'synthetic',
      created_at: '2026-10-21T00:00:00Z',
    },
  ]);
  const parsed = JSON.parse(
    execFileSync(
      'python',
      [
        '-c',
        "import io,sys,json,openpyxl;w=openpyxl.load_workbook(io.BytesIO(sys.stdin.buffer.read()),read_only=True,data_only=False);r=list(w.active.rows)[1];print(json.dumps({'values':[c.value for c in r],'types':[c.data_type for c in r]},ensure_ascii=False))",
      ],
      { input: bytes, encoding: 'utf8' },
    ),
  );
  expect(parsed.values[4]).toBe('A & B <group>');
  expect(parsed.values[5]).toBe('=HYPERLINK("https://invalid.example")');
  expect(parsed.types.every((t: string) => t === 's')).toBe(true);
});
