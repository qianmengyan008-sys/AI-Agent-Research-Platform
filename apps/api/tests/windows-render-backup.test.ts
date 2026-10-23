import { beforeAll, afterAll, test, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  appendFile,
  copyFile,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { MockAdapter } from '@research/model-adapter';
import { createHostedPlatform } from '../../../scripts/hosted-platform.mjs';

const image =
  'postgres:18-bookworm@sha256:bbf83594798e144bff365a9c191c5d779f181fb3135902064ab8ff11918020fc';
const name = 'windows-backup-fixture-' + randomUUID();
const pwsh = process.env.PWSH_EXECUTABLE_PATH ?? 'pwsh';
let directory: string, bin: string, root: string, port: number, pool: pg.Pool, dump: string;
let created = false;
const outcomes: Record<string, unknown>[] = [];
function run(operation: string, extra: string[] = [], tools = bin) {
  const r = spawnSync(
    pwsh,
    [
      '-NoProfile',
      '-File',
      resolve('tools/windows-render-backup/tests/Run-Synthetic.ps1'),
      '-Operation',
      operation,
      '-PgBin',
      tools,
      '-Root',
      root,
      '-Port',
      String(port),
      '-NodePath',
      process.execPath,
      ...extra,
    ],
    {
      encoding: 'utf8',
      timeout: 60000,
      env: {
        ...process.env,
        XDG_CACHE_HOME: join(directory, 'cache'),
        XDG_DATA_HOME: join(directory, 'data'),
        XDG_CONFIG_HOME: join(directory, 'config'),
        LD_LIBRARY_PATH: join(bin, 'lib'),
      },
    },
  );
  outcomes.push({ operation, exit_code: r.status, stdout: r.stdout, stderr: r.stderr });
  expect((r.stdout ?? '') + (r.stderr ?? '')).not.toContain('SYNTHETIC_DUMP_PASSWORD');
  return r;
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'round45-windows-fixture-'));
  bin = join(directory, 'bin');
  root = join(directory, 'private backups with spaces');
  await mkdir(join(bin, 'lib'), { recursive: true });
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '--tmpfs',
      '/var/lib/postgresql',
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD=SYNTHETIC_DUMP_PASSWORD',
      image,
    ],
    { stdio: 'pipe' },
  );
  created = true;
  for (const file of ['pg_dump', 'pg_restore']) {
    execFileSync('docker', ['cp', `${name}:/usr/lib/postgresql/18/bin/${file}`, join(bin, file)]);
  }
  for (const library of ['libpq.so.5', 'libldap-2.5.so.0', 'liblber-2.5.so.0', 'libsasl2.so.2']) {
    execFileSync('docker', [
      'cp',
      '-L',
      `${name}:/usr/lib/x86_64-linux-gnu/${library}`,
      join(bin, 'lib', library),
    ]);
  }
  execFileSync(join(bin, 'pg_dump'), ['--version'], {
    env: { ...process.env, LD_LIBRARY_PATH: join(bin, 'lib') },
  });
  port = Number(
    execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .at(-1),
  );
  const admin = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'SYNTHETIC_DUMP_PASSWORD',
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
    await admin.query('CREATE DATABASE ai_agent_research');
    await admin.query('CREATE DATABASE restored_fixture');
  } finally {
    await admin.end();
  }
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'SYNTHETIC_DUMP_PASSWORD',
    database: 'ai_agent_research',
  });
  const hosted = await createHostedPlatform({
    poolOverride: pool,
    generatorOverride: new MockAdapter('这个观点具体，你从哪里了解到的？'),
    env: {
      RESEARCH_DATABASE_SCOPE: 'isolated-staging',
      ADMIN_ACCESS_TOKEN: 'SYNTHETIC_ADMIN_45_32_CHARS_ONLY_FIXTURE',
      RESEARCH_BOOTSTRAP_SECRET: 'SYNTHETIC_BOOTSTRAP_45_32_CHARS_ONLY',
      DEEPSEEK_API_KEY: 'SYNTHETIC_UNUSED',
      MODEL_PROVIDER: 'deepseek',
      RESEARCH_BOOTSTRAP_BATCH: 'B945',
      RESEARCH_BOOTSTRAP_COUNT: '3',
    },
  });
  const a = hosted.seed.accounts[0]!;
  const login = await request(hosted.app)
    .post('/api/auth/login')
    .send({
      experiment_id: hosted.seed.experiment_id,
      participant_code: a.participant_code,
      password: a.password,
    })
    .expect(200);
  await request(hosted.app)
    .post('/api/conversation/start')
    .auth(login.body.token, { type: 'bearer' })
    .send({})
    .expect(200);
  const state = await request(hosted.app)
    .get('/api/experiment/current')
    .auth(login.body.token, { type: 'bearer' })
    .expect(200);
  await request(hosted.app)
    .post('/api/conversation/message')
    .auth(login.body.token, { type: 'bearer' })
    .send({
      state_token: state.body.state_token,
      request_id: 'synthetic-backup-message',
      interaction: 'chat',
      text: '这是一段仅用于本地备份测试的合成表达。',
    })
    .expect(200);
}, 60000);

afterAll(async () => {
  if (pool) await pool.end();
  if (created) execFileSync('docker', ['stop', name], { stdio: 'pipe' });
  if (process.env.ROUND45_ACCEPTANCE_DIR) {
    await mkdir(process.env.ROUND45_ACCEPTANCE_DIR, { recursive: true });
    await writeFile(
      join(process.env.ROUND45_ACCEPTANCE_DIR, 'powershell-synthetic-executions.json'),
      JSON.stringify(
        {
          scope:
            'local PostgreSQL18 and PowerShell7 Linux synthetic tests, not native Windows or Render',
          directory_disposable: true,
          operations: outcomes,
        },
        null,
        2,
      ) + '\n',
    );
  }
}, 30000);

test('PowerShell parses and enforces PG18, real-host TLS, no-IP and fixture-only loopback boundaries', () => {
  const r = run('guards');
  expect(r.status, r.stderr + r.stdout).toBe(0);
  expect(r.stdout).toContain('GUARDS_OK');
});
test('receipt metadata and atomic-publication negative probes all pass without weakening their failure assertions', () => {
  const r = run('review');
  expect(r.status, r.stderr + r.stdout).toBe(0);
  expect(r.stdout).toContain('True: Verify rejects empty original SHA256');
  expect(r.stdout).toContain('True: Receipt write failure leaves no success-looking receipt');
  expect(r.stdout).toContain('True: Receipt failure safely cleaned: cleanup-failure');
  expect(r.stdout).not.toContain('False:');
}, 60000);
test('prepare verifies actual PG18 dump/restore clients without connecting or creating backup directories', async () => {
  const r = run('prepare');
  expect(r.status, r.stderr + r.stdout).toBe(0);
  expect(r.stdout).toContain('PREPARE_OK');
  await expect(readdir(root)).rejects.toThrow();
});
test('prepare rejects a PG17 client before reading a URL or connecting', async () => {
  const bad = join(directory, 'bad-bin');
  await mkdir(bad);
  await writeFile(join(bad, 'pg_dump'), '#!/bin/sh\nprintf "pg_dump (PostgreSQL) 17.7\\n"\n');
  await chmod(join(bad, 'pg_dump'), 0o700);
  await copyFile(join(bin, 'pg_restore'), join(bad, 'pg_restore'));
  const r = run('prepare', [], bad);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('PREPARE_FAILED');
});
test('the real PowerShell backup script creates a full PG18 custom dump and redacted checksum receipt', async () => {
  const r = run('backup');
  expect(r.status, r.stderr + r.stdout).toBe(0);
  expect(r.stdout).toContain('BACKUP_OK');
  const runs = await readdir(root);
  expect(runs).toHaveLength(1);
  dump = join(root, runs[0]!, 'staging.dump');
  const bytes = await readFile(dump);
  const receiptText = await readFile(join(root, runs[0]!, 'staging.receipt.json'), 'utf8');
  const receipt = JSON.parse(receiptText);
  expect(bytes.subarray(0, 5).toString()).toBe('PGDMP');
  expect(receipt.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(receipt.bytes).toBe(bytes.length);
  expect(receipt.bytes).toBeGreaterThan(0);
  expect(receipt.source_postgres_major).toBe(18);
  expect(receipt.pg_restore_list_exit_code).toBe(0);
  expect(receipt.object_summary.migration_ledger_data_present).toBe(true);
  expect(receipt.scope).toBe('synthetic-local-pg18');
  expect(receipt.full_restore_verified).toBe(false);
  expect(receiptText).not.toMatch(/127\.0\.0\.1|SYNTHETIC_DUMP_PASSWORD|postgresql:\/\//);
  if (process.env.ROUND45_ACCEPTANCE_DIR)
    await writeFile(
      join(process.env.ROUND45_ACCEPTANCE_DIR, 'synthetic-backup.receipt.json'),
      receiptText,
    );
});
test('Verify independently compares checksum and reads archive, without claiming a restore', () => {
  const r = run('verify', ['-DumpFile', dump]);
  expect(r.status, r.stderr + r.stdout).toBe(0);
  expect(r.stdout).toContain('VERIFY_OK');
});
test('real PG18 archive accepts an uppercase hash and rejects malformed metadata, mismatched size and failed-list receipts', async () => {
  const source = JSON.parse(await readFile(join(dump, '..', 'staging.receipt.json'), 'utf8'));
  const folder = join(root, 'receipt-metadata');
  await mkdir(folder);
  const copy = join(folder, 'staging.dump');
  const receipt = join(folder, 'staging.receipt.json');
  await copyFile(dump, copy);
  await writeFile(receipt, JSON.stringify({ ...source, sha256: source.sha256.toUpperCase() }));
  const valid = run('verify', ['-DumpFile', copy]);
  expect(valid.status, valid.stderr + valid.stdout).toBe(0);
  for (const change of [
    { sha256: '' },
    { sha256: null },
    { sha256: 'g'.repeat(64) },
    { bytes: String(source.bytes) },
    { bytes: source.bytes + 1 },
    { pg_dump_exit_code: '0' },
    { pg_restore_list_exit_code: 1 },
  ]) {
    await writeFile(receipt, JSON.stringify({ ...source, ...change }));
    const rejected = run('verify', ['-DumpFile', copy]);
    expect(rejected.status, rejected.stderr + rejected.stdout).toBe(1);
    expect(rejected.stdout).toContain('VERIFY_FAILED');
    expect(rejected.stdout).not.toContain('VERIFY_OK');
  }
}, 30000);
test('a wrong connection leaves no successful receipt or partial dump and does not leak credentials', async () => {
  const r = run('bad-connection');
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('BACKUP_FAILED');
  for (const folder of await readdir(root)) {
    const files = await readdir(join(root, folder));
    expect(files.includes('staging.dump')).toBe(files.includes('staging.receipt.json'));
  }
});
test('a changed dump is rejected against the saved receipt', async () => {
  const changed = join(root, 'changed');
  await mkdir(changed);
  await copyFile(dump, join(changed, 'staging.dump'));
  await copyFile(join(dump, '..', 'staging.receipt.json'), join(changed, 'staging.receipt.json'));
  await appendFile(join(changed, 'staging.dump'), 'tampered');
  const r = run('verify', ['-DumpFile', join(changed, 'staging.dump')]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('VERIFY_FAILED');
});
test('optional AES256GCM uses stdin-only passphrase and validates an actual decrypt/hash roundtrip', async () => {
  const r = run('encrypt', ['-DumpFile', dump]);
  expect(r.status, r.stderr + r.stdout).toBe(0);
  expect(r.stdout).toContain('ENCRYPT_OK');
  const text = await readFile(dump + '.enc.receipt.json', 'utf8');
  const receipt = JSON.parse(text);
  expect(receipt.encryption).toBe('AIAGBK01-AES256GCM');
  expect(receipt.encryption_roundtrip_verified).toBe(true);
  expect(receipt.sha256).toBe(
    createHash('sha256')
      .update(await readFile(dump + '.enc'))
      .digest('hex'),
  );
  expect(text).not.toContain('SYNTHETIC_ENCRYPTION_ONLY_45');
});
test('synthetic PG18 dump actually restores to an independent database with account hashes and ledger intact', async () => {
  execFileSync('docker', ['cp', dump, `${name}:/tmp/source.dump`]);
  execFileSync('docker', [
    'exec',
    name,
    'pg_restore',
    '-U',
    'postgres',
    '-d',
    'restored_fixture',
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-acl',
    '/tmp/source.dump',
  ]);
  const restored = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'SYNTHETIC_DUMP_PASSWORD',
    database: 'restored_fixture',
  });
  try {
    const tables = (
      await pool.query(
        "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('research','research_meta') AND table_type='BASE TABLE' ORDER BY 1,2",
      )
    ).rows;
    expect(tables.length).toBeGreaterThan(20);
    expect(
      Number((await pool.query('SELECT count(*) AS n FROM research.message')).rows[0].n),
    ).toBeGreaterThan(0);
    for (const row of tables) {
      expect(row.table_schema + '.' + row.table_name).toMatch(/^[a-z_]+\.[a-z_]+$/);
      const table = row.table_schema + '.' + row.table_name;
      const source = await pool.query(`SELECT * FROM ${table}`);
      const target = await restored.query(`SELECT * FROM ${table}`);
      expect(target.rows.map((r) => JSON.stringify(r)).sort()).toEqual(
        source.rows.map((r) => JSON.stringify(r)).sort(),
      );
    }
    if (process.env.ROUND45_ACCEPTANCE_DIR)
      await writeFile(
        join(process.env.ROUND45_ACCEPTANCE_DIR, 'synthetic-pg18-restore.json'),
        JSON.stringify(
          {
            source: 'local disposable synthetic PostgreSQL18',
            target: 'independent restored_fixture database',
            all_tables_compared: tables.length,
            all_row_content_equal: true,
            messages_nonempty: true,
            original_account_hashes_and_assignments_and_ledger_equal: true,
            pg_restore_exit_code: 0,
            render_backup_or_restore: false,
            native_windows: false,
          },
          null,
          2,
        ) + '\n',
      );
  } finally {
    await restored.end();
  }
});
