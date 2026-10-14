/** Six-wave real HTTP/SQL concurrency acceptance. Always fixture, never paid providers. */
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import os from 'node:os';
import pg from 'pg';
import { MockAdapter } from '@research/model-adapter';
import { createHostedPlatform } from './hosted-platform.mjs';
export async function runHostedConcurrency(count) {
  if (![30, 45].includes(count)) throw new Error('ONLY_30_OR_45_FIXTURE_PARTICIPANTS');
  const container = `research-hosted-fixture-${randomUUID()}`,
    image =
      'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
  let runtime,
    pool,
    server,
    created = false,
    sampler;
  const requests = [],
    checks = {},
    attempts = new Map();
  let generators = 0,
    active = 0,
    maxActive = 0,
    dbErrors = 0,
    maxPool = 0,
    maxWaiting = 0,
    peakRss = 0;
  const environment = {
    ...process.env,
    RESEARCH_DATABASE_SCOPE: 'isolated-staging',
    ADMIN_ACCESS_TOKEN: 'OFFLINE_HOSTED_ADMIN_SECRET_32_CHARS',
    RESEARCH_BOOTSTRAP_SECRET: 'OFFLINE_BOOTSTRAP_PASSWORD_SEED_32_CHARS',
    DEEPSEEK_API_KEY: 'OFFLINE_NO_PROVIDER_CALLS',
    MODEL_PROVIDER: 'deepseek',
    DEEPSEEK_MODEL_NAME: 'deepseek-flash',
    MODEL_TEMPERATURE: '0.2',
    MODEL_MAX_TOKENS: '512',
    MODEL_TIMEOUT_MS: '10000',
    MODEL_MAX_ATTEMPTS: '2',
    RESEARCH_BOOTSTRAP_BATCH: 'B001',
    RESEARCH_BOOTSTRAP_COUNT: String(count),
    DB_POOL_SIZE: '10',
    ADMIN_DEVELOPMENT_MODE: 'true',
  };
  const actor = { role: 'admin', id: 'hosted-fixture-acceptance' };
  const generator = new MockAdapter(async (prompt) => {
    generators++;
    active++;
    maxActive = Math.max(active, maxActive);
    try {
      await new Promise((ok) => setTimeout(ok, 200));
      const contents = prompt.messages.map((m) => m.content).join('\n');
      const markers = [...contents.matchAll(/P\d{4}-R\d{2}/g)];
      const marker = markers.at(-1)?.[0];
      const n = (attempts.get(marker) ?? 0) + 1;
      attempts.set(marker, n);
      if ((marker === 'P0001-R05' && n === 1) || marker === 'P0004-R06') return '';
      const belief = contents.match(/唯一确认观点：(.*)/u)?.[1];
      return (
        (belief
          ? `对于“${JSON.parse(belief)}”，可以考虑个人经历与环境差异。`
          : '我们可以继续补充当前表达。') + `表达编号${marker}：我看到你补充的内容。`
      );
    } finally {
      active--;
    }
  });
  const latency = (xs, p) => {
    const a = xs.toSorted((x, y) => x - y);
    return a.length ? Math.round(a[Math.ceil(a.length * p) - 1] * 100) / 100 : null;
  };
  try {
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
        'POSTGRES_PASSWORD=OFFLINE_FIXTURE_PG',
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
      database: 'postgres',
      password: 'OFFLINE_FIXTURE_PG',
      max: 10,
      connectionTimeoutMillis: 1000,
    });
    pool.on('error', () => dbErrors++);
    pool.on('connect', (client) => {
      const query = client.query.bind(client);
      client.query = (...args) => {
        try {
          const result = query(...args);
          return result?.catch
            ? result.catch((e) => {
                dbErrors++;
                throw e;
              })
            : result;
        } catch (e) {
          dbErrors++;
          throw e;
        }
      };
    });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        await pool.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((ok) => setTimeout(ok, 250));
      }
    }
    if (!ready) throw new Error('FIXTURE_DB_UNAVAILABLE');
    runtime = await createHostedPlatform({
      env: environment,
      generatorOverride: generator,
      poolOverride: pool,
    });
    const listen = async () => {
      server = runtime.app.listen(0, '127.0.0.1');
      await new Promise((ok) => server.once('listening', ok));
      return `http://127.0.0.1:${server.address().port}`;
    };
    let base = await listen();
    sampler = setInterval(() => {
      maxPool = Math.max(maxPool, pool.totalCount);
      maxWaiting = Math.max(maxWaiting, pool.waitingCount);
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 5);
    async function http(
      path,
      token = '',
      body,
      expected = [200],
      kind = 'normal',
      detail = 'request',
    ) {
      const start = performance.now();
      let status = null,
        timeout = false;
      try {
        const response = await fetch(base + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(30000),
        });
        status = response.status;
        const data = await response.json();
        if (!expected.includes(status)) throw new Error(`UNEXPECTED_HTTP_${status}`);
        return data;
      } catch (error) {
        timeout = ['TimeoutError', 'AbortError'].includes(error.name);
        throw error;
      } finally {
        requests.push({
          operation: path.split('?')[0],
          http_status: status,
          expected_status: expected,
          scope: kind,
          detail,
          duration_ms: performance.now() - start,
          client_timeout: timeout,
        });
      }
    }
    const accounts = runtime.seed.accounts;
    const users = await Promise.all(
      accounts.map(async (account) => ({
        ...account,
        token: (
          await http('/api/auth/login', '', {
            experiment_id: runtime.seed.experiment_id,
            participant_code: account.participant_code,
            password: account.password,
          })
        ).token,
      })),
    );
    const acceptedTurns = [];
    for (let round = 1; round <= 6; round++) {
      await Promise.all(
        users.map(async (user) => {
          const marker =
            user.participant_code.split('-').at(-1) + `-R${String(round).padStart(2, '0')}`;
          const current = await http('/api/experiment/current', user.token);
          const stage = (
            await pool.query(
              'SELECT es.stage FROM research.experiment_assignment a JOIN research.experiment_session s ON s.assignment_id=a.id JOIN research.experiment_state es ON es.session_id=s.id WHERE a.participant_id=$1',
              [user.participant_id],
            )
          ).rows[0].stage;
          const input = {
            state_token: current.state_token,
            request_id: `same-shared-wave-${round}`,
            text:
              (user.path === 'cognitive_v1'
                ? '媒体让我觉得美国黑人犯罪率高，但可能还需了解具体情况。'
                : user.path === 'emotion_v1'
                  ? 'Marcus喜欢音乐，李阳慢热，他们继续交流当前感受。'
                  : '今天我散步后想读一本小说。') + `表达编号${marker}`,
          };
          const calls = await Promise.all([
            http(
              '/api/conversation/message',
              user.token,
              input,
              [200],
              'normal',
              'primary_message',
            ),
            http(
              '/api/conversation/message',
              user.token,
              input,
              [200],
              'normal',
              'concurrent_duplicate',
            ),
          ]);
          const original = calls.find((r) => r.status === 'ready');
          if (!original || calls.some((r) => r.turn_id !== original.turn_id))
            throw new Error('DUPLICATE_TURN_MISMATCH');
          const attemptsBeforeReplay = attempts.get(marker) ?? 0;
          const cached = await http(
            '/api/conversation/message',
            user.token,
            input,
            [200],
            'normal',
            'completed_replay',
          );
          if (
            JSON.stringify(cached) !== JSON.stringify(original) ||
            (attempts.get(marker) ?? 0) !== attemptsBeforeReplay
          )
            throw new Error('REPLAY_CONTENT_OR_GENERATION_MISMATCH');
          acceptedTurns.push({
            participant_id: user.participant_id,
            turn_id: original.turn_id,
            round,
            stage,
          });
          const after = await http('/api/experiment/current', user.token);
          const shouldSubmit =
            user.path === 'cognitive_v1'
              ? ['STEREOTYPE_CAPTURE', 'VIEWPOINT_CONFIRMATION', 'INITIAL_RATING'].includes(
                  stage,
                ) ||
                (stage === 'REFRAME_SOCIAL_STRUCTURE' && round === 5)
              : user.path === 'emotion_v1'
                ? round >= 2
                : false;
          if (shouldSubmit) {
            const form = {};
            for (const f of after.form.fields)
              form[f.name] =
                f.kind === 'confirmation'
                  ? true
                  : f.kind === 'number'
                    ? Number(user.participant_code.split('P').at(-1))
                    : f.name === 'viewpoint'
                      ? `媒体让我觉得美国黑人犯罪率高（${user.participant_code}）`
                      : f.name === 'source'
                        ? `合成来源${user.participant_code}`
                        : `当前明确表达${user.participant_code}`;
            await http('/api/experiment/submissions', user.token, {
              state_token: after.state_token,
              request_id: `submit-${round}`,
              data: form,
            });
          }
        }),
      );
    }
    const data = await runtime.services.admin.export(actor, runtime.seed.experiment_id);
    checks.complete_export = data.complete && data.per_table_limit === null;
    checks.database_integrity = data.data_quality.passed;
    checks.exact_turn_message_counts =
      data.turns.length === count * 6 &&
      data.messages.length === count * 12 &&
      data.runs.length === count * 6;
    checks.unique_participants_sessions =
      new Set(data.analysis_rows.map((r) => r.session_id)).size === count;
    checks.user_message_isolation = true;
    checks.variable_isolation = true;
    for (const user of users) {
      const row = data.analysis_rows.find((r) => r.participant_id === user.participant_id);
      const code = user.participant_code.split('-').at(-1);
      if (
        row.conversation_history.filter((m) => m.role === 'user').length !== 6 ||
        row.conversation_history
          .filter((m) => m.role === 'user')
          .some((m) => !m.content.includes(code))
      )
        checks.user_message_isolation = false;
      const otherCodes = users
        .filter((u) => u.participant_id !== user.participant_id)
        .map((u) => u.participant_code);
      if (otherCodes.some((c) => JSON.stringify(row.experiment_variables).includes(c)))
        checks.variable_isolation = false;
      if (
        user.path === 'cognitive_v1' &&
        !JSON.stringify(row.experiment_variables).includes(
          `媒体让我觉得美国黑人犯罪率高（${user.participant_code}）`,
        )
      )
        checks.variable_isolation = false;
    }
    checks.completed_replays_do_not_generate = true;
    checks.individual_rating_isolation = users
      .filter((u) => u.path === 'cognitive_v1')
      .every((u) => {
        const row = data.analysis_rows.find((r) => r.participant_id === u.participant_id);
        return (
          row.current_state.snapshot.variables.initial_rating ===
          Number(u.participant_code.split('P').at(-1))
        );
      });
    checks.cross_user_turn_denied = true;
    checks.admin_data_denied = true;
    await Promise.all(
      users.map(async (user, i) => {
        const other = acceptedTurns.find(
          (t) => t.participant_id === users[(i + 1) % count].participant_id,
        );
        await http(
          `/api/conversation/turns/${other.turn_id}`,
          user.token,
          undefined,
          [404],
          'security',
        );
        await http('/api/admin/hosted-accounts', user.token, undefined, [401], 'security');
        await http(
          `/api/admin/export?experiment_id=${runtime.seed.experiment_id}`,
          user.token,
          undefined,
          [401],
          'security',
        );
      }),
    );
    const exported = await http(
      `/api/admin/export?experiment_id=${runtime.seed.experiment_id}`,
      environment.ADMIN_ACCESS_TOKEN,
    );
    checks.authenticated_complete_export =
      exported.complete && exported.analysis_rows.length === count;
    checks.secrets_not_in_export = ![
      environment.DEEPSEEK_API_KEY,
      environment.ADMIN_ACCESS_TOKEN,
      environment.RESEARCH_BOOTSTRAP_SECRET,
      'OFFLINE_FIXTURE_PG',
    ].some((s) => JSON.stringify(exported).includes(s));
    const snapshot = (d) =>
      JSON.stringify({
        states: d.states,
        messages: d.messages,
        variables: d.variables,
        transitions: d.transitions,
        turns: d.turns,
        runs: d.runs,
      });
    await new Promise((ok) => server.close(ok));
    runtime = await createHostedPlatform({
      env: environment,
      generatorOverride: generator,
      poolOverride: pool,
    });
    base = await listen();
    const restored = await runtime.services.admin.export(actor, runtime.seed.experiment_id);
    checks.restart_preserves_all_experiment_records = snapshot(data) === snapshot(restored);
    checks.restart_does_not_duplicate_accounts = restored.analysis_rows.length === count;
    await Promise.all(
      users.map(async (u) => {
        const login = await http('/api/auth/login', '', {
          experiment_id: runtime.seed.experiment_id,
          participant_code: u.participant_code,
          password: u.password,
        });
        const history = await http('/api/conversation/messages', login.token);
        if (history.length !== 12) throw new Error('RELOGIN_HISTORY_LOST');
      }),
    );
    checks.relogin_recovers_history = true;
    const operational = requests.filter((r) => r.scope === 'normal');
    const unexpected = operational.filter((r) => !r.expected_status.includes(r.http_status));
    const byOperation = Object.fromEntries(
      [...new Set(operational.map((r) => r.operation))].map((op) => {
        const rows = operational.filter((r) => r.operation === op);
        const xs = rows.map((r) => r.duration_ms);
        return [
          op,
          {
            requests: rows.length,
            p50_ms: latency(xs, 0.5),
            p95_ms: latency(xs, 0.95),
            max_ms: Math.round(Math.max(...xs) * 100) / 100,
          },
        ];
      }),
    );
    return {
      status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
      fixture: true,
      external_provider_calls: 0,
      public_staging_tested: false,
      participants: count,
      path_distribution: { cognitive: count / 3, emotional: count / 3, daily: count / 3 },
      waves: 6,
      unique_chat_turns: count * 6,
      checks,
      metrics: {
        primary_message_latency: (() => {
          const xs = operational
            .filter((r) => r.detail === 'primary_message')
            .map((r) => r.duration_ms);
          return {
            samples: xs.length,
            p50_ms: latency(xs, 0.5),
            p95_ms: latency(xs, 0.95),
            max_ms: Math.round(Math.max(...xs) * 100) / 100,
          };
        })(),
        normal_requests: operational.length,
        success_rate: (operational.length - unexpected.length) / operational.length,
        error_rate: unexpected.length / operational.length,
        http429: requests.filter((r) => r.http_status === 429).length,
        http5xx: requests.filter((r) => r.http_status >= 500).length,
        client_timeouts: requests.filter((r) => r.client_timeout).length,
        database_errors: dbErrors,
        model_fixture_attempts: generators,
        max_parallel_fixture_generations: maxActive,
        fixture_delay_ms: 200,
        retry_count: data.runs.reduce((n, r) => n + r.retry_count, 0),
        fallback_count: data.runs.reduce((n, r) => n + r.fallback_count, 0),
        pool_limit: 10,
        max_pool_connections: maxPool,
        max_waiting_clients: maxWaiting,
        peak_process_rss_mb: Math.round(peakRss / 1024 / 1024),
        by_operation: byOperation,
      },
      database_record_counts: data.record_counts,
      data_quality: data.data_quality,
      experimental_record_restart_sha256: [data, restored].map((d) =>
        createHash('sha256').update(snapshot(d)).digest('hex'),
      ),
      environment: {
        node: process.versions.node,
        available_parallelism: os.availableParallelism(),
        host_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
      },
      requests,
      mentor_test_ready: false,
      formal_ready: false,
    };
  } finally {
    clearInterval(sampler);
    if (server?.listening) await new Promise((ok) => server.close(ok));
    await pool?.end();
    if (created) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const output = process.argv[2];
  if (!output) throw new Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
  await mkdir(resolve(output));
  for (const count of [30, 45]) {
    const report = await runHostedConcurrency(count);
    await writeFile(
      resolve(output, `concurrency-${count}.json`),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.info(`${count} participants: ${report.status}`);
    if (report.status !== 'passed') process.exitCode = 1;
  }
}
