/** Local lifecycle wrapper only. Model secret is inherited in memory, never serialized. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = resolve(root, '.researcher-preview-private');
const managedFile = resolve(runtime, 'local-manager.json');
const command = process.argv[2] ?? 'start';
const helper = resolve(root, 'scripts/researcher-preview.mjs');
let lock,
  control,
  child,
  stopping = false;
const secret = () => randomBytes(24).toString('hex');
function launch(action, args = [], managed = false) {
  return spawn(process.execPath, ['--use-env-proxy', '--import', 'tsx', helper, action, ...args], {
    cwd: root,
    env: { ...process.env, ...(managed ? { RESEARCHER_PREVIEW_PORT: '0' } : {}) },
    stdio: managed ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
}
async function run(action, args = []) {
  const p = launch(action, args);
  let errorCode = 'LOCAL_OPERATION_FAILED';
  p.stdout.resume();
  p.stderr.on('data', (b) => {
    const s = b.toString().trim();
    if (/^[A-Z_]+$/.test(s)) errorCode = s;
  });
  const result = await new Promise((ok) => {
    p.once('error', () => ok(-1));
    p.once('exit', (code) => ok(code));
  });
  if (result !== 0) throw new Error(errorCode);
}
async function credentials() {
  return JSON.parse(await readFile(resolve(runtime, 'credentials.json'), 'utf8'));
}
async function request(action) {
  const m = JSON.parse(await readFile(managedFile, 'utf8'));
  if (!Number.isInteger(m.control_port) || m.control_port < 1 || m.control_port > 65535)
    throw new Error('INVALID_LOCAL_MANAGER');
  const response = await fetch(`http://127.0.0.1:${m.control_port}/control`, {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${m.control_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'LOCAL_OPERATION_FAILED');
  return data;
}
let cleanup;
function closeManager() {
  cleanup ??= cleanupManager();
  return cleanup;
}
async function cleanupManager() {
  control?.close();
  if (lock) {
    const owned = lock;
    lock = undefined;
    await owned.close();
    await unlink(resolve(runtime, 'local-manager.lock')).catch(() => {});
  }
  await unlink(managedFile).catch(() => {});
}
async function stop() {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null) {
    const exited = new Promise((ok) => child.once('exit', ok));
    if (child.connected) child.send({ type: 'researcher-preview-stop' });
    else child.kill();
    await exited;
  }
  await closeManager();
}
try {
  if (!['start', 'stop', 'restart', 'new-round', 'export', 'status', 'accounts'].includes(command))
    throw new Error('UNKNOWN_LOCAL_COMMAND');
  if (command === 'accounts') {
    const state = await credentials();
    // Local owner explicitly asks to view participant credentials; no API/DB/admin key is displayed.
    console.info(`实验编号：${state.experiment_id}`);
    for (const accounts of Object.values(state.rounds))
      for (const p of accounts)
        console.info(`账号：${p.code}  路径：${p.path}  密码：${p.password}`);
  } else if (!['start', 'restart'].includes(command)) {
    try {
      console.info(JSON.stringify(await request(command)));
    } catch (error) {
      if (
        command === 'stop' &&
        ['ENOENT', 'ECONNREFUSED'].includes(error?.code ?? error?.cause?.code)
      )
        console.info(JSON.stringify({ status: 'stopped', history_retained: true }));
      else if (
        command === 'status' &&
        ['ENOENT', 'ECONNREFUSED'].includes(error?.code ?? error?.cause?.code)
      )
        console.info(JSON.stringify({ status: 'stopped' }));
      else throw error;
    }
  } else {
    if (command === 'restart') {
      try {
        await request('stop');
      } catch (e) {
        if (!['ENOENT', 'ECONNREFUSED'].includes(e?.code ?? e?.cause?.code)) throw e;
      }
    }
    await mkdir(runtime, { recursive: true, mode: 0o700 });
    try {
      const running = await request('status');
      console.info(`服务已在运行，本机浏览器打开：${running.url}`);
      process.exit(0);
    } catch (e) {
      if (!['ENOENT', 'ECONNREFUSED'].includes(e?.code ?? e?.cause?.code)) throw e;
    }
    const lockFile = resolve(runtime, 'local-manager.lock');
    try {
      lock = await open(lockFile, 'wx', 0o600);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = JSON.parse(await readFile(lockFile, 'utf8'));
      if (!Number.isInteger(owner.pid) || owner.pid < 1)
        throw new Error('LOCAL_MANAGER_LOCKED', { cause: error });
      let dead = false;
      try {
        process.kill(owner.pid, 0);
      } catch (e) {
        if (e.code === 'ESRCH') dead = true;
      }
      if (!dead) throw new Error('LOCAL_MANAGER_LOCKED', { cause: error });
      await unlink(lockFile);
      lock = await open(lockFile, 'wx', 0o600);
    }
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY_REQUIRED');
    child = launch('start', [], true);
    let output = '',
      errorCode = 'LOCAL_START_FAILED';
    child.stderr.on('data', (b) => {
      const s = b.toString().trim();
      if (/^[A-Z_]+$/.test(s)) errorCode = s;
    });
    const port = await new Promise((ok, fail) => {
      child.once('error', () => fail(new Error('NODE_START_FAILED')));
      child.once('exit', () => fail(new Error(errorCode)));
      child.stdout.on('data', (b) => {
        output += b.toString();
        const match = output.match(/RESEARCHER_PREVIEW_LISTENING_PORT=(\d+)/);
        if (match) ok(Number(match[1]));
        if (output.length > 65536) output = output.slice(-4096);
      });
    });
    const token = secret();
    const url = `http://127.0.0.1:${port}`;
    let maintenance = false;
    control = createServer(async (req, res) => {
      const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      if (
        req.method !== 'POST' ||
        req.url !== '/control' ||
        req.headers.authorization !== `Bearer ${token}`
      ) {
        send(403, { error: 'FORBIDDEN' });
        return;
      }
      let body = '';
      try {
        for await (const b of req) {
          body += b;
          if (body.length > 1024) throw new Error('CONTROL_INPUT_TOO_LARGE');
        }
        const { action } = JSON.parse(body);
        if (action === 'status') {
          send(200, { status: 'running', url, mentor_test_ready: false });
          return;
        }
        if (maintenance || stopping) {
          send(409, { error: 'LOCAL_OPERATION_BUSY' });
          return;
        }
        if (!['stop', 'new-round', 'export'].includes(action)) {
          send(400, { error: 'INVALID_ACTION' });
          return;
        }
        maintenance = true;
        if (action === 'stop') {
          await stop();
          send(200, { status: 'stopped', history_retained: true });
        } else if (action === 'new-round') {
          const state = await credentials();
          const n =
            Math.max(
              1,
              ...Object.keys(state.rounds)
                .map((r) => /^R(\d+)$/.exec(r)?.[1])
                .filter(Boolean)
                .map(Number),
            ) + 1;
          const name = `R${String(n).padStart(3, '0')}`;
          await run('new-round', [name]);
          send(200, {
            status: 'created',
            round: name,
            account_codes: [`${name}-COG`, `${name}-EMO`, `${name}-DAILY`],
            credentials_file: '.researcher-preview-private/credentials.json',
          });
        } else {
          const file = resolve(
            runtime,
            'exports',
            `research-export-${Date.now()}-${randomBytes(3).toString('hex')}.json`,
          );
          await run('export', [file]);
          send(200, { status: 'exported', file, complete: true });
        }
      } catch {
        send(500, { error: 'LOCAL_OPERATION_FAILED' });
      } finally {
        maintenance = false;
      }
    });
    control.requestTimeout = 5000;
    await new Promise((ok, fail) => {
      control.once('error', fail);
      control.listen(0, '127.0.0.1', ok);
    });
    await writeFile(
      managedFile,
      JSON.stringify(
        {
          control_port: control.address().port,
          control_token: token,
          frontend_port: port,
          started_at: new Date().toISOString(),
          pid: process.pid,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
    console.info(`本地研究者体验已启动。本机浏览器打开：${url}`);
    console.info(
      '账号：R001-COG / R001-EMO / R001-DAILY。双击 View-Researcher-Accounts.bat 在自己的电脑查看登录信息。',
    );
    console.info(
      '保留本窗口；停止请按 Ctrl+C 或双击 Stop-Researcher-Preview.bat。模型密钥未写入文件或参数。',
    );
    console.info(`LOCAL_RESEARCHER_PREVIEW_READY=${port}`);
    child.once('exit', () => {
      void closeManager();
    });
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        void stop();
      });
  }
} catch (error) {
  // Only clean manager files if this process actually owns the initialization lock.
  if (lock) {
    if (child?.exitCode === null) child.kill();
    await closeManager();
  }
  const code =
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : error?.code === 'EEXIST'
        ? 'LOCAL_MANAGER_LOCKED'
        : 'LOCAL_PREVIEW_NOT_RUNNING';
  console.error(code);
  process.exitCode = 1;
}
