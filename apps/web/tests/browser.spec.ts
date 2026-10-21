import { UnitOfWork } from '../../api/src/repositories/context.js';
import { limits, turnStages } from '../../api/src/services/research-profile.js';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Server } from 'node:http';
import { MockAdapter } from '@research/model-adapter';
import type { ModelSettings } from '@research/model-adapter';
import { loadMigrations, migrate } from '../../../packages/database/src/migrations.js';
import { createApp } from '../../api/src/app.js';
import { createServices } from '../../api/src/services/index.js';
import type { Services } from '../../api/src/services/index.js';
import type { BusinessTrace } from '../../api/src/services/trace.js';
const image =
  'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2';
const container = `research-browser-${randomUUID()}`;
const password = 'SYNTHETIC_BROWSER_PASSWORD';
const adminToken = 'SYNTHETIC_BROWSER_ADMIN';
const actor = { role: 'admin' as const, id: 'browser-fixture' };
const settings: ModelSettings = {
  provider: 'mock',
  model_name: 'browser-synthetic-model',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 2000,
  max_attempts: 2,
};
let pool: pg.Pool,
  apiServer: Server,
  vite: ViteDevServer,
  services: Services,
  base = '',
  created = false,
  calls = 0;
let bubbleReply: string | undefined;
let variedStoryReplies = false;
let failModel = false,
  releaseModel: (() => void) | undefined;
const traces: BusinessTrace[] = [];
const artifacts = process.env.RESEARCH_ACCEPTANCE_DIR ?? process.env.ROUND13_ACCEPTANCE_DIR;
test.beforeAll(async () => {
  test.setTimeout(60000);
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
      'POSTGRES_PASSWORD=SYNTHETIC_BROWSER_DB',
      image,
    ],
    { stdio: 'pipe', timeout: 60000 },
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
    password: 'SYNTHETIC_BROWSER_DB',
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
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error('Browser fixture PostgreSQL not ready');
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
  services = createServices(
    pool,
    new MockAdapter(async (prompt) => {
      calls++;
      if (releaseModel)
        await new Promise<void>((resolve) => {
          releaseModel = resolve;
        });
      if (failModel) throw new Error('SYNTHETIC_MODEL_FAILURE');
      if (bubbleReply !== undefined) return bubbleReply;
      if (variedStoryReplies)
        return `Marcus和李阳分享音乐与学习的经历，逐渐加深对彼此的理解。合成叙述${calls}`;
      const belief = prompt.messages
        .map((m) => m.content)
        .join('\n')
        .match(/唯一确认观点：(.*)/u)?.[1];
      return belief
        ? `你提到“${JSON.parse(belief)}”。你愿意聊聊相关经历吗？`
        : '谢谢分享，你愿意继续聊聊吗？';
    }),
    settings,
    (entry) => traces.push(entry),
  );
  apiServer = createApp(
    services,
    createHash('sha256').update(adminToken).digest('hex'),
    true,
  ).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => apiServer.once('listening', resolve));
  const address = apiServer.address();
  if (!address || typeof address === 'string') throw new Error('No API address');
  vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${address.port}` } },
    },
  });
  await vite.listen();
  const web = vite.httpServer!.address();
  if (!web || typeof web === 'string') throw new Error('No web address');
  base = `http://127.0.0.1:${web.port}`;
  if (artifacts) await mkdir(artifacts, { recursive: true });
});
test.afterAll(async () => {
  await vite?.close();
  if (apiServer)
    await new Promise<void>((resolve, reject) =>
      apiServer.close((error) => (error ? reject(error) : resolve())),
    );
  await pool?.end();
  if (created) execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
});
test.beforeEach(() => {
  failModel = false;
  bubbleReply = undefined;
  variedStoryReplies = false;
  releaseModel = undefined;
  calls = 0;
  traces.length = 0;
});
async function account(path = 'cognitive_v1', profile = false) {
  const e = await services.experiments.create(actor, {
    name: `浏览器合成实验 ${randomUUID().slice(0, 8)}`,
    instructions: '这是合成实验说明。准备好后进入对话，填写当前问题并明确提交。',
    ...(profile ? { research_profile: 'mentor-test-v1' } : {}),
  });
  const c = await services.experiments.condition(actor, e.experimentId, {
    code: 'A',
    path_version: path,
    agent_name: '研究对话助手',
    ...(profile ? {} : { demo_policies: true }),
  });
  await services.experiments.publish(actor, e.experimentId);
  const code = `P-${randomUUID().slice(0, 8)}`;
  const p = await services.participants.create(actor, {
    experiment_id: e.experimentId,
    participant_code: code,
    password,
  });
  await services.experiments.assign(actor, {
    participant_id: p.participantId,
    condition_id: c.conditionId,
  });
  return { ...e, ...p, code };
}
async function login(page: Page, s: Awaited<ReturnType<typeof account>>) {
  await page.goto(base);
  await page.getByLabel('实验编号', { exact: true }).fill(s.experimentId);
  await page.getByLabel('参与者编号', { exact: true }).fill(s.code);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录实验', exact: true }).click();
  await expect(page.getByRole('heading', { name: '实验说明', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始／继续对话', exact: true }).click();
}
async function screenshot(page: Page, name: string) {
  if (artifacts) await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
}
async function saveRecords(s: Awaited<ReturnType<typeof account>>, name: string) {
  if (artifacts)
    await writeFile(
      join(artifacts, `${name}.json`),
      JSON.stringify(
        {
          synthetic: true,
          external_model_calls: 0,
          model: 'MockAdapter',
          ...(await services.admin.export(actor, s.experimentId)),
        },
        null,
        2,
      ) + '\n',
    );
}

test('participant browser login, chat and explicit source submission persist through page reload', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  await page.getByLabel('发送消息', { exact: true }).fill('浏览器参与者输入');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  const before = await services.admin.export(actor, s.experimentId);
  expect(before.states[0].core_version).toBe(1);
  expect(before.transitions).toHaveLength(1);
  expect(before.variables).toHaveLength(0);
  await page.getByLabel('确认内容', { exact: true }).fill('浏览器明确提交的表达');
  await page
    .getByLabel('你是从哪里了解到的？（选填）', { exact: true })
    .fill('浏览器明确填写的来源');
  await screenshot(page, 'participant-chat');
  await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  await page.reload();
  await login(page, s);
  await expect(page.getByRole('log')).toContainText('浏览器参与者输入');
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.states[0].core_version).toBe(2);
  expect(data.variables.find((v) => v.key === 'source').value).toBe('浏览器明确填写的来源');
  await saveRecords(s, 'browser-participant-records');
  if (artifacts)
    await writeFile(
      join(artifacts, 'browser-business-trace.json'),
      JSON.stringify({ synthetic: true, traces }, null, 2) + '\n',
    );
});

test('browser completes the cognitive path with explicit submissions and persistent research variables', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  for (let n = 0; n < 9; n++) {
    await page.getByLabel('发送消息', { exact: true }).fill(`认知路径合成消息 ${n}`);
    const chat = page.waitForResponse(
      (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '发送', exact: true }).click();
    expect((await chat).status()).toBe(200);
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    if (n === 1) {
      await page.getByLabel('确认后的观点', { exact: true }).fill('我不赞同这种概括');
      await page.getByLabel('我确认上述观点', { exact: true }).check();
    } else if (n === 2 || n === 7)
      await page.getByLabel('当前评分', { exact: true }).fill(n === 2 ? '6' : '4');
    else {
      await page.getByLabel('确认内容', { exact: true }).fill(`明确填写 ${n}`);
      if (n === 0)
        await page.getByLabel('你是从哪里了解到的？（选填）', { exact: true }).fill('合成来源');
    }
    const post = page.waitForResponse(
      (r) => r.url().endsWith('/api/experiment/submissions') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
    expect((await post).status()).toBe(200);
    if (n < 8) await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
  }
  await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
  const data = await services.admin.export(actor, s.experimentId);
  for (const key of [
    'raw_expression',
    'confirmed_belief',
    'source',
    'rating_1',
    'rating_2',
    'action_intention',
  ])
    expect(data.variables.some((v) => v.key === key)).toBe(true);
  expect(data.transitions).toHaveLength(10);
  expect(data.messages).toHaveLength(18);
  expect(data.runs).toHaveLength(9);
  expect(calls).toBe(9);
  await saveRecords(s, 'browser-cognitive-complete');
});

test('browser completes the emotion path while persisting all four research variable names', async ({
  page,
}) => {
  const s = await account('emotion_v1');
  await login(page, s);
  for (let n = 0; n < 7; n++) {
    await page.getByLabel('发送消息', { exact: true }).fill(`情感路径合成消息 ${n}`);
    const chat = page.waitForResponse(
      (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '发送', exact: true }).click();
    expect((await chat).status()).toBe(200);
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    await page.getByLabel('确认内容', { exact: true }).fill(`情感阶段明确填写 ${n}`);
    const post = page.waitForResponse(
      (r) => r.url().endsWith('/api/experiment/submissions') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
    expect((await post).status()).toBe(200);
    if (n < 6) await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
  }
  await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
  const data = await services.admin.export(actor, s.experimentId);
  for (const key of ['character_profile', 'scene_state', 'scene_phase', 'relationship_state'])
    expect(data.variables.some((v) => v.key === key)).toBe(true);
  expect(data.transitions).toHaveLength(8);
  expect(data.messages).toHaveLength(14);
  expect(data.runs).toHaveLength(7);
  expect(calls).toBe(7);
  await saveRecords(s, 'browser-emotion-complete');
});

test('lost message response is replayed with the same key without another generation', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  let dropped = false;
  await page.route('**/api/conversation/message', async (route) => {
    const response = await route.fetch();
    if (!dropped) {
      dropped = true;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await page.getByLabel('发送消息', { exact: true }).fill('重试网络消息');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('网络连接中断');
  await page.getByRole('button', { name: '重试同一消息', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  expect(calls).toBe(1);
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.messages).toHaveLength(2);
  expect(data.transitions).toHaveLength(1);
});

test('lost submission response is replayed once and does not create a second transition', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  let dropped = false;
  await page.route('**/api/experiment/submissions', async (route) => {
    const response = await route.fetch();
    if (!dropped) {
      dropped = true;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await page.getByLabel('确认内容', { exact: true }).fill('网络明确提交');
  await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('网络连接中断');
  await page.getByRole('button', { name: '重试同一提交', exact: true }).click();
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  expect((await services.admin.export(actor, s.experimentId)).transitions).toHaveLength(2);
});

test('loading prevents explicit submission during generation and failure leaves the state unchanged', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  releaseModel = () => {};
  await page.getByLabel('确认内容', { exact: true }).fill('生成中禁止提交');
  await page.getByLabel('发送消息', { exact: true }).fill('等待回复');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }),
  ).toBeDisabled();
  for (let n = 0; n < 100 && calls === 0; n++) await new Promise((r) => setTimeout(r, 10));
  releaseModel!();
  releaseModel = undefined;
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  failModel = true;
  await page.getByLabel('发送消息', { exact: true }).fill('失败输入');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page.getByText('回复未能生成，请重新发送或联系研究人员。', { exact: true }),
  ).toBeVisible();
  expect((await services.admin.export(actor, s.experimentId)).transitions).toHaveLength(1);
  failModel = false;
});

test('read-only administrator views state and conversation and downloads authorized bounded JSON', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  await page.getByLabel('发送消息', { exact: true }).fill('管理员可查看的合成对话');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  await page.getByRole('button', { name: '管理员入口', exact: true }).click();
  await page.getByLabel('管理员访问凭据', { exact: true }).fill(adminToken);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  await page.getByLabel('选择实验', { exact: true }).selectOption(s.experimentId);
  await expect(page.getByRole('cell', { name: s.code, exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'STEREOTYPE_CAPTURE', exact: true })).toBeVisible();
  await expect(page.getByLabel('管理员对话记录', { exact: true })).toContainText('管理员可查看');
  expect(await page.getByRole('button', { name: /修改|干预/ }).count()).toBe(0);
  await screenshot(page, 'admin-read-only');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整 JSON', exact: true }).click();
  const file = await download;
  expect(await file.failure()).toBeNull();
  const path = await file.path();
  if (!path) throw new Error('No download');
  const { readFile } = await import('node:fs/promises');
  const body = JSON.parse(await readFile(path, 'utf8'));
  expect(body.complete).toBe(true);
  expect(body.assignments[0].participant_id).toBe(s.participantId);
  expect(JSON.stringify(body)).not.toMatch(/password_hash|token_hash|SYNTHETIC_BROWSER_PASSWORD/);
  await saveRecords(s, 'browser-admin-export');
});

test('login errors are readable and a participant credential cannot open the administrator UI', async ({
  page,
}) => {
  const s = await account();
  await page.goto(base);
  await screenshot(page, 'participant-login');
  await page.getByLabel('实验编号', { exact: true }).fill(s.experimentId);
  await page.getByLabel('参与者编号', { exact: true }).fill(s.code);
  await page.getByLabel('密码', { exact: true }).fill('WRONG_SYNTHETIC_PASSWORD');
  await page.getByRole('button', { name: '登录实验', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录信息无效');
  const auth = await services.participants.login({
    experiment_id: s.experimentId,
    participant_code: s.code,
    password,
  });
  await page.getByRole('button', { name: '管理员入口', exact: true }).click();
  await page.getByLabel('管理员访问凭据', { exact: true }).fill(auth.token);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录信息无效');
  expect(await page.getByLabel('选择实验', { exact: true }).count()).toBe(0);
});

test('administrator explicitly opens read-only development data while participant views remain private', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  await page.getByLabel('发送消息', { exact: true }).fill('开发模式合成消息');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  await page.getByLabel('确认内容', { exact: true }).fill('开发模式明确表达');
  await page.getByLabel('你是从哪里了解到的？（选填）', { exact: true }).fill('开发模式明确来源');
  await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '管理员入口', exact: true }).click();
  await page.getByLabel('管理员访问凭据', { exact: true }).fill(adminToken);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  await page.getByLabel('选择实验', { exact: true }).selectOption(s.experimentId);
  await expect(page.getByLabel('开发模式（仅管理员）', { exact: true })).not.toBeChecked();
  expect(await page.getByLabel('管理员开发数据', { exact: true }).count()).toBe(0);
  await page.getByLabel('开发模式（仅管理员）', { exact: true }).check();
  await expect(page.getByLabel('管理员开发数据', { exact: true })).toContainText(
    'STEREOTYPE_SUBMITTED',
  );
  await expect(page.getByLabel('管理员开发数据', { exact: true })).toContainText('model_name');
  await expect(page.getByLabel('管理员开发数据', { exact: true })).toContainText(
    '开发模式明确来源',
  );
  await screenshot(page, 'admin-development');
  await page.getByRole('button', { name: '参与者入口', exact: true }).click();
  await login(page, s);
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  expect(await page.getByLabel('管理员开发数据', { exact: true }).count()).toBe(0);
  expect(await page.locator('body').innerText()).not.toMatch(
    /VIEWPOINT_CONFIRMATION|STEREOTYPE_SUBMITTED|validator|prompt_version|model_name/,
  );
  await saveRecords(s, 'browser-development-records');
});

test('a definitive stale-state rejection releases message retry and refresh resumes the database state', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  const auth = await services.participants.login({
    experiment_id: s.experimentId,
    participant_code: s.code,
    password,
  });
  const identity = await services.participants.authenticate(auth.token);
  const state = await services.participants.current(identity);
  await services.participants.submit(identity, {
    request_id: 'other-tab-submit',
    state_token: state.state_token,
    data: { response: '另一标签页明确提交', source: '已保存来源' },
  });
  await page.getByLabel('发送消息', { exact: true }).fill('旧状态消息');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('冲突');
  expect(await page.getByRole('button', { name: '重试同一消息', exact: true }).count()).toBe(0);
  await page.getByRole('button', { name: '刷新实验', exact: true }).click();
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  await page.getByLabel('发送消息', { exact: true }).fill('刷新后新消息');
  const delivered = page.waitForResponse(
    (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送', exact: true }).click();
  expect((await delivered).status()).toBe(200);
  await expect(page.locator('.pending-message')).toHaveCount(0);
  await expect(page.getByRole('log')).toContainText('刷新后新消息');
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.states[0].core_version).toBe(2);
  expect(data.messages).toHaveLength(2);
  expect(data.variables.find((v) => v.key === 'source').value).toBe('已保存来源');
});

test('rapid duplicate clicks create one user and one assistant message in sequence', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  releaseModel = () => {};
  await page.getByLabel('发送消息', { exact: true }).fill('双击消息');
  await page.getByRole('button', { name: '发送', exact: true }).dblclick();
  await expect(page.getByText('正在处理，请稍候。', { exact: true })).toBeVisible();
  for (let n = 0; n < 100 && calls === 0; n++) await new Promise((r) => setTimeout(r, 10));
  releaseModel!();
  releaseModel = undefined;
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  expect(calls).toBe(1);
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(data.messages.map((m) => m.sequence)).toEqual([1, 2]);
  expect(data.transitions).toHaveLength(1);
});

test('model failure and browser reload preserve advanced state and previously saved source', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  await page.getByLabel('确认内容', { exact: true }).fill('恢复用明确表达');
  await page.getByLabel('你是从哪里了解到的？（选填）', { exact: true }).fill('恢复用来源');
  await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  failModel = true;
  await page.getByLabel('发送消息', { exact: true }).fill('恢复用失败消息');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page.getByText('回复未能生成，请重新发送或联系研究人员。', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await login(page, s);
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  await expect(page.getByRole('log')).toContainText('恢复用失败消息');
  failModel = false;
  await page.getByLabel('发送消息', { exact: true }).fill('恢复后消息');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.states[0].core_version).toBe(2);
  expect(data.variables.find((v) => v.key === 'source').value).toBe('恢复用来源');
  expect(data.transitions).toHaveLength(2);
  await saveRecords(s, 'browser-recovery-records');
});

test('administrator inspects experiment version, failed turn, latency, validator and data quality without changing research state', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  failModel = true;
  await page.getByLabel('发送消息', { exact: true }).fill('异常记录测试');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(
    page.getByText('回复未能生成，请重新发送或联系研究人员。', { exact: true }),
  ).toBeVisible();
  failModel = false;
  await page.getByLabel('发送消息', { exact: true }).fill('异常后恢复对话');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  const before = await services.admin.export(actor, s.experimentId);
  await page.getByRole('button', { name: '管理员入口', exact: true }).click();
  await page.getByLabel('管理员访问凭据', { exact: true }).fill(adminToken);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  await page.getByLabel('选择实验', { exact: true }).selectOption(s.experimentId);
  await expect(
    page.getByLabel('选择实验', { exact: true }).locator('option:checked'),
  ).toContainText('v1');
  await expect(page.getByLabel('管理员对话记录', { exact: true })).toContainText('failed');
  await page.getByLabel('开发模式（仅管理员）', { exact: true }).check();
  const debug = page.getByLabel('管理员开发数据', { exact: true });
  await expect(debug).toContainText('response_latency');
  await expect(debug).toContainText('validator_result');
  await expect(debug).toContainText('MODEL_GENERATION_FAILED');
  await expect(debug).toContainText('"passed": true');
  await expect(debug.getByRole('heading', { name: '异常记录', exact: true })).toBeVisible();
  const after = await services.admin.export(actor, s.experimentId);
  expect(after.states).toEqual(before.states);
  expect(after.variables).toEqual(before.variables);
  expect(after.messages).toEqual(before.messages);
  await screenshot(page, 'admin-stability');
  await saveRecords(s, 'browser-admin-stability-records');
});

test('three page refreshes and new logins retain assignment, source, ordered messages and one explicit transition', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  await page.getByLabel('发送消息', { exact: true }).fill('多次刷新前消息');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  await page.getByLabel('确认内容', { exact: true }).fill('多次刷新明确表达');
  await page.getByLabel('你是从哪里了解到的？（选填）', { exact: true }).fill('多次刷新固定来源');
  await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
  await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
  const before = await services.admin.export(actor, s.experimentId);
  for (let n = 0; n < 3; n++) {
    await page.reload();
    await login(page, s);
    await expect(page.getByLabel('确认后的观点', { exact: true })).toBeVisible();
    await expect(page.getByRole('log')).toContainText('多次刷新前消息');
    const after = await services.admin.export(actor, s.experimentId);
    expect(after.states).toEqual(before.states);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.variables).toEqual(before.variables);
    expect(after.transitions).toEqual(before.transitions);
    expect(after.messages).toEqual(before.messages);
    expect(after.data_quality.passed).toBe(true);
  }
  expect(await page.locator('body').innerText()).not.toMatch(
    /VIEWPOINT_CONFIRMATION|STEREOTYPE_SUBMITTED|validator|prompt_version|model_name/,
  );
  await screenshot(page, 'participant-refresh-recovery');
  await saveRecords(s, 'browser-multiple-refresh-records');
});

test('Pilot Mode is administrator-only, opt-in and read-only, with no participant diagnostics after switching back', async ({
  page,
}) => {
  const s = await account();
  await login(page, s);
  await page.getByLabel('发送消息', { exact: true }).fill('内部试运行合成消息');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('谢谢分享');
  const before = await services.admin.export(actor, s.experimentId);
  await page.getByRole('button', { name: '管理员入口', exact: true }).click();
  await page.getByLabel('管理员访问凭据', { exact: true }).fill(adminToken);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  await page.getByLabel('选择实验', { exact: true }).selectOption(s.experimentId);
  await expect(
    page.getByRole('heading', { name: '内部试运行（Pilot Mode）', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('开发模式（仅管理员）', { exact: true })).not.toBeChecked();
  expect(await page.getByLabel('管理员开发数据', { exact: true }).count()).toBe(0);
  await page.getByLabel('开发模式（仅管理员）', { exact: true }).check();
  const diagnostic = page.getByLabel('管理员开发数据', { exact: true });
  for (const name of ['当前状态', '事件记录', '变量变化', '模型调用日志', '异常记录'])
    await expect(diagnostic.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(diagnostic).toContainText('"passed": true');
  await screenshot(page, 'admin-pilot-mode');
  await page.getByLabel('开发模式（仅管理员）', { exact: true }).uncheck();
  expect(await page.getByLabel('管理员开发数据', { exact: true }).count()).toBe(0);
  const after = await services.admin.export(actor, s.experimentId);
  expect(after.states).toEqual(before.states);
  expect(after.variables).toEqual(before.variables);
  expect(after.messages).toEqual(before.messages);
  expect(after.transitions).toEqual(before.transitions);
  await page.getByRole('button', { name: '参与者入口', exact: true }).click();
  await login(page, s);
  expect(await page.locator('body').innerText()).not.toMatch(
    /Pilot Mode|STEREOTYPE_CAPTURE|EXPERIMENT_STARTED|validator|prompt_version|model_name/,
  );
  await saveRecords(s, 'browser-pilot-mode-records');
});

test('hung message requests time out and retry with the same operation ID exactly once', async ({
  page,
}) => {
  const s = await account('daily_v1');
  await login(page, s);
  await page.clock.install();
  const ids: string[] = [];
  await page.route('**/api/conversation/message', async (route) => {
    ids.push(route.request().postDataJSON().request_id);
    if (ids.length === 1) {
      await route.fetch(); // The server saves successfully, but the browser never receives it.
      return;
    }
    await route.continue();
  });
  await page.getByLabel('发送消息', { exact: true }).fill('网络悬挂恢复样本');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => ids.length).toBe(1);
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(31000);
  await expect(page.getByRole('alert')).toContainText('请求等待超时');
  await expect(page.getByRole('button', { name: '重试同一消息', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '重试同一消息', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('网络悬挂恢复样本');
  await expect.poll(() => calls).toBe(1);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.messages).toHaveLength(2);
  expect(data.transitions).toHaveLength(1);
  await screenshot(page, 'participant-client-timeout-recovery');
  await saveRecords(s, 'browser-client-timeout-recovery');
});

test('pending generation polling has a recovery deadline and can refresh durable state', async ({
  page,
}) => {
  const s = await account('daily_v1');
  await login(page, s);
  await page.clock.install();
  let polls = 0;
  await page.route('**/api/experiment/current', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), status: 'generating', pending_turn_id: randomUUID() },
    });
  });
  await page.route('**/api/conversation/turns/*', () => {
    polls += 1;
  });
  await page.getByRole('button', { name: '刷新实验', exact: true }).click();
  await expect(page.getByText('回复生成中，请稍候。', { exact: true })).toBeVisible();
  await page.clock.fastForward(241000);
  await expect(page.getByRole('status').filter({ hasText: '等待回复已超时' })).toBeVisible();
  const bounded = polls;
  await page.clock.fastForward(60000);
  expect(polls).toBe(bounded);
  await page.unroute('**/api/experiment/current');
  await page.getByRole('button', { name: '刷新实验', exact: true }).click();
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
  await expect(page.getByLabel('发送消息', { exact: true })).toBeEnabled();
  expect(calls).toBe(0);
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.messages).toHaveLength(0);
  expect(data.transitions).toHaveLength(1);
});

test('mentor profile presents the same bounded rating card twice with an immutable belief', async ({
  page,
}) => {
  const s = await account('cognitive_v1', true);
  const auth = await services.participants.login({
    experiment_id: s.experimentId,
    participant_code: s.code,
    password,
  });
  const actor = await services.participants.authenticate(auth.token);
  const send = async (text: string) => {
    const current = await services.participants.current(actor);
    await services.conversations.send(actor, {
      state_token: current.state_token,
      request_id: randomUUID(),
      text,
    });
  };
  const submit = async (data: Record<string, string | number | boolean>) => {
    const current = await services.participants.current(actor);
    await services.participants.submit(actor, {
      state_token: current.state_token,
      request_id: randomUUID(),
      data,
    });
  };
  await send('媒体总说他们犯罪率高');
  await submit({ response: '媒体总说他们犯罪率高', source: '媒体' });
  await send('我确认这个印象');
  await submit({ viewpoint: '媒体总说他们犯罪率高', confirmed: true });
  await login(page, s);
  await expect(page.getByRole('group', { name: '观点评分卡', exact: true })).toContainText(
    '媒体总说他们犯罪率高',
  );
  await expect(page.getByLabel('当前评分', { exact: true })).toHaveAttribute('min', '0');
  await expect(page.getByLabel('当前评分', { exact: true })).toHaveAttribute('max', '100');
  await expect(page.getByLabel('当前评分', { exact: true })).toHaveAttribute('step', '1');
  await page.getByLabel('当前评分', { exact: true }).fill('1.5');
  await expect(
    page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }),
  ).toBeDisabled();
  await send('准备评分');
  await submit({ rating: 0 });
  for (let i = 0; i < 4; i++) {
    await send('我开始考虑其他因素');
    await send('不同个体不应被一概而论');
    await submit({ response: '当前阶段回答' });
  }
  await page.getByRole('button', { name: '刷新实验', exact: true }).click();
  await expect(page.getByRole('group', { name: '观点评分卡', exact: true })).toContainText(
    '媒体总说他们犯罪率高',
  );
  await expect(page.getByRole('group', { name: '观点评分卡', exact: true })).toContainText(
    '完全不相信该观点',
  );
  await screenshot(page, 'mentor-unified-rating-card');
});

for (const paragraphs of ['A\nB\nC', 'A\n\nB\nC\n\nD'])
  test(`assistant bubbles survive reload without content loss: ${JSON.stringify(paragraphs)}`, async ({
    page,
  }) => {
    const s = await account('daily_v1');
    bubbleReply = paragraphs;
    await login(page, s);
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
    );
    await page.getByLabel('发送消息', { exact: true }).fill('检查多段阅读体验');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.locator('.message.assistant .bubble')).toHaveCount(3);
    const expected = paragraphs.includes('D') ? ['A', 'B', 'C\nD'] : ['A', 'B', 'C'];
    expect(await page.locator('.message.assistant .bubble').allTextContents()).toEqual(expected);
    const userBox = await page.locator('.message.user .bubble').boundingBox(),
      aiBox = await page.locator('.message.assistant .bubble').first().boundingBox();
    expect(userBox!.x).toBeGreaterThan(aiBox!.x);
    await screenshot(
      page,
      paragraphs.includes('D') ? 'four-paragraphs-three-bubbles' : 'three-paragraphs-three-bubbles',
    );
    await page.reload();
    await login(page, s);
    expect(await page.locator('.message.assistant .bubble').allTextContents()).toEqual(expected);
    await expect(page.getByText('当前填写', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '结束本次对话', exact: true }).click();
    await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
  });

test('optimistic user bubble appears immediately while generation waits and becomes one durable message', async ({
  page,
}) => {
  const s = await account('daily_v1');
  await login(page, s);
  releaseModel = () => {};
  await page.getByLabel('发送消息', { exact: true }).fill('这条消息应立即出现在右侧');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.pending-message .bubble')).toHaveText('这条消息应立即出现在右侧');
  await expect(page.getByRole('button', { name: '处理中…', exact: true })).toBeDisabled();
  await expect.poll(() => calls).toBe(1);
  releaseModel?.();
  releaseModel = undefined;
  await expect(page.locator('.pending-message')).toHaveCount(0);
  await expect(page.locator('.message.user')).toHaveCount(1);
  await expect(page.getByLabel('发送消息', { exact: true })).toHaveValue('');
});

for (const path of ['cognitive_v1', 'emotion_v1'])
  test(`complete frozen mentor path through chat cards: ${path}`, async ({ page }) => {
    test.setTimeout(90000);
    const s = await account(path, true);
    variedStoryReplies = path === 'emotion_v1';
    await login(page, s);
    const uow = new UnitOfWork(pool);
    let iterations = 0;
    while (iterations++ < 15) {
      let bundle = await uow.read((r) => r.states.load(s.participantId));
      if (bundle!.status === 'completed') break;
      const stage = bundle!.snapshot.stage;
      const count = await uow.read((r) =>
        r.conversations.turnCounts(bundle!.session_id, turnStages(bundle!)),
      );
      const local = await uow.read((r) => r.conversations.turnCounts(bundle!.session_id, [stage]));
      const needed = Math.max(limits(bundle!).min - count.effective, local.effective === 0 ? 1 : 0);
      for (let i = 0; i < needed; i++) {
        const input =
          path === 'cognitive_v1'
            ? `媒体让我觉得美国黑人犯罪率高，我想了解个体和环境差异。合成补充${iterations}-${i}`
            : `Marcus喜欢音乐，李阳慢热，他们继续交流眼前的经历和感受。合成补充${iterations}-${i}`;
        const completed = page.waitForResponse(
          (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
        );
        await page.getByLabel('发送消息', { exact: true }).fill(input);
        await page.getByRole('button', { name: '发送', exact: true }).click();
        expect((await completed).status()).toBe(200);
        await expect(page.locator('.pending-message')).toHaveCount(0);
      }
      bundle = await uow.read((r) => r.states.load(s.participantId));
      if (bundle!.snapshot.stage !== stage) {
        await page.getByRole('button', { name: '刷新实验', exact: true }).click();
        continue;
      }
      await expect(page.getByText('当前填写', { exact: true })).toHaveCount(0);
      await expect(page.locator('.agent-avatar')).toHaveCount(0);
      await expect(page.locator('.agent-identity')).toHaveCount(0);
      const fields = bundle!.definition.stages.find((x) => x.id === stage)!.fields;
      for (const f of fields) {
        if (f.type === 'number')
          await page
            .getByLabel('当前评分', { exact: true })
            .fill(stage === 'SECOND_RATING' ? '35' : '70');
        else if (f.type === 'confirmation')
          await page.getByLabel('我确认上述观点', { exact: true }).check();
        else
          await page
            .getByLabel(f.field === 'viewpoint' ? '确认后的观点' : '确认内容', { exact: true })
            .fill(
              path === 'cognitive_v1'
                ? '媒体让我觉得美国黑人犯罪率高'
                : 'Marcus和李阳通过音乐与学习经历逐渐加深理解。',
            );
      }
      if (stage === 'INITIAL_RATING') await screenshot(page, 'cognitive-rating-inline');
      if (stage === 'RELATIONSHIP') await screenshot(page, 'emotional-story-inline');
      if (stage === 'SECOND_RATING') {
        const before = await page.locator('.message.assistant .bubble').allTextContents();
        await page.reload();
        await login(page, s);
        expect(await page.locator('.message.assistant .bubble').allTextContents()).toEqual(before);
        await page.getByLabel('当前评分', { exact: true }).fill('35');
      }
      for (const message of await page.locator('.message.assistant').all())
        expect(await message.locator('.bubble').count()).toBeLessThanOrEqual(3);
      const submitted = page.waitForResponse(
        (r) => r.url().endsWith('/api/experiment/submissions') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /确认并继续|提交评分/, exact: true }).click();
      const submissionResponse = await submitted;
      expect(
        submissionResponse.status(),
        stage +
          ' ' +
          (await submissionResponse.text()) +
          ' counts=' +
          JSON.stringify(
            await uow.read((r) =>
              r.conversations.turnCounts(bundle!.session_id, turnStages(bundle!)),
            ),
          ),
      ).toBe(200);
    }
    await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
    const output = await services.admin.export(actor, s.experimentId);
    expect(output.complete).toBe(true);
    expect(output.states[0].status).toBe('completed');
    if (path === 'cognitive_v1') {
      expect(output.variables.some((v) => v.key === 'rating_1' && v.value === 70)).toBe(true);
      expect(output.variables.some((v) => v.key === 'rating_2' && v.value === 35)).toBe(true);
    }
    await screenshot(page, path === 'cognitive_v1' ? 'cognitive-complete' : 'emotional-complete');
    await saveRecords(
      s,
      path === 'cognitive_v1' ? 'mentor-cognitive-complete' : 'mentor-emotional-complete',
    );
  });

test('two daily identity groups follow frozen assignment after relogin, finish independently, and fit a mobile screen', async ({
  page,
}) => {
  const e = await services.experiments.create(actor, {
    name: '日常身份分配合成实验',
    instructions: '两个合成身份用于界面和隔离验证，不是正式人物材料。',
  });
  const configs = [
    {
      code: 'A',
      name: '合成智能体甲',
      identity: '合成身份甲 · 仅用于界面分配验收',
      avatar: '/agent-avatars/synthetic-a.svg',
    },
    {
      code: 'B',
      name: '合成智能体乙',
      identity: '合成身份乙 · 仅用于界面分配验收',
      avatar: '/agent-avatars/synthetic-b.svg',
    },
  ];
  const conditions = [];
  for (const c of configs)
    conditions.push(
      await services.experiments.condition(actor, e.experimentId, {
        code: c.code,
        path_version: 'daily_v1',
        agent_name: c.name,
        participant_display: { identity: c.identity, avatar: c.avatar },
        demo_policies: true,
      }),
    );
  await services.experiments.publish(actor, e.experimentId);
  for (let i = 0; i < configs.length; i++) {
    const c = configs[i]!,
      code = 'DAILY-' + randomUUID().slice(0, 8),
      p = await services.participants.create(actor, {
        experiment_id: e.experimentId,
        participant_code: code,
        password,
      });
    await services.experiments.assign(actor, {
      participant_id: p.participantId,
      condition_id: conditions[i]!.conditionId,
    });
    const s = { ...e, ...p, code };
    if (i === 1) await page.setViewportSize({ width: 390, height: 844 });
    await login(page, s);
    await expect(
      page.getByRole('heading', { name: `与 ${c.name} 对话`, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.agent-identity')).toHaveText(c.identity);
    await expect(page.locator('.agent-avatar')).toHaveAttribute('src', c.avatar);
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
    );
    await page.getByLabel('发送消息', { exact: true }).fill('今天我想聊聊音乐和阅读。');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.locator('.pending-message')).toHaveCount(0);
    await screenshot(page, i === 0 ? 'daily-identity-a-desktop' : 'daily-identity-b-mobile');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.reload();
    await login(page, s);
    await expect(page.locator('.agent-identity')).toHaveText(c.identity);
    await expect(page.locator('.agent-avatar')).toHaveAttribute('src', c.avatar);
    await expect(page.getByRole('log')).toContainText('今天我想聊聊音乐和阅读。');
    await page.getByRole('button', { name: '结束本次对话', exact: true }).click();
    await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
    await saveRecords(s, `daily-identity-${c.code}-complete`);
  }
});

test('administrator creates 30 synthetic login accounts and downloads real XLSX; two downloaded accounts login in separate tabs', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const e = await services.experiments.create(actor, {
    name: '批量30个浏览器合成账号',
    instructions: '合成账号下载验收，不属于正式数据。',
  });
  const c = await services.experiments.condition(actor, e.experimentId, {
    code: 'UI-GROUP',
    path_version: 'daily_v1',
    agent_name: '合成日常助手',
    demo_policies: true,
  });
  await services.experiments.publish(actor, e.experimentId);
  await page.goto(base);
  await page.getByRole('button', { name: '管理员入口', exact: true }).click();
  await page.getByLabel('管理员访问凭据', { exact: true }).fill(adminToken);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  const optionsResponse = page.waitForResponse((r) =>
    r.url().includes('/api/admin/account-options?'),
  );
  await page.getByLabel('选择实验', { exact: true }).selectOption(e.experimentId);
  const opts = await optionsResponse;
  expect(opts.status(), await opts.text()).toBe(200);
  expect((await opts.json()).some((o: { path: string }) => o.path === 'daily')).toBe(true);
  await page.getByLabel('实验路径', { exact: true }).selectOption('daily');
  await page.getByLabel('实验条件与组别', { exact: true }).selectOption(c.conditionId);
  await page.getByLabel('账号数量', { exact: true }).fill('30');
  await page.getByLabel('编号前缀', { exact: true }).fill('BROWSER');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/account-batches') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '批量创建实验账号', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole('button', { name: '下载登录账号 Excel', exact: true })).toBeVisible();
  await screenshot(page, 'admin-account-management');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载登录账号 Excel', exact: true }).click();
  const file = await downloaded;
  const location = await file.path();
  expect(location).toBeTruthy();
  const bytes = await readFile(location!);
  const matrix = JSON.parse(
    execFileSync(
      'python',
      [
        '-c',
        'import io,sys,json,openpyxl;w=openpyxl.load_workbook(io.BytesIO(sys.stdin.buffer.read()),read_only=True);print(json.dumps(list(w.active.values),ensure_ascii=False))',
      ],
      { input: bytes, encoding: 'utf8' },
    ),
  ) as string[][];
  expect(matrix.length).toBe(31);
  const rows = matrix.slice(1).map((v) => Object.fromEntries(matrix[0]!.map((k, i) => [k, v[i]!])));
  const pages = [await context.newPage(), await context.newPage()];
  for (let i = 0; i < 2; i++) {
    const p = pages[i]!,
      r = rows[i]!;
    await p.goto(base);
    await p.getByLabel('实验编号', { exact: true }).fill(r.experiment_id!);
    await p.getByLabel('参与者编号', { exact: true }).fill(r.participant_code!);
    await p.getByLabel('密码', { exact: true }).fill(r.initial_password!);
    await p.getByRole('button', { name: '登录实验', exact: true }).click();
    await p.getByRole('button', { name: '开始／继续对话', exact: true }).click();
    const reply = p.waitForResponse(
      (x) => x.url().endsWith('/api/conversation/message') && x.request().method() === 'POST',
    );
    await p.getByLabel('发送消息', { exact: true }).fill('下载账号独立消息 ' + r.participant_code);
    await p.getByRole('button', { name: '发送', exact: true }).click();
    expect((await reply).status()).toBe(200);
    await expect(p.locator('.pending-message')).toHaveCount(0);
  }
  for (let i = 0; i < 2; i++) {
    await expect(pages[i]!.getByRole('log')).toContainText(rows[i]!.participant_code!);
    await expect(pages[i]!.getByRole('log')).not.toContainText(rows[1 - i]!.participant_code!);
    await pages[i]!.close();
  }
});
