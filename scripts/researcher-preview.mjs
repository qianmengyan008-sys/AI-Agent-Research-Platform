/** Isolated staging launcher. Does not change experiment definitions or production resources. */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile, open, unlink, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import { createConfiguredGenerator } from '@research/model-adapter';
import { migrate, loadMigrations } from '../packages/database/src/migrations.ts';
import { createApp } from '../apps/api/src/app.ts';
import { createServices } from '../apps/api/src/services/index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = resolve(root, '.researcher-preview-private');
const stateFile = resolve(runtime, 'credentials.json');
const command = process.argv[2] ?? 'start';
const image =
  'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
const actor = { role: 'admin', id: 'researcher-preview-bootstrap' };
const paths = [
  ['COG', 'cognitive_v1'],
  ['EMO', 'emotion_v1'],
  ['DAILY', 'daily_v1'],
];
let pool, lock, gateway;
const secret = () => randomBytes(24).toString('base64url');
const docker = (...args) => {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe', timeout: 60000 }).trim();
  } catch {
    throw new Error('DOCKER_COMMAND_FAILED');
  } // Never expose credential-bearing argv.
};
const save = (state) =>
  writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
const release = async () => {
  if (lock) {
    await lock.close();
    lock = undefined;
    await unlink(resolve(runtime, 'bootstrap.lock'));
  }
};
async function round(services, state, name) {
  if (!/^[A-Z0-9-]{1,24}$/.test(name)) throw new Error('INVALID_ROUND_NAME');
  state.rounds[name] ??= [];
  for (const [code, path] of paths) {
    let p = state.rounds[name].find((p) => p.path === path);
    if (!p) {
      p = { code: `${name}-${code}`, path, password: secret() };
      state.rounds[name].push(p);
      await save(state);
    }
    if (!p.participant_id) {
      const created = await services.participants.create(actor, {
        experiment_id: state.experiment_id,
        participant_code: p.code,
        password: p.password,
      });
      p.participant_id = created.participantId;
      await save(state);
    }
    if (!p.session_id) {
      const data = await services.admin.export(actor, state.experiment_id);
      const previous = data.analysis_rows.find((row) => row.participant_id === p.participant_id);
      if (previous?.session_id) {
        p.session_id = previous.session_id;
        await save(state);
        continue;
      }
      const a = await services.experiments.assign(actor, {
        participant_id: p.participant_id,
        condition_id: state.conditions[path],
      });
      p.session_id = a.sessionId;
      await save(state);
    }
  }
}
try {
  if (!['start', 'init', 'new-round', 'export', 'status'].includes(command))
    throw new Error('UNKNOWN_COMMAND');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  lock = await open(resolve(runtime, 'bootstrap.lock'), 'wx', 0o600);
  let state;
  try {
    state = JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error('INVALID_PRIVATE_STATE', { cause: e });
    const id = randomUUID().slice(0, 8);
    state = {
      container: `researcher-preview-${id}`,
      volume: `researcher-preview-${id}`,
      db_password: secret(),
      admin_token: secret(),
      conditions: {},
      rounds: {},
    };
    await save(state);
  }
  let exists = false;
  try {
    docker('inspect', state.container);
    exists = true;
  } catch {
    /* only this named resource */
  }
  if (exists) docker('start', state.container);
  else {
    docker('volume', 'create', state.volume);
    docker(
      'run',
      '-d',
      '--name',
      state.container,
      '--restart',
      'unless-stopped',
      '-v',
      `${state.volume}:/var/lib/postgresql/data`,
      '-p',
      '127.0.0.1::5432',
      '-e',
      `POSTGRES_PASSWORD=${state.db_password}`,
      image,
    );
  }
  const port = Number(docker('port', state.container, '5432/tcp').split(':').at(-1));
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    database: 'postgres',
    password: state.db_password,
    connectionTimeoutMillis: 1000,
  });
  pool.on('error', () => console.error('PREVIEW_DATABASE_CONNECTION_INTERRUPTED'));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      await pool.query('SELECT 1');
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) throw new Error('PREVIEW_DATABASE_NOT_READY');
  const client = await pool.connect();
  try {
    await migrate(client, await loadMigrations(resolve(root, 'database/migrations')));
  } finally {
    client.release();
  }
  process.env.RESEARCH_CODE_COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const configured = createConfiguredGenerator(
    {
      ...process.env,
      MODEL_PROVIDER: 'deepseek',
      DEEPSEEK_MODEL_NAME: 'deepseek-flash',
      DEEPSEEK_API_BASE_URL: 'https://api.deepseek.com/v1',
      MODEL_TIMEOUT_MS: '10000',
      MODEL_MAX_ATTEMPTS: '2',
      MODEL_MAX_TOKENS: '512',
      MODEL_TEMPERATURE: '0.2',
    },
    async (url, options) => {
      const started = performance.now();
      const response = await fetch(url, options);
      const metadata = await response
        .clone()
        .json()
        .catch(() => ({}));
      await appendFile(
        resolve(runtime, 'http-runs.jsonl'),
        JSON.stringify({
          at: new Date().toISOString(),
          http_status: response.status,
          response_model: typeof metadata.model === 'string' ? metadata.model : null,
          response_ms: performance.now() - started,
        }) + '\n',
        { mode: 0o600 },
      );
      return response;
    },
  );
  const services = createServices(pool, configured.generator, configured.settings);
  if (!state.experiment_id) {
    const e = await services.experiments.create(actor, {
      name: '研究者自由体验（独立 staging）',
      instructions:
        '这是内部研究者体验，非正式实验。请自然对话；准备好时明确提交当前填写。评分与观点确认需本人填写。中断后可重新登录继续；新体验请使用新一轮账号。',
      research_profile: 'mentor-test-v1',
    });
    state.experiment_id = e.experimentId;
    await save(state);
  }
  for (const [code, path] of paths) {
    if (!state.conditions[path]) {
      const c = await services.experiments.condition(actor, state.experiment_id, {
        code,
        path_version: path,
        agent_name: '研究对话伙伴',
      });
      state.conditions[path] = c.conditionId;
      await save(state);
    }
  }
  if (!state.published) {
    await services.experiments.publish(actor, state.experiment_id);
    state.published = true;
    await save(state);
  }
  await round(services, state, 'R001');
  if (command === 'new-round') await round(services, state, process.argv[3] ?? 'R002');
  if (command === 'export') {
    if (!process.argv[3]) throw new Error('EXPORT_DESTINATION_REQUIRED');
    const target = resolve(process.argv[3]);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      JSON.stringify(await services.admin.export(actor, state.experiment_id), null, 2) + '\n',
      { mode: 0o600 },
    );
    console.info('PREVIEW_COMPLETE_EXPORT_SAVED');
  }
  console.info(
    JSON.stringify({
      experiment_id: state.experiment_id,
      profile: 'mentor-test-v1',
      model: configured.settings.model_name,
      secret_present: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
      accounts: Object.values(state.rounds)
        .flat()
        .map(({ code, path }) => ({ code, path })),
      credentials_file: '.researcher-preview-private/credentials.json',
      mentor_test_ready: false,
    }),
  );
  await release();
  if (command !== 'start') {
    await pool.end();
    pool = undefined;
  } else {
    await access(resolve(root, 'apps/web/dist/index.html'));
    if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY_REQUIRED');
    const app = express();
    app.disable('x-powered-by');
    app.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    });
    // Use the original API router before static hosting. No experiment or frontend edits.
    app.use((req, res, next) =>
      req.path === '/api' || req.path.startsWith('/api/')
        ? createAppMiddleware(req, res, next)
        : next(),
    );
    const createAppMiddleware = createApp(
      services,
      createHash('sha256').update(state.admin_token).digest('hex'),
      true,
    );
    app.use(
      express.static(resolve(root, 'apps/web/dist'), {
        index: 'index.html',
        dotfiles: 'deny',
        fallthrough: false,
      }),
    );
    app.use((_error, _req, res, _next) => {
      void _next;
      res.status(404).json({ error: 'NOT_FOUND' });
    });
    const listenPort = Number(process.env.RESEARCHER_PREVIEW_PORT ?? '4173');
    if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535)
      throw new Error('INVALID_PREVIEW_PORT');
    gateway = app.listen(listenPort, '127.0.0.1');
    await new Promise((ok, fail) => {
      gateway.once('listening', ok);
      gateway.once('error', fail);
    });
    console.info(`RESEARCHER_PREVIEW_LISTENING_PORT=${listenPort}`);
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () =>
        gateway.close(async () => {
          await pool.end();
          process.exit(0);
        }),
      );
  }
} catch (error) {
  await release().catch(() => {});
  gateway?.close();
  await pool?.end();
  console.error(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'PREVIEW_SETUP_FAILED',
  );
  process.exitCode = 1;
}
