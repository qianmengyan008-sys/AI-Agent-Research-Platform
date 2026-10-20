/** Review-only job: requires approved private off-site storage and installed PG17/aws tools. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { encryptBackup } from './encrypted-backup.mjs';
const execute = promisify(execFile);
export async function runProductionBackup(env = process.env) {
  let directory;
  try {
    const required = [
      'DATABASE_URL',
      'BACKUP_KEY_BASE64',
      'BACKUP_KEY_ID',
      'BACKUP_BUCKET',
      'BACKUP_SOURCE_REGION',
      'AWS_REGION',
      'BACKUP_ALERT_WEBHOOK_URL',
    ];
    if (
      required.some((k) => !env[k]) ||
      env.BACKUP_RETENTION_APPROVED !== 'true' ||
      env.RESEARCH_DATABASE_SCOPE !== 'isolated-production'
    )
      throw Error('BACKUP_CONFIGURATION_PENDING');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(env.BACKUP_KEY_ID)) throw Error('BACKUP_KEY_VERSION_INVALID');
    if (env.BACKUP_SOURCE_REGION === env.AWS_REGION) throw Error('BACKUP_MUST_BE_OFFSITE');
    const db = new URL(env.DATABASE_URL);
    if (
      !['postgres:', 'postgresql:'].includes(db.protocol) ||
      db.pathname !== '/ai_agent_research_production'
    )
      throw Error('PRODUCTION_BACKUP_DATABASE_REQUIRED');
    if (new URL(env.BACKUP_ALERT_WEBHOOK_URL).protocol !== 'https:')
      throw Error('HTTPS_ALERT_REQUIRED');
    if (env.BACKUP_ENDPOINT_URL && new URL(env.BACKUP_ENDPOINT_URL).protocol !== 'https:')
      throw Error('HTTPS_STORAGE_REQUIRED');
    const aws = [
      ...(env.BACKUP_ENDPOINT_URL ? ['--endpoint-url', env.BACKUP_ENDPOINT_URL] : []),
      '--region',
      env.AWS_REGION,
    ];
    const run = (command, args, extra = {}) =>
      execute(command, args, { env: { ...env, ...extra }, timeout: 900000, maxBuffer: 1048576 });
    const api = async (...args) =>
      JSON.parse((await run('aws', [...aws, 's3api', ...args])).stdout || '{}');
    const location =
      (await api('get-bucket-location', '--bucket', env.BACKUP_BUCKET)).LocationConstraint ||
      'us-east-1';
    if (location !== env.AWS_REGION) throw Error('BACKUP_STORAGE_REGION_MISMATCH');
    const block = (await api('get-public-access-block', '--bucket', env.BACKUP_BUCKET))
      .PublicAccessBlockConfiguration;
    if (
      !['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(
        (k) => block?.[k] === true,
      )
    )
      throw Error('PRIVATE_BUCKET_REQUIRED');
    if (
      (await api('get-bucket-policy-status', '--bucket', env.BACKUP_BUCKET)).PolicyStatus
        ?.IsPublic !== false
    )
      throw Error('PRIVATE_POLICY_REQUIRED');
    if ((await api('get-bucket-versioning', '--bucket', env.BACKUP_BUCKET)).Status !== 'Enabled')
      throw Error('BUCKET_VERSIONING_REQUIRED');
    directory = await mkdtemp(join(tmpdir(), 'production-backup-'));
    const dump = join(directory, 'database.dump'),
      encrypted = join(directory, 'database.enc');
    const version = (await run('pg_dump', ['--version'])).stdout;
    if (!/\b17\./.test(version)) throw Error('PG17_CLIENT_REQUIRED');
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dump], {
      PGHOST: db.hostname,
      PGPORT: db.port || '5432',
      PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
      PGUSER: decodeURIComponent(db.username),
      PGPASSWORD: decodeURIComponent(db.password),
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: env.PGSSLROOTCERT || 'system',
      PGCONNECT_TIMEOUT: '15',
    });
    const envelope = await encryptBackup(dump, encrypted, env.BACKUP_KEY_BASE64);
    await rm(dump);
    const date = new Date().toISOString().slice(0, 10),
      id = randomUUID();
    const manifest = join(directory, 'manifest.json');
    await writeFile(
      manifest,
      JSON.stringify({
        ...envelope,
        date,
        backup_id: id,
        key_id: env.BACKUP_KEY_ID,
        git_commit: env.RENDER_GIT_COMMIT || env.DEPLOY_GIT_COMMIT || null,
        format: 'pg17-custom-inside-AIAGBK01',
        database_scope: 'isolated-production',
      }),
      { mode: 0o600 },
    );
    for (const period of ['daily', ...(date.endsWith('-01') ? ['monthly'] : [])]) {
      const prefix = `research-production/${period}/${date}/${id}`;
      for (const [suffix, body] of [
        ['.enc', encrypted],
        ['.json', manifest],
      ])
        await api(
          'put-object',
          '--bucket',
          env.BACKUP_BUCKET,
          '--key',
          prefix + suffix,
          '--body',
          body,
          '--server-side-encryption',
          'AES256',
        );
      const head = await api(
        'head-object',
        '--bucket',
        env.BACKUP_BUCKET,
        '--key',
        prefix + '.enc',
      );
      if (head.ContentLength !== envelope.bytes) throw Error('BACKUP_REMOTE_SIZE_MISMATCH');
    }
    return {
      status: 'uploaded',
      backup_id: id,
      encrypted_bytes: envelope.bytes,
      sha256: envelope.sha256,
      restore_verified: false,
    };
  } catch {
    let alertDelivered = false;
    try {
      if (
        env.BACKUP_ALERT_WEBHOOK_URL &&
        new URL(env.BACKUP_ALERT_WEBHOOK_URL).protocol === 'https:'
      ) {
        const response = await fetch(env.BACKUP_ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'PRODUCTION_BACKUP_FAILED' }),
          signal: AbortSignal.timeout(10000),
        });
        alertDelivered = response.ok;
      }
    } catch {
      /* Nonzero job outcome remains visible even if alert delivery fails. */
    }
    const failure = Error('PRODUCTION_BACKUP_FAILED');
    failure.alertDelivered = alertDelivered;
    throw failure;
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await runProductionBackup()));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: 'PRODUCTION_BACKUP_FAILED',
        alert_delivered: error.alertDelivered === true,
      }),
    );
    process.exitCode = 1;
  }
}
