import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output) throw Error('NEW_ACCEPTANCE_OUTPUT_DIRECTORY_REQUIRED');
await mkdir(resolve(output));
const tag = 'r29-' + randomUUID(),
  net = tag + '-net',
  volume = tag + '-data',
  db = tag + '-db',
  web = tag + '-web';
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
const admin = 'OFFLINE_CONTAINER_ADMIN_TOKEN_32_CHARS',
  seed = 'OFFLINE_CONTAINER_SEED_SECRET_32_CHARS',
  key = 'OFFLINE_NO_PROVIDER_CALLS',
  pwd = 'OFFLINE_CONTAINER_DATABASE_PASSWORD';
const report = {
  status: 'pending',
  external_provider_calls: 0,
  public_staging_tested: false,
  checks: {},
  image: 'research-hosted-round29',
  runtime_node: null,
};
let browser, base, accounts;
async function req(path, token = '', body, status = 200) {
  const r = await fetch(base + path, {
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (r.status !== status) throw Error('UNEXPECTED_HTTP_STATUS_' + r.status);
  return r.json();
}
async function ready() {
  for (let i = 0; i < 120; i++) {
    try {
      await req('/api/ready');
      return;
    } catch {
      /* Best-effort readiness probe or cleanup of owned resources. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('HOSTED_NOT_READY');
}
const snapshot = (d) =>
  JSON.stringify({
    states: d.states,
    messages: d.messages,
    variables: d.variables,
    transitions: d.transitions,
    turns: d.turns,
    runs: d.runs,
  });
const hash = (s) => createHash('sha256').update(s).digest('hex');
try {
  docker('network', 'create', net);
  docker('volume', 'create', volume);
  docker(
    'run',
    '-d',
    '--name',
    db,
    '--network',
    net,
    '--network-alias',
    'database',
    '-v',
    volume + ':/var/lib/postgresql/data',
    '-e',
    'POSTGRES_PASSWORD=' + pwd,
    'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2',
  );
  for (let i = 0; i < 60; i++) {
    try {
      docker('exec', db, 'pg_isready', '-U', 'postgres');
      break;
    } catch {
      /* Best-effort readiness probe or cleanup of owned resources. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const env = {
    DATABASE_URL: `postgres://postgres:${pwd}@database:5432/postgres`,
    ADMIN_ACCESS_TOKEN: admin,
    RESEARCH_BOOTSTRAP_SECRET: seed,
    DEEPSEEK_API_KEY: key,
    RESEARCH_DATABASE_SCOPE: 'isolated-staging',
    RESEARCH_BOOTSTRAP_COUNT: '45',
    MODEL_PROVIDER: 'deepseek',
    DEEPSEEK_MODEL_NAME: 'deepseek-flash',
    MODEL_TEMPERATURE: '0.2',
    MODEL_MAX_TOKENS: '512',
    MODEL_TIMEOUT_MS: '10000',
    MODEL_MAX_ATTEMPTS: '2',
    ADMIN_DEVELOPMENT_MODE: 'true',
    DB_POOL_SIZE: '10',
  };
  docker(
    'run',
    '-d',
    '--name',
    web,
    '--network',
    net,
    '--add-host',
    'api.deepseek.com:127.0.0.1',
    '-p',
    '127.0.0.1::10000',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', k + '=' + v]),
    'research-hosted-round29',
  );
  base = 'http://' + docker('port', web, '10000/tcp');
  await ready();
  report.runtime_node = docker('exec', web, 'node', '-p', 'process.versions.node');
  report.checks.non_root_runtime = docker('exec', web, 'id', '-u') !== '0';
  accounts = await req('/api/admin/hosted-accounts', admin);
  report.checks.seeded_45_blinded_accounts =
    accounts.accounts.length === 45 &&
    accounts.accounts.every((a) => /^B001-P\d{4}$/.test(a.participant_code));
  await req('/api/admin/hosted-accounts', '', undefined, 401);
  report.checks.unauthenticated_accounts_denied = true;
  const emo = accounts.accounts[1];
  const login = await req('/api/auth/login', '', {
    experiment_id: accounts.experiment_id,
    participant_code: emo.participant_code,
    password: emo.password,
  });
  await req('/api/admin/hosted-accounts', login.token, undefined, 401);
  report.checks.participant_accounts_denied = true;
  const state = await req('/api/experiment/current', login.token);
  const turn = await req('/api/conversation/message', login.token, {
    state_token: state.state_token,
    request_id: 'docker-round29-template-only',
    text: '李阳慢热，Marcus喜欢音乐，希望继续了解他们。',
  });
  if (turn.status !== 'ready') throw Error('TEMPLATE_TURN_NOT_READY');
  const data = await req('/api/admin/export?experiment_id=' + accounts.experiment_id, admin);
  report.checks.complete_export = data.complete && data.analysis_rows.length === 45;
  report.checks.template_only_turn =
    data.messages.length === 2 &&
    data.turns.length === 1 &&
    data.turns[0].generation_context?.reply_source === 'template';
  report.checks.no_export_secrets = ![admin, seed, key, pwd].some((s) =>
    JSON.stringify(data).includes(s),
  );
  const html = await (await fetch(base + '/operator')).text();
  report.checks.public_operator_contains_no_account_password = accounts.accounts.every(
    (a) => !html.includes(a.password),
  );
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.name));
  await page.goto(base + '/operator');
  await page.locator('#admin-token').fill(admin);
  await page.getByRole('button', { name: '读取固定测试账号' }).click();
  await page.locator('#operator-result tr').last().waitFor();
  report.checks.operator_browser_45_accounts =
    (await page.locator('#operator-result tr').count()) === 45;
  report.checks.operator_clears_admin_input =
    (await page.locator('#admin-token').inputValue()) === '';
  const bstate = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }));
  report.checks.operator_no_browser_storage = bstate.local === 0 && bstate.session === 0;
  await page.goto(base + '/');
  report.checks.same_origin_react_entry = await page
    .getByRole('heading', { name: 'AI Agent 在线对话研究平台' })
    .isVisible();
  report.checks.browser_no_script_errors = errors.length === 0;
  for (const account of accounts.accounts.slice(0, 3)) {
    await page.goto(base + '/');
    await page.getByLabel('实验编号', { exact: true }).fill(accounts.experiment_id);
    await page.getByLabel('参与者编号', { exact: true }).fill(account.participant_code);
    await page.getByLabel('密码', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: '登录实验', exact: true }).click();
    await page.getByRole('button', { name: '开始／继续对话' }).click();
    await page.locator('textarea').waitFor();
    report.checks['browser_login_' + account.path] = true;
  }
  await browser.close();
  browser = null;
  docker('restart', web);
  base = 'http://' + docker('port', web, '10000/tcp');
  await ready();
  const restoredAccounts = await req('/api/admin/hosted-accounts', admin);
  const restored = await req('/api/admin/export?experiment_id=' + accounts.experiment_id, admin);
  report.checks.process_restart_retains_accounts =
    JSON.stringify(accounts) === JSON.stringify(restoredAccounts);
  report.checks.process_restart_retains_records = snapshot(data) === snapshot(restored);
  report.record_restart_sha256 = [hash(snapshot(data)), hash(snapshot(restored))];
  const relog = await req('/api/auth/login', '', {
    experiment_id: accounts.experiment_id,
    participant_code: emo.participant_code,
    password: emo.password,
  });
  report.checks.relogin_history_retained =
    (await req('/api/conversation/messages', relog.token)).length === 2;
  const logs = docker('logs', web);
  report.checks.logs_no_secrets = ![
    admin,
    seed,
    key,
    pwd,
    ...accounts.accounts.map((a) => a.password),
  ].some((s) => logs.includes(s));
  report.checks.image_excludes_private_runtime =
    docker(
      'exec',
      web,
      'sh',
      '-c',
      'test ! -e /app/.researcher-preview-private && test ! -e /app/.git && test ! -e /app/.env && test ! -e /app/docs; echo $?',
    ) === '0';
  report.checks.ready_reports_database = (await req('/api/ready')).database === 'ok';
  if (!Object.values(report.checks).every(Boolean)) throw Error('CHECK_FAILED');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure_code = error.message;
  try {
    report.startup_error_codes = docker('logs', web)
      .split('\n')
      .filter((x) => /^[A-Z_]+$/.test(x));
  } catch {
    /* Best-effort readiness probe or cleanup of owned resources. */
  }
  throw error;
} finally {
  await browser?.close();
  for (const c of [web, db])
    try {
      docker('rm', '-f', c);
    } catch {
      /* Best-effort readiness probe or cleanup of owned resources. */
    }
  try {
    docker('volume', 'rm', volume);
  } catch {
    /* Best-effort readiness probe or cleanup of owned resources. */
  }
  try {
    docker('network', 'rm', net);
  } catch {
    /* Best-effort readiness probe or cleanup of owned resources. */
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks }));
}
