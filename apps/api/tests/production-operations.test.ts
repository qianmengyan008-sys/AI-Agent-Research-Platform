import { test, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { createProductionPreparation } from '../../../scripts/production-preparation.mjs';
import { encryptBackup, decryptBackup } from '../../../scripts/encrypted-backup.mjs';
import { runProductionBackup } from '../../../scripts/production-backup-job.mjs';
import { createHostedPlatform } from '../../../scripts/hosted-platform.mjs';
const image =
  'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
test('production preparation fails closed, never bootstraps experiments, and rejects staging/nonempty databases', async () => {
  const name = 'production-gate-' + randomUUID();
  let pool: pg.Pool | undefined;
  let created = false;
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
        'POSTGRES_PASSWORD=OFFLINE_GATE',
        image,
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
    const admin = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'OFFLINE_GATE',
      database: 'postgres',
    });
    try {
      for (let i = 0; i < 60; i++) {
        try {
          await admin.query('SELECT 1');
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      await admin.query('CREATE DATABASE ai_agent_research_production');
    } finally {
      await admin.end();
    }
    pool = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'OFFLINE_GATE',
      database: 'ai_agent_research_production',
    });
    const env = {
      RESEARCH_DATABASE_SCOPE: 'isolated-production',
      RESEARCH_RECRUITMENT_ENABLED: 'false',
      PRODUCTION_DATABASE_NAME: 'ai_agent_research_production',
    };
    for (const value of ['true', '1', '', undefined])
      expect(() =>
        createProductionPreparation({ ...env, RESEARCH_RECRUITMENT_ENABLED: value }, pool!),
      ).toThrow('PRODUCTION_PREPARATION_GATE_REJECTED');
    expect(() =>
      createProductionPreparation({ ...env, RESEARCH_DATABASE_SCOPE: 'isolated-staging' }, pool!),
    ).toThrow();
    const app = createProductionPreparation(env, pool);
    const ready = await request(app).get('/api/ready').expect(200);
    expect(ready.body.formal_ready).toBe(false);
    expect(ready.body.recruitment_enabled).toBe(false);
    await request(app).post('/api/auth/login').send({}).expect(503);
    await request(app).get('/api/admin/export').expect(503);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema IN ('public','research')",
        )
      ).rows[0].n,
    ).toBe(0);
    await pool.query('CREATE TABLE public.existing_data(id integer)');
    await request(app).get('/api/ready').expect(503);
    expect((await pool.query("SELECT to_regclass('public.existing_data') AS t")).rows[0].t).toBe(
      'existing_data',
    );
    if (process.env.ROUND35_ACCEPTANCE_DIR)
      await writeFile(
        join(process.env.ROUND35_ACCEPTANCE_DIR, 'production-gate.json'),
        JSON.stringify(
          {
            status: 'PASS',
            mode: 'infrastructure-only',
            formal_ready: false,
            recruitment_disabled: true,
            empty_database_verified: true,
            staging_scope_refused: true,
            nonempty_database_refused_without_mutation: true,
            participant_and_export_routes_closed: true,
            model_calls: 0,
          },
          null,
          2,
        ) + '\n',
      );
  } finally {
    await pool?.end();
    if (created) execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
  }
}, 30000);

test('encrypted PostgreSQL dump restores exact experiment records, valid exports and isolation into a new local database; tampering and overwrite fail', async () => {
  const name = 'backup-drill-' + randomUUID(),
    directory = await mkdtemp(join(tmpdir(), 'research-backup-drill-'));
  let pool: pg.Pool | undefined,
    restoredPool: pg.Pool | undefined,
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
        'POSTGRES_PASSWORD=OFFLINE_DRILL',
        image,
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
    const connection = { host: '127.0.0.1', port, user: 'postgres', password: 'OFFLINE_DRILL' };
    pool = new pg.Pool({ ...connection, database: 'postgres' });
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
      ADMIN_ACCESS_TOKEN: 'OFFLINE_DRILL_ADMIN_32_CHARS_SECRET',
      RESEARCH_BOOTSTRAP_SECRET: 'OFFLINE_DRILL_SEED_32_CHARS_SECRET',
      DEEPSEEK_API_KEY: 'OFFLINE_DRILL_KEY',
      MODEL_PROVIDER: 'deepseek',
      DEEPSEEK_MODEL_NAME: 'deepseek-flash',
      RESEARCH_BOOTSTRAP_BATCH: 'B900',
      RESEARCH_BOOTSTRAP_COUNT: '3',
      ADMIN_DEVELOPMENT_MODE: 'true',
    };
    const options = {
      env,
      poolOverride: pool,
      modelTransportOverride: async () =>
        new Response(
          JSON.stringify({
            model: 'offline-restore-identity',
            choices: [{ message: { content: '我理解这段表达，你愿意补充一些当前背景吗？' } }],
          }),
        ),
    };
    const original = await createHostedPlatform(options);
    for (const a of original.seed.accounts) {
      const login = await request(original.app)
        .post('/api/auth/login')
        .send({
          experiment_id: original.seed.experiment_id,
          participant_code: a.participant_code,
          password: a.password,
        })
        .expect(200);
      await request(original.app)
        .post('/api/conversation/start')
        .auth(login.body.token, { type: 'bearer' })
        .send({})
        .expect(200);
      const state = await request(original.app)
        .get('/api/experiment/current')
        .auth(login.body.token, { type: 'bearer' })
        .expect(200);
      await request(original.app)
        .post('/api/conversation/message')
        .auth(login.body.token, { type: 'bearer' })
        .send({
          state_token: state.body.state_token,
          request_id: 'drill-turn',
          text:
            a.path === 'emotion_v1'
              ? 'Marcus喜欢音乐，李阳慢热，希望继续了解他们。'
              : '当前独立表达' + a.participant_code,
        })
        .expect(200);
      if (a.path === 'cognitive_v1') {
        const after = await request(original.app)
          .get('/api/experiment/current')
          .auth(login.body.token, { type: 'bearer' })
          .expect(200);
        const data: Record<string, unknown> = {};
        for (const f of after.body.form.fields)
          data[f.name] =
            f.kind === 'confirmation'
              ? true
              : f.kind === 'number'
                ? 40
                : '当前明确表达' + a.participant_code;
        await request(original.app)
          .post('/api/experiment/submissions')
          .auth(login.body.token, { type: 'bearer' })
          .send({ state_token: after.body.state_token, request_id: 'drill-submit', data })
          .expect(200);
      }
    }
    const actor = { role: 'admin' as const, id: 'restore-drill' };
    const before = await original.services.admin.export(actor, original.seed.experiment_id);
    expect(before.complete).toBe(true);
    expect(before.variables.length).toBeGreaterThan(0);
    expect(before.runs.length).toBe(3);
    const tables = (
      await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='research' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename as string);
    const counts = async (p: pg.Pool) => {
      const result: Record<string, number> = {};
      for (const table of tables) {
        if (!/^[a-z_]+$/.test(table)) throw Error('INVALID_TEST_TABLE');
        result[table] = (
          await p.query('SELECT count(*)::int AS n FROM research.' + table)
        ).rows[0].n;
      }
      return result;
    };
    const beforeCounts = await counts(pool);
    const dump = join(directory, 'source.dump'),
      enc = join(directory, 'source.enc'),
      out = join(directory, 'verified.dump');
    await writeFile(
      dump,
      execFileSync(
        'docker',
        [
          'exec',
          name,
          'pg_dump',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-Fc',
          '--no-owner',
          '--no-acl',
        ],
        { maxBuffer: 16777216 },
      ),
      { mode: 0o600 },
    );
    const key = randomBytes(32).toString('base64');
    const envelope = await encryptBackup(dump, enc, key);
    expect((await stat(enc)).mode & 0o777).toBe(0o600);
    await expect(decryptBackup(enc, out, randomBytes(32).toString('base64'))).rejects.toThrow();
    await expect(stat(out)).rejects.toThrow();
    const tampered = await readFile(enc);
    const originalByte = tampered[25];
    if (originalByte === undefined) throw Error('BACKUP_TOO_SHORT');
    tampered[25] = originalByte ^ 1;
    await writeFile(join(directory, 'tampered.enc'), tampered);
    await expect(decryptBackup(join(directory, 'tampered.enc'), out, key)).rejects.toThrow();
    await decryptBackup(enc, out, key);
    expect(await readFile(out)).toEqual(await readFile(dump));
    await expect(decryptBackup(enc, out, key)).rejects.toThrow();
    await expect(encryptBackup(dump, enc, key)).rejects.toThrow();
    await pool.query('CREATE DATABASE restored_drill');
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        name,
        'pg_restore',
        '-U',
        'postgres',
        '-d',
        'restored_drill',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
      ],
      { input: await readFile(out), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    restoredPool = new pg.Pool({ ...connection, database: 'restored_drill' });
    expect(await counts(restoredPool)).toEqual(beforeCounts);
    expect(
      (
        await restoredPool.query(
          'SELECT count(*)::int AS n FROM pg_constraint WHERE NOT convalidated',
        )
      ).rows[0].n,
    ).toBe(0);
    const restored = await createHostedPlatform({ ...options, poolOverride: restoredPool });
    const after = await restored.services.admin.export(actor, restored.seed.experiment_id);
    const snapshot = (x: typeof before) =>
      JSON.stringify({
        notices: x.notices,
        states: x.states,
        messages: x.messages,
        variables: x.variables,
        runs: x.runs,
        turns: x.turns,
        transitions: x.transitions,
      });
    expect(before.notices.length).toBeGreaterThanOrEqual(4);
    expect(snapshot(after)).toBe(snapshot(before));
    expect(after.complete).toBe(true);
    expect(after.data_quality.passed).toBe(true);
    const a = restored.seed.accounts[0],
      b = restored.seed.accounts[1];
    if (!a || !b) throw Error('RESTORE_ACCOUNTS_MISSING');
    const login = await request(restored.app)
      .post('/api/auth/login')
      .send({
        experiment_id: restored.seed.experiment_id,
        participant_code: a.participant_code,
        password: a.password,
      })
      .expect(200);
    const history = await request(restored.app)
      .get('/api/conversation/messages')
      .auth(login.body.token, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(history.body)).not.toContain(b.participant_id);
    expect(history.body).toHaveLength(4); // 2 durable messages plus greeting and approved task notice
    expect(history.body[0].text).toBe(
      '嗨，很高兴认识你！我平时很关注时事新闻，也特别想听听你的看法。你现在方便聊几句吗？',
    );
    await request(restored.app)
      .get('/api/admin/export?experiment_id=' + restored.seed.experiment_id)
      .auth(login.body.token, { type: 'bearer' })
      .expect(401);
    if (process.env.ROUND35_ACCEPTANCE_DIR)
      await writeFile(
        join(process.env.ROUND35_ACCEPTANCE_DIR, 'local-backup-restore.json'),
        JSON.stringify(
          {
            status: 'PASS',
            source: 'local disposable PostgreSQL17 synthetic experiment',
            target: 'new isolated local database',
            offsite_restore_verified: false,
            encrypted_envelope: envelope.format,
            ciphertext_sha256: envelope.sha256,
            all_table_counts_equal: true,
            table_counts: beforeCounts,
            experiment_snapshot_sha256: createHash('sha256').update(snapshot(after)).digest('hex'),
            message_state_variable_model_logs_equal: true,
            complete_export: true,
            integrity: true,
            restored_relogin_and_participant_isolation: true,
            participant_admin_export_denied: true,
            tamper_and_wrong_key_rejected: true,
            destination_overwrite_rejected: true,
            external_model_calls: 0,
          },
          null,
          2,
        ) + '\n',
      );
  } finally {
    await restoredPool?.end();
    await pool?.end();
    if (created) execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);

test('backup failure stays non-successful and distinguishes delivered from failed alerts without leaking diagnostics', async () => {
  const transport = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
  vi.stubGlobal('fetch', transport);
  try {
    await expect(
      runProductionBackup({ BACKUP_ALERT_WEBHOOK_URL: 'https://alerts.invalid/backup' }),
    ).rejects.toMatchObject({ message: 'PRODUCTION_BACKUP_FAILED', alertDelivered: false });
    transport.mockImplementation(async () => new Response('', { status: 200 }));
    await expect(
      runProductionBackup({ BACKUP_ALERT_WEBHOOK_URL: 'https://alerts.invalid/backup' }),
    ).rejects.toMatchObject({ message: 'PRODUCTION_BACKUP_FAILED', alertDelivered: true });
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({
      event: 'PRODUCTION_BACKUP_FAILED',
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
