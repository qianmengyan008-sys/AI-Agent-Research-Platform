import { UnitOfWork } from '../../api/src/repositories/context.js';
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
        ? `你提到“${JSON.parse(belief)}”。我们可以结合实际经历理解。合成回复${calls}。`
        : `谢谢分享，我们可以继续交流。合成回复${calls}。`;
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
  await expect(page.getByRole('heading', { name: /^与 .* 对话$/ })).toBeVisible();
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

test('lost message response is replayed with the same key without another generation', async ({
  page,
}) => {
  const s = await account('daily_v1');
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

test('login errors are readable and a participant credential cannot open the administrator UI', async ({
  page,
}) => {
  const s = await account('daily_v1');
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

test('rapid duplicate clicks create one user and one assistant message in sequence', async ({
  page,
}) => {
  const s = await account('daily_v1');
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

test('Pilot Mode is administrator-only, opt-in and read-only, with no participant diagnostics after switching back', async ({
  page,
}) => {
  const s = await account('daily_v1');
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
async function sayUI(page: Page, text: string) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/conversation/message') && r.request().method() === 'POST',
  );
  await page.getByLabel('发送消息', { exact: true }).fill(text);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('.pending-message')).toHaveCount(0);
}
async function submitUI(page: Page, rating?: number) {
  if (rating !== undefined) await page.getByLabel('当前评分', { exact: true }).fill(String(rating));
  else await page.getByLabel('我确认上述观点', { exact: true }).check();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/experiment/submissions') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: rating === undefined ? '确认并继续' : '提交评分', exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
}
for (const path of ['cognitive_v1', 'emotion_v1', 'daily_v1'])
  test(`automatic first greeting and path-specific material without user input: ${path}`, async ({
    page,
  }) => {
    const s = await account(path, true);
    await login(page, s);
    const bubbles = page.locator('.message.assistant');
    await expect(bubbles.first()).toContainText('嗨，很高兴认识你！');
    expect((await bubbles.first().locator('.bubble').allTextContents()).join('')).toBe(
      '嗨，很高兴认识你！我平时很关注时事新闻，也特别想听听你的看法。你现在方便聊几句吗？',
    );
    expect(calls).toBe(0);
    await expect(page.locator('.message.user')).toHaveCount(0);
    await expect(page.getByLabel('确认内容', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('你是从哪里了解到的？（选填）', { exact: true })).toHaveCount(0);
    if (path === 'emotion_v1') await expect(bubbles.nth(1)).toContainText('《打破心墙》');
    if (path === 'cognitive_v1') await expect(bubbles.nth(1)).toContainText('美国黑人');
    const texts = await bubbles.allTextContents();
    await page.reload();
    await login(page, s);
    expect(await bubbles.allTextContents()).toEqual(texts);
    await screenshot(page, 'automatic-opening-' + path);
  });
for (const text of [
  'A\nB\nC',
  'A\n\nB\nC\nD',
  '完整第一句。完整第二句！完整第三句？不能丢失的第四句。',
])
  test(`at most three complete bubbles, preserved full text and side alignment: ${JSON.stringify(text)}`, async ({
    page,
  }) => {
    const s = await account('daily_v1');
    await login(page, s);
    bubbleReply = text;
    await sayUI(page, '气泡布局验收');
    const group = page.locator('.message.assistant').last();
    expect(await group.locator('.bubble').count()).toBe(3);
    const rendered = await group.locator('.bubble').allTextContents();
    expect(rendered.join('').replaceAll('\n', '')).toBe(text.replaceAll('\n', ''));
    const user = await page.locator('.message.user .bubble').last().boundingBox(),
      ai = await group.locator('.bubble').first().boundingBox();
    expect(user!.x).toBeGreaterThan(ai!.x);
    const before = await page.locator('.message').allTextContents();
    await page.reload();
    await login(page, s);
    expect(await page.locator('.message').allTextContents()).toEqual(before);
    await screenshot(
      page,
      'three-bubbles-' +
        (text.startsWith('A\n\n') ? 'four' : text.startsWith('A') ? 'three' : 'sentences'),
    );
  });
test('full frozen cognitive browser flow uses only chat input plus current confirmation/rating cards; cards become durable read-only history', async ({
  page,
}) => {
  test.setTimeout(90000);
  const s = await account('cognitive_v1', true);
  await login(page, s);
  const uow = new UnitOfWork(pool),
    stages: string[] = [];
  const belief = '我原先认为美国黑人都不重视学习。';
  for (let i = 0; i < 30; i++) {
    const b = (await uow.read((r) => r.states.load(s.participantId)))!;
    const stage = b.snapshot.stage;
    if (stages.at(-1) !== stage) stages.push(stage);
    if (stage === 'COMPLETED') break;
    await expect(page.getByLabel('确认内容', { exact: true })).toHaveCount(0);
    expect(await page.locator('textarea').count()).toBe(1);
    if (stage === 'VIEWPOINT_CONFIRMATION') {
      await expect(page.getByLabel('本段确认卡')).toContainText(belief);
      await screenshot(page, 'cognitive-viewpoint-card');
      await submitUI(page);
    } else if (stage === 'INITIAL_RATING' || stage === 'SECOND_RATING') {
      await expect(page.getByLabel('观点评分卡')).toContainText(belief);
      await expect(page.getByRole('button', { name: '提交评分', exact: true })).toBeInViewport({
        ratio: 1,
      });
      if (stage === 'SECOND_RATING') {
        const h = await page.locator('.message').allTextContents();
        await page.reload();
        await login(page, s);
        expect(await page.locator('.message').allTextContents()).toEqual(h);
      }
      await screenshot(
        page,
        stage === 'INITIAL_RATING' ? 'cognitive-initial-rating' : 'cognitive-second-rating',
      );
      await submitUI(page, stage === 'INITIAL_RATING' ? 70 : 35);
    } else {
      await expect(page.getByRole('button', { name: '确认并继续', exact: true })).toHaveCount(0);
      if (stage === 'REFRAME_MEDIA_ALGORITHM') await screenshot(page, 'cognitive-one-composer');
      await sayUI(
        page,
        stage === 'STEREOTYPE_CAPTURE'
          ? i === 0
            ? belief
            : '这个印象来自以前刷到的短视频。'
          : `我愿意结合具体经历核实这个看法，并减少传播未经证实的信息。合成回答${i}。`,
      );
    }
    for (const group of await page.locator('.message.assistant').all())
      expect(await group.locator('.bubble').count()).toBeLessThanOrEqual(3);
  }
  expect(stages).toEqual([
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
  await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
  await expect(page.locator('.completed-card')).toHaveCount(3);
  await screenshot(page, 'cognitive-complete');
  await saveRecords(s, 'browser-cognitive-complete');
  // Admin history is independent of the development-mode checkbox.
  await page.getByRole('button', { name: '管理员入口', exact: true }).click();
  await page.getByLabel('管理员访问凭据', { exact: true }).fill(adminToken);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  await page.getByLabel('选择实验', { exact: true }).selectOption(s.experimentId);
  await page.getByLabel('查询参与者', { exact: true }).selectOption(s.participantId);
  await page.getByLabel('查询实验路径', { exact: true }).selectOption('cognitive');
  await page.getByRole('button', { name: '查询完整记录', exact: true }).click();
  const history = page.getByLabel('完整记录结果', { exact: true });
  await expect(history).toContainText('RATING_SUBMITTED');
  await expect(history).toContainText('"rating":70');
  await expect(history).toContainText('"rating":35');
  await expect(history).toContainText('VIEWPOINT_CONFIRMED');
  await expect(history.locator('time').first()).toBeVisible();
  await expect(history).toContainText(belief);
  await screenshot(page, 'admin-complete-history');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整 JSON', exact: true }).click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(data.complete).toBe(true);
  expect(data.notices.length).toBeGreaterThan(3);
  expect(JSON.stringify(data)).not.toContain(password);
});
test('full emotional browser flow retains Marcus, 李阳, ordered scenes, exact ending and restored history', async ({
  page,
}) => {
  test.setTimeout(90000);
  const s = await account('emotion_v1', true);
  variedStoryReplies = true;
  await login(page, s);
  const uow = new UnitOfWork(pool),
    stages: string[] = [];
  for (let i = 0; i < 25; i++) {
    const b = (await uow.read((r) => r.states.load(s.participantId)))!;
    const stage = b.snapshot.stage;
    if (stages.at(-1) !== stage) stages.push(stage);
    if (stage === 'COMPLETED') break;
    await expect(page.getByRole('button', { name: '确认并继续', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('确认内容', { exact: true })).toHaveCount(0);
    if (stage === 'SHARED_EXPERIENCE') {
      await screenshot(page, 'emotional-shared-experience');
      const h = await page.locator('.message').allTextContents();
      await page.reload();
      await login(page, s);
      expect(await page.locator('.message').allTextContents()).toEqual(h);
    }
    await sayUI(page, `Marcus喜欢音乐，李阳愿意分享当前经历，逐渐理解彼此。合成回应${i}。`);
  }
  expect(stages).toEqual([
    'PERSONA_SETUP',
    'FIRST_CONTACT',
    'MISUNDERSTANDING',
    'RESOLUTION',
    'SHARED_EXPERIENCE',
    'RELATIONSHIP',
    'ENDING_FEEDBACK',
    'COMPLETED',
  ]);
  await expect(
    page.getByText('今天我们一起完成了Marcus和李阳从陌生到理解的故事，谢谢你参与这次创作。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.agent-avatar')).toHaveCount(0);
  await screenshot(page, 'emotional-complete');
  await saveRecords(s, 'browser-emotional-complete');
});
test('lost viewpoint confirmation response replays same event and leaves a single read-only record', async ({
  page,
}) => {
  const s = await account('cognitive_v1', true);
  await login(page, s);
  await sayUI(page, '我原先认为美国黑人都不重视学习。');
  await sayUI(page, '这个印象来自短视频。');
  let dropped = false;
  await page.route('**/api/experiment/submissions', async (route) => {
    const response = await route.fetch();
    if (!dropped) {
      dropped = true;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await page.getByLabel('我确认上述观点', { exact: true }).check();
  await page.getByRole('button', { name: '确认并继续', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('网络连接中断');
  await page.getByRole('button', { name: '重试同一提交', exact: true }).click();
  await expect(page.getByRole('button', { name: '提交评分', exact: true })).toBeVisible();
  await expect(page.locator('.completed-card')).toHaveCount(1);
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.transitions.filter((t) => t.event === 'VIEWPOINT_CONFIRMED')).toHaveLength(1);
});
test('failed model request leaves phase and records intact and ordinary retry has no extra confirmation window', async ({
  page,
}) => {
  const s = await account('cognitive_v1', true);
  await login(page, s);
  failModel = true;
  await sayUI(page, '我原先的印象来自新闻。');
  await expect(
    page.getByText('回复未能生成，请重新发送或联系研究人员。', { exact: true }),
  ).toBeVisible();
  const before = await services.admin.export(actor, s.experimentId);
  expect(before.transitions).toHaveLength(1);
  failModel = false;
  await sayUI(page, '我原先认为美国黑人都不重视学习。');
  await expect(page.getByLabel('确认内容', { exact: true })).toHaveCount(0);
  await page.reload();
  await login(page, s);
  await expect(page.getByRole('log')).toContainText('我原先的印象来自新闻。');
});
test('stale chat state is rejected and refresh restores the same confirmed belief without a repeat window', async ({
  page,
}) => {
  const s = await account('cognitive_v1', true);
  await login(page, s);
  await sayUI(page, '我原先认为美国黑人都不重视学习。');
  await sayUI(page, '这个印象来自短视频。');
  const auth = await services.participants.login({
    experiment_id: s.experimentId,
    participant_code: s.code,
    password,
  });
  const actor = await services.participants.authenticate(auth.token),
    state = await services.participants.current(actor);
  await services.participants.submit(actor, {
    interaction: 'chat',
    state_token: state.state_token,
    request_id: randomUUID(),
    data: { viewpoint: state.confirmation_card!.belief, confirmed: true },
  });
  const rejected = page.waitForResponse((r) => r.url().endsWith('/api/conversation/message'));
  await page.getByLabel('发送消息', { exact: true }).fill('旧状态发送');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  expect((await rejected).status()).toBe(409);
  await expect(page.getByRole('alert')).toContainText('冲突');
  await expect(page.getByRole('button', { name: '重试同一消息', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '刷新实验', exact: true }).click();
  await expect(page.getByLabel('观点评分卡')).toContainText('我原先认为美国黑人都不重视学习。');
});
test('long accepted reply has its complete final sentence and no CSS clipping on mobile', async ({
  page,
}) => {
  const s = await account('daily_v1');
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, s);
  const reply = '完整研究信息' + '需要保留原文'.repeat(180) + '，这是完整结束句。';
  bubbleReply = reply;
  await sayUI(page, '长正文显示验收');
  const bubble = page.locator('.message.assistant').last().locator('.bubble');
  await expect(bubble).toHaveText(reply);
  expect(await bubble.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await screenshot(page, 'long-complete-reply-mobile');
});
test('mobile cognitive path completes with valid 0 and 100 ratings and an accessible submit button', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const s = await account('cognitive_v1', true);
  await login(page, s);
  const uow = new UnitOfWork(pool);
  for (let i = 0; i < 30; i++) {
    const stage = (await uow.read((r) => r.states.load(s.participantId)))!.snapshot.stage;
    if (stage === 'COMPLETED') break;
    if (stage === 'VIEWPOINT_CONFIRMATION') await submitUI(page);
    else if (stage === 'INITIAL_RATING' || stage === 'SECOND_RATING') {
      const button = page.getByRole('button', { name: '提交评分', exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      await expect(button).toBeDisabled();
      await page.getByLabel('当前评分', { exact: true }).fill('101');
      await expect(button).toBeDisabled();
      await screenshot(page, 'mobile-' + stage.toLowerCase());
      await submitUI(page, stage === 'INITIAL_RATING' ? 0 : 100);
    } else
      await sayUI(
        page,
        i === 0
          ? '我原先认为美国黑人都不重视学习。'
          : i === 1
            ? '这个印象来自短视频。'
            : `我愿意结合具体经历核实信息，减少传播一概而论的说法。手机合成回应${i}。`,
      );
  }
  await expect(page.getByText('本次实验已完成，谢谢参与。', { exact: true })).toBeVisible();
  const data = await services.admin.export(actor, s.experimentId);
  expect(data.variables.find((v) => v.key === 'rating_1')!.value).toBe(0);
  expect(data.variables.find((v) => v.key === 'rating_2')!.value).toBe(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await screenshot(page, 'mobile-cognitive-complete');
});
test('a generated reply and following task guide use one visual AI round with at most three bubbles', async ({
  page,
}) => {
  const s = await account('cognitive_v1', true);
  await login(page, s);
  bubbleReply = 'A\nB\nC';
  await sayUI(page, '我原先认为美国黑人都不重视学习。');
  const last = page.locator('.message.assistant').last();
  await expect(last.locator('.bubble')).toHaveCount(3);
  await expect(last).toContainText('这个印象主要来自直接接触、媒体还是其他来源？');
  const history = await page.locator('.message').allTextContents();
  await page.reload();
  await login(page, s);
  expect(await page.locator('.message').allTextContents()).toEqual(history);
});
