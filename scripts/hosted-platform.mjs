/** Hosting facade. Reuses unchanged application services/core; no disk-backed research data. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import pg from 'pg';
import { createConfiguredGenerator } from '@research/model-adapter';
import { loadMigrations, migrate } from '../packages/database/src/migrations.ts';
import { createApp } from '../apps/api/src/app.ts';
import { createServices } from '../apps/api/src/services/index.ts';
import { hash, verifyPassword } from '../apps/api/src/services/common.ts';
import { mentorConfig } from '../apps/api/src/services/research-profile.ts';
import { auditedModelTransport } from '../apps/api/src/services/model-transport-audit.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const actor = { role: 'admin', id: 'hosted-staging-bootstrap' };
const paths = [
  ['COG', 'cognitive_v1'],
  ['EMO', 'emotion_v1'],
  ['DAILY', 'daily_v1'],
];
function integer(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('INVALID_HOSTED_SETTING');
  return n;
}
function required(env, name, min = 1) {
  const s = env[name]?.trim();
  if (!s || s.length < min) throw new Error('HOSTED_SECRET_OR_CONFIG_MISSING');
  return s;
}
export async function createHostedPlatform({
  env = process.env,
  generatorOverride,
  poolOverride,
  modelTransportOverride,
} = {}) {
  if (env.RESEARCH_DATABASE_SCOPE !== 'isolated-staging')
    throw new Error('ISOLATED_STAGING_DATABASE_REQUIRED');
  const adminToken = required(env, 'ADMIN_ACCESS_TOKEN', 32),
    seedSecret = required(env, 'RESEARCH_BOOTSTRAP_SECRET', 32);
  const batch = env.RESEARCH_BOOTSTRAP_BATCH ?? 'B001';
  if (!/^B\d{3,6}$/.test(batch)) throw new Error('INVALID_BOOTSTRAP_BATCH');
  const count = integer(env.RESEARCH_BOOTSTRAP_COUNT, 45, 3, 100);
  const modelEnv = {
    ...env,
    MODEL_PROVIDER: env.MODEL_PROVIDER ?? 'deepseek',
    DEEPSEEK_MODEL_NAME: env.DEEPSEEK_MODEL_NAME ?? 'deepseek-flash',
    GPT_MODEL_NAME: env.GPT_MODEL_NAME ?? 'gpt-4',
  };
  if (!['deepseek', 'gpt'].includes(modelEnv.MODEL_PROVIDER))
    throw new Error('HOSTED_PROVIDER_REQUIRED');
  const transport = auditedModelTransport(modelTransportOverride);
  const configured = createConfiguredGenerator(modelEnv, transport);
  // Only server-configured profiles may serve previously pinned batches. No participant switch.
  const profiles = generatorOverride
    ? []
    : ['deepseek', 'gpt']
        .filter(
          (label) =>
            label !== modelEnv.MODEL_PROVIDER &&
            modelEnv[label === 'gpt' ? 'GPT_API_KEY' : 'DEEPSEEK_API_KEY']?.trim(),
        )
        .map((label) =>
          createConfiguredGenerator({ ...modelEnv, MODEL_PROVIDER: label }, transport),
        );
  const pool =
    poolOverride ??
    new pg.Pool({
      connectionString: required(env, 'DATABASE_URL'),
      max: integer(env.DB_POOL_SIZE, 10, 2, 30),
      connectionTimeoutMillis: 10000,
    });
  pool.on('error', () => console.error('HOSTED_DATABASE_CONNECTION_INTERRUPTED'));
  const services = createServices(
    pool,
    generatorOverride ?? configured.generator,
    configured.settings,
    undefined,
    profiles,
  );
  let seed;
  const previewBatches = [];
  try {
    // Refuse unrelated public/research tables before migrating. This is only a new dedicated staging DB.
    const unrelated = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    if (unrelated.rowCount) throw new Error('DATABASE_NOT_ISOLATED');
    const schema = await pool.query("SELECT to_regclass('research.experiment') AS existing");
    if (schema.rows[0].existing) {
      const other = await pool.query(
        "SELECT id FROM research.experiment WHERE name NOT LIKE 'Hosted Research Staging / %' LIMIT 1",
      );
      if (other.rowCount) throw new Error('DATABASE_NOT_ISOLATED');
    }
    const client = await pool.connect();
    try {
      await migrate(client, await loadMigrations(resolve(root, 'database/migrations')));
    } finally {
      client.release();
    }
    const lock = await pool.connect();
    try {
      await lock.query('SELECT pg_advisory_lock(186452029)');
      const name = `Hosted Research Staging / ${batch} / ${mentorConfig.version}`;
      let matches = await pool.query(
        `SELECT e.id,t.id AS template_id,t.configuration,t.status FROM research.experiment e JOIN research.template_version t ON t.experiment_id=e.id WHERE e.name=$1`,
        [name],
      );
      if (matches.rowCount > 1) throw new Error('AMBIGUOUS_HOSTED_BOOTSTRAP');
      let experimentId = matches.rows[0]?.id;
      if (!experimentId) {
        const created = await services.experiments.create(actor, {
          name,
          instructions:
            '内部在线体验。请自然对话，在准备好时明确提交当前填写。评分与观点确认必须本人填写。退出或刷新后可重新登录原账号继续；非正式招募。',
          research_profile: mentorConfig.version,
        });
        experimentId = created.experimentId;
      }
      matches = await pool.query(
        'SELECT configuration FROM research.template_version WHERE experiment_id=$1',
        [experimentId],
      );
      if (
        hash(matches.rows[0].configuration.model) !== hash(configured.settings) ||
        hash(matches.rows[0].configuration.research_config) !== hash(mentorConfig)
      )
        throw new Error('PINNED_RESEARCH_CONFIG_MISMATCH');
      const conditions = {};
      for (const [code, path] of paths) {
        const prior = await pool.query(
          'SELECT id FROM research.condition WHERE experiment_id=$1 AND code=$2',
          [experimentId, code],
        );
        if (prior.rowCount > 1) throw new Error('AMBIGUOUS_HOSTED_BOOTSTRAP');
        conditions[path] =
          prior.rows[0]?.id ??
          (
            await services.experiments.condition(actor, experimentId, {
              code,
              path_version: path,
              agent_name: '研究对话伙伴',
            })
          ).conditionId;
      }
      await services.experiments.publish(actor, experimentId);
      const accounts = [];
      for (let i = 0; i < count; i++) {
        const code = `${batch}-P${String(i + 1).padStart(4, '0')}`,
          path = paths[i % 3][1];
        const password = createHmac('sha256', seedSecret)
          .update(`${experimentId}\0${code}`)
          .digest('base64url');
        const prior = await pool.query(
          'SELECT id,password_hash FROM research.participant WHERE experiment_id=$1 AND participant_code=$2',
          [experimentId, code],
        );
        let id = prior.rows[0]?.id;
        if (id && !verifyPassword(password, prior.rows[0].password_hash))
          throw new Error('BOOTSTRAP_SECRET_CHANGED');
        if (!id)
          id = (
            await services.participants.create(actor, {
              experiment_id: experimentId,
              participant_code: code,
              password,
            })
          ).participantId;
        const assignment = await pool.query(
          'SELECT condition_id FROM research.experiment_assignment WHERE participant_id=$1',
          [id],
        );
        if (assignment.rowCount && assignment.rows[0].condition_id !== conditions[path])
          throw new Error('IMMUTABLE_ASSIGNMENT_MISMATCH');
        if (!assignment.rowCount)
          await services.experiments.assign(actor, {
            participant_id: id,
            condition_id: conditions[path],
          });
        accounts.push({ participant_id: id, participant_code: code, path, password });
      }
      seed = {
        experiment_id: experimentId,
        batch,
        profile: mentorConfig.version,
        model: {
          provider: configured.settings.provider,
          requested_model: configured.settings.model_name,
        },
        accounts,
      };
    } finally {
      await lock.query('SELECT pg_advisory_unlock(186452029)');
      lock.release();
    }
  } catch (error) {
    if (!poolOverride) await pool.end();
    throw error;
  }
  const digest = createHash('sha256').update(adminToken).digest();
  const authorized = (req) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return false;
    return timingSafeEqual(createHash('sha256').update(h.slice(7)).digest(), digest);
  };
  const api = createApp(services, digest.toString('hex'), env.ADMIN_DEVELOPMENT_MODE === 'true');
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    next();
  });
  app.get('/api/ready', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ready', database: 'ok' });
    } catch {
      res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });
    }
  });
  app.get('/api/admin/hosted-accounts', (req, res) => {
    if (!authorized(req)) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    res.json({ ...seed, additional_batches: previewBatches });
  });
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api/admin') &&
      !['GET', 'HEAD'].includes(req.method) &&
      !(
        req.method === 'POST' &&
        (req.path === '/api/admin/account-batches' ||
          /^\/api\/admin\/participants\/[a-f0-9-]{36}\/reset-login$/.test(req.path))
      )
    ) {
      res.status(405).json({ error: 'HOSTED_STAGING_ADMIN_READ_ONLY' });
      return;
    }
    next();
  });
  app.use((req, res, next) => (req.path.startsWith('/api/') ? api(req, res, next) : next()));
  app.get('/operator', (_req, res) => res.sendFile(resolve(root, 'deploy/hosted-operator.html')));
  app.get('/operator.js', (_req, res) => res.sendFile(resolve(root, 'deploy/hosted-operator.js')));
  app.use(express.static(resolve(root, 'apps/web/dist'), { dotfiles: 'deny', fallthrough: false }));
  app.use((_error, _req, res, _next) => {
    void _next;
    res.status(404).json({ error: 'NOT_FOUND' });
  });
  return { app, pool, services, seed, settings: configured.settings, previewBatches };
}

/** Optional A/B initialization: one app/DB, two immutable experiments, no model calls. */
export async function createHostedDeployment(options = {}) {
  const env = options.env ?? process.env;
  if (env.RESEARCH_AB_PREVIEW !== 'true') return createHostedPlatform(options);
  required(env, 'GPT_API_KEY');
  required(env, 'DEEPSEEK_API_KEY');
  if ((env.RESEARCH_AB_BATCH ?? 'B002') === (env.RESEARCH_BOOTSTRAP_BATCH ?? 'B001'))
    throw new Error('HOSTED_AB_BATCH_MUST_DIFFER');
  const main = await createHostedPlatform(options);
  try {
    const other = await createHostedPlatform({
      ...options,
      poolOverride: main.pool,
      env: {
        ...env,
        MODEL_PROVIDER: (env.MODEL_PROVIDER ?? 'deepseek') === 'gpt' ? 'deepseek' : 'gpt',
        RESEARCH_BOOTSTRAP_BATCH: env.RESEARCH_AB_BATCH ?? 'B002',
        RESEARCH_BOOTSTRAP_COUNT: env.RESEARCH_AB_COUNT ?? '6',
      },
    });
    main.previewBatches.push(other.seed);
    return main;
  } catch (error) {
    if (!options.poolOverride) await main.pool.end();
    throw error;
  }
}
