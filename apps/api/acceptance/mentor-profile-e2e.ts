import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createConfiguredGenerator, MockAdapter } from '@research/model-adapter';
import { migrate, loadMigrations } from '../../../packages/database/src/migrations.js';
import { createServices } from '../src/services/index.js';
import { createApp } from '../src/app.js';
import type { ParticipantCurrent, ParticipantTurn } from '@research/contracts';
import { mentorConfig } from '../src/services/research-profile.js';

const real = process.argv.includes('--real');
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !output) throw new Error('--output is required');
const container = `research-mentor-${randomUUID()}`;
let pool: pg.Pool | undefined,
  started = false,
  externalCalls = 0;
const httpRuns: { status: number; response_model: string | null; duration_ms: number }[] = [];
const paths: Record<string, unknown>[] = [];
let report: Record<string, unknown> = {
  real_model: real,
  synthetic: true,
  mentor_test_ready: false,
  formal_ready: false,
};
try {
  if (real && !process.env.DEEPSEEK_API_KEY?.trim()) {
    report = {
      ...report,
      status: 'not_run',
      missing_variables: ['DEEPSEEK_API_KEY'],
      external_model_calls: 0,
    };
    process.exitCode = 2;
  } else {
    const configured = createConfiguredGenerator(
      {
        ...process.env,
        MODEL_PROVIDER: real ? 'deepseek' : 'mock',
        DEEPSEEK_MODEL_NAME: process.env.DEEPSEEK_MODEL_NAME ?? 'deepseek-flash',
        MODEL_TIMEOUT_MS: '10000',
        MODEL_MAX_ATTEMPTS: '2',
        MODEL_MAX_TOKENS: '512',
        MODEL_TEMPERATURE: '0.2',
      },
      async (url, options) => {
        externalCalls += 1;
        const start = performance.now();
        const response = await fetch(url, options);
        const metadata = (await response
          .clone()
          .json()
          .catch(() => ({}))) as { model?: unknown };
        httpRuns.push({
          status: response.status,
          response_model: typeof metadata.model === 'string' ? metadata.model : null,
          duration_ms: performance.now() - start,
        });
        return response;
      },
    );
    const generator = real
      ? configured.generator
      : new MockAdapter(async (prompt) => {
          const belief = prompt.messages
            .map((m) => m.content)
            .join('\n')
            .match(/唯一确认观点：(.*)/u)?.[1];
          return belief
            ? `对于“${JSON.parse(belief)}”，我们可以考虑个人经历与环境的作用。`
            : '我们可以继续补充人物在当前情境中的感受。';
        });
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
        'POSTGRES_PASSWORD=SYNTHETIC_MENTOR_ONLY',
        'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2',
      ],
      { stdio: 'pipe', timeout: 60000 },
    );
    started = true;
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
      password: 'SYNTHETIC_MENTOR_ONLY',
      database: 'postgres',
      connectionTimeoutMillis: 1000,
    });
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
    if (!ready) throw new Error('DATABASE_NOT_READY');
    const client = await pool.connect();
    try {
      await migrate(
        client,
        await loadMigrations(
          fileURLToPath(new URL('../../../database/migrations/', import.meta.url)),
        ),
        'up',
      );
    } finally {
      client.release();
    }
    const services = createServices(pool, generator, configured.settings);
    const server = createApp(services).listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('SERVER_START_FAILED');
    const base = `http://127.0.0.1:${address.port}/api`;
    const admin = { role: 'admin' as const, id: 'synthetic-mentor-acceptance' };
    async function http<T>(path: string, token = '', data?: unknown): Promise<T> {
      const response = await fetch(base + path, {
        method: data === undefined ? 'GET' : 'POST',
        signal: AbortSignal.timeout(35000),
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'API_FAILED');
      }
      return response.json() as Promise<T>;
    }
    try {
      for (const path of ['cognitive_v1', 'emotion_v1'] as const) {
        const e = await services.experiments.create(admin, {
          name: '合成导师版真实链路验收',
          instructions: '仅合成验收，非正式参与者。',
          research_profile: mentorConfig.version,
        });
        const condition = await services.experiments.condition(admin, e.experimentId, {
          code: 'MENTOR',
          path_version: path,
          agent_name: '研究对话伙伴',
        });
        await services.experiments.publish(admin, e.experimentId);
        const password = randomUUID();
        const p = await services.participants.create(admin, {
          experiment_id: e.experimentId,
          participant_code: 'SYNTHETIC',
          password,
        });
        await services.experiments.assign(admin, {
          participant_id: p.participantId,
          condition_id: condition.conditionId,
        });
        const login = await http<{ token: string }>('/auth/login', '', {
          experiment_id: e.experimentId,
          participant_code: 'SYNTHETIC',
          password,
        });
        const stages =
          path === 'cognitive_v1'
            ? ([
                [
                  'STEREOTYPE_CAPTURE',
                  3,
                  '媒体老说他们犯罪率高，我还觉得教育可能不高，但说不准。',
                  {
                    response: '媒体老说他们犯罪率高，我还觉得教育可能不高，但说不准。',
                    source: '媒体报道',
                  },
                ],
                [
                  'VIEWPOINT_CONFIRMATION',
                  1,
                  '我想先确认媒体给我的犯罪率高这个印象。',
                  { viewpoint: '媒体让我觉得美国黑人的犯罪率高。', confirmed: true },
                ],
                ['INITIAL_RATING', 1, '我准备给这个观点评分。', { rating: 70 }],
                [
                  'REFRAME_SOCIAL_STRUCTURE',
                  3,
                  '也许与社会环境和资源有关，不只是个人问题。',
                  { response: '我开始考虑社会资源差异。' },
                ],
                [
                  'REFRAME_MEDIA_ALGORITHM',
                  3,
                  '媒体总把同类内容推给我，可能让我以为所有人都一样。',
                  { response: '我注意到媒体呈现和算法的选择。' },
                ],
                [
                  'REFRAME_COUNTER_FACT',
                  3,
                  '我见过反例，觉得一个新闻不能代表整个群体。',
                  { response: '我愿意了解反例与文化多样性。' },
                ],
                [
                  'REFRAME_INDIVIDUAL_DIFFERENCE',
                  3,
                  '每个人的经历都不一样，我不该一概而论。',
                  { response: '我开始关注美国黑人的个体差异。' },
                ],
                ['SECOND_RATING', 1, '我想重新评价原先确认的观点。', { rating: 45 }],
                [
                  'ACTION_INTENTION',
                  2,
                  '再看到关于美国黑人的刻板印象内容，我会先核实而不是转发。',
                  { response: '我会核实美国黑人刻板印象相关内容。' },
                ],
              ] as const)
            : ([
                [
                  'PERSONA_SETUP',
                  2,
                  '我希望Marcus喜欢音乐，李阳比较慢热。',
                  { response: 'Marcus喜欢音乐，李阳性格慢热。' },
                ],
                [
                  'FIRST_CONTACT',
                  3,
                  '李阳想问Marcus需要哪本书，但不知道怎么开口。',
                  { response: '他们在图书馆初次交流。' },
                ],
                [
                  'MISUNDERSTANDING',
                  2,
                  'Marcus以为李阳不想和自己一起吃饭，其实李阳没听清。',
                  { response: '食堂里出现了一个小误会。' },
                ],
                [
                  'RESOLUTION',
                  2,
                  '李阳解释刚才没听清，两个人终于松了一口气。',
                  { response: '他们通过交流消除了误会。' },
                ],
                [
                  'SHARED_EXPERIENCE',
                  2,
                  '他们在自习室一起查资料，发现都喜欢音乐。',
                  { response: '两人发现共同兴趣。' },
                ],
                [
                  'RELATIONSHIP',
                  2,
                  '散步时他们分享初到陌生环境的感受，决定以后互相帮助。',
                  { response: '他们逐渐接纳彼此并成为朋友。' },
                ],
                ['ENDING_FEEDBACK', 1, '这个故事让我觉得多交流才能避免误会。', {}],
              ] as const);
        const observations: Record<string, unknown>[] = [];
        for (const [stage, count, utterance, data] of stages) {
          const before = await services.admin.export(admin, e.experimentId);
          if (before.states[0].stage !== stage) throw new Error('UNEXPECTED_STAGE');
          console.log(`${path}: ${stage}`);
          for (let turn = 0; turn < count; turn++) {
            const current = await http<ParticipantCurrent>('/experiment/current', login.token);
            const input = {
              state_token: current.state_token,
              request_id: randomUUID(),
              text:
                stage === 'STEREOTYPE_CAPTURE'
                  ? [
                      utterance,
                      '这些印象主要来自新闻和短视频，我没有多少直接接触。',
                      '我想先讨论媒体给我的犯罪率高这个印象。',
                    ][turn]!
                  : utterance +
                    (turn === 1
                      ? ' 我以前没有仔细想过这一点。'
                      : turn === 2
                        ? ' 现在看，可能还需要了解更具体的情况。'
                        : ''),
            };
            const reply = await http<ParticipantTurn>('/conversation/message', login.token, input);
            const callsBeforeReplay = externalCalls;
            const replay = await http<ParticipantTurn>('/conversation/message', login.token, input);
            const same = JSON.stringify(replay) === JSON.stringify(reply);
            const noExtraCalls = externalCalls === callsBeforeReplay;
            observations.push({
              stage,
              reply_status: reply.status,
              turn_id: reply.turn_id,
              replay_same: same,
              replay_no_extra_provider_calls: noExtraCalls,
            });
            if (!same || !noExtraCalls) throw new Error('REPLAY_INTEGRITY_FAILED');
            if (reply.status !== 'ready') throw new Error('GENERATION_NOT_READY');
          }
          const current = await http<ParticipantCurrent>('/experiment/current', login.token);
          const afterTurns = await services.admin.export(admin, e.experimentId);
          if (current.status !== 'finished' && afterTurns.states[0].stage === stage)
            await http('/experiment/submissions', login.token, {
              state_token: current.state_token,
              request_id: randomUUID(),
              data,
            });
        }
        const data = await services.admin.export(admin, e.experimentId);
        paths.push({
          path,
          status: data.states[0].status,
          observations,
          analysis_export: data,
          semantic_review: 'pending_researcher_review',
        });
        if (data.states[0].status !== 'completed' || !data.complete || !data.data_quality.passed)
          throw new Error('RECORD_ACCEPTANCE_FAILED');
      }
      report = {
        ...report,
        status: 'completed',
        settings: configured.settings,
        research_config: mentorConfig,
        paths,
        http_runs: httpRuns,
        external_model_calls: externalCalls,
        semantic_review: 'pending_researcher_review',
        human_language_scores: null,
      };
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  }
} catch (error) {
  report = {
    ...report,
    status: 'blocked',
    paths,
    http_runs: httpRuns,
    external_model_calls: externalCalls,
    error_code:
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : 'ACCEPTANCE_FAILED',
    semantic_review: 'pending_researcher_review',
  };
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (started) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`mentor profile acceptance: ${report.status}; external calls: ${externalCalls}`);
}
