import { mkdtemp, mkdir, copyFile, symlink, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { test, expect } from 'vitest';
const repository = resolve(import.meta.dirname, '../../..');

test('local supervisor chooses a port and preserves a template turn through stop, restart, new rounds and complete export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-local-lifecycle-'));
  await mkdir(join(root, 'scripts'));
  for (const file of ['local-researcher-preview.mjs', 'researcher-preview.mjs'])
    await copyFile(join(repository, 'scripts', file), join(root, 'scripts', file));
  for (const name of ['node_modules', 'apps', 'packages', 'research', 'database', 'deploy'])
    await symlink(
      join(repository, name),
      join(root, name),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  const key = 'OFFLINE_LOCAL_LAUNCH_TEST_KEY';
  const env = { ...process.env, DEEPSEEK_API_KEY: key };
  const sessions: ReturnType<typeof spawn>[] = [];
  async function cli(action: string) {
    const p = spawn(
      process.execPath,
      ['--use-env-proxy', 'scripts/local-researcher-preview.mjs', action],
      { cwd: root, env },
    );
    let output = '',
      error = '';
    p.stdout.on('data', (b: Buffer) => {
      output += b.toString();
    });
    p.stderr.on('data', (b: Buffer) => {
      error += b.toString();
    });
    const code = await new Promise<number | null>((ok, fail) => {
      p.once('error', fail);
      p.once('exit', ok);
    });
    expect(code, error).toBe(0);
    expect(output + error).not.toContain(key);
    return JSON.parse(output);
  }
  async function start() {
    const p = spawn(
      process.execPath,
      ['--use-env-proxy', 'scripts/local-researcher-preview.mjs', 'start'],
      { cwd: root, env },
    );
    sessions.push(p);
    const port = await new Promise<number>((ok, fail) => {
      let text = '';
      const timeout = setTimeout(() => fail(new Error('LOCAL_START_TIMEOUT')), 20000);
      p.stdout.on('data', (b: Buffer) => {
        text += b.toString();
        const m = text.match(/LOCAL_RESEARCHER_PREVIEW_READY=(\d+)/);
        if (m) {
          clearTimeout(timeout);
          ok(Number(m[1]));
        }
      });
      p.once('error', fail);
      p.once('exit', (code) => {
        clearTimeout(timeout);
        if (code) fail(new Error('LOCAL_START_FAILED'));
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  const state = async () =>
    JSON.parse(await readFile(join(root, '.researcher-preview-private/credentials.json'), 'utf8'));
  try {
    expect(await cli('status')).toEqual({ status: 'stopped' });
    const url = await start();
    expect((await fetch(url)).status).toBe(200);
    const data = await state();
    const account = data.rounds.R001.find((p: { path: string }) => p.path === 'emotion_v1');
    const login = await fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        experiment_id: data.experiment_id,
        participant_code: account.code,
        password: account.password,
      }),
    });
    const { token } = await login.json();
    const current = await (
      await fetch(url + '/api/experiment/current', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    // mentor-test-v1 first emotional reply is a fixed approved template: no vendor access.
    const sent = await fetch(url + '/api/conversation/message', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state_token: current.state_token,
        request_id: 'local-template-retention',
        text: '我希望Marcus喜欢音乐，李阳比较慢热。',
      }),
    });
    expect(sent.status).toBe(200);
    expect((await sent.json()).status).toBe('ready');
    const manager = JSON.parse(
      await readFile(join(root, '.researcher-preview-private/local-manager.json'), 'utf8'),
    );
    const forbidden = await fetch(`http://127.0.0.1:${manager.control_port}/control`, {
      method: 'POST',
      body: '{"action":"stop"}',
    });
    expect(forbidden.status).toBe(403);
    const initialExport = await cli('export');
    const initial = JSON.parse(await readFile(initialExport.file, 'utf8'));
    expect(initial.complete).toBe(true);
    expect(initial.messages).toHaveLength(2);
    expect(initial.turns[0].generation_context.reply_source).toBe('template');
    expect(initial.runs[0].retry_count).toBe(0);
    await expect(
      access(join(root, '.researcher-preview-private/http-runs.jsonl')),
    ).rejects.toThrow();
    const identities = initial.analysis_rows
      .map((r: { session_id: string }) => r.session_id)
      .sort();
    await cli('stop');
    expect(await cli('status')).toEqual({ status: 'stopped' });
    const restarted = await start();
    expect((await fetch(restarted)).ok).toBe(true);
    const second = JSON.parse(await readFile((await cli('export')).file, 'utf8'));
    expect(second.messages).toEqual(initial.messages);
    expect(second.transitions).toEqual(initial.transitions);
    expect(second.analysis_rows.map((r: { session_id: string }) => r.session_id).sort()).toEqual(
      identities,
    );
    expect((await cli('new-round')).round).toBe('R002');
    expect((await cli('new-round')).round).toBe('R003');
    const final = JSON.parse(await readFile((await cli('export')).file, 'utf8'));
    expect(final.analysis_rows).toHaveLength(9);
    expect(final.messages).toEqual(initial.messages);
    expect(final.data_quality.passed).toBe(true);
    expect((await state()).rounds.R001).toEqual(data.rounds.R001);
    await cli('stop');
  } finally {
    // Stop through the authenticated local supervisor; never signal an arbitrary PID.
    try {
      await cli('stop');
    } catch {
      /* test already failed */
    }
    for (const p of sessions) if (p.exitCode === null) p.kill();
    let owned;
    try {
      owned = await state();
    } catch {
      /* bootstrap not completed */
    }
    if (owned) {
      execFileSync('docker', ['rm', '-f', owned.container], { stdio: 'pipe' });
      execFileSync('docker', ['volume', 'rm', owned.volume], { stdio: 'pipe' });
    }
  }
}, 90000);
