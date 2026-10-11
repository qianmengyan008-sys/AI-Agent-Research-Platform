import { useRef, useState } from 'react';
import type {
  AdminDevelopment,
  AdminExperiment,
  AdminMessage,
  AdminParticipant,
} from '@research/contracts';
import { api, ApiError, errorText } from './api';
export function Admin() {
  const [token, setToken] = useState('');
  const [experiments, setExperiments] = useState<AdminExperiment[]>([]);
  const [experiment, setExperiment] = useState('');
  const [participants, setParticipants] = useState<AdminParticipant[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const [developmentAllowed, setDevelopmentAllowed] = useState(false);
  const [development, setDevelopment] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AdminDevelopment | null>(null);
  async function work(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.status === 401) {
        setToken('');
        setDiagnostics(null);
        setDevelopment(false);
        setExperiment('');
        setExperiments([]);
        setParticipants([]);
        setMessages([]);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function load(id: string) {
    setParticipants([]);
    setMessages([]);
    setDiagnostics(null);
    if (!id) return;
    const [p, m] = await Promise.all([
      api<AdminParticipant[]>(`/admin/participants?experiment_id=${id}`, token),
      api<AdminMessage[]>(`/admin/conversations?experiment_id=${id}`, token),
    ]);
    setParticipants(p);
    setMessages(m);
    if (development && developmentAllowed)
      setDiagnostics(await api<AdminDevelopment>(`/admin/development?experiment_id=${id}`, token));
  }
  return (
    <section aria-labelledby="admin-title">
      <h2 id="admin-title">管理员查询</h2>
      {error && <p role="alert">{error}</p>}
      {!token ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = String(new FormData(e.currentTarget).get('credential'));
            void work(async () => {
              const [list, capabilities] = await Promise.all([
                api<AdminExperiment[]>('/admin/experiments', value),
                api<{ development_mode: boolean }>('/admin/capabilities', value),
              ]);
              setDevelopmentAllowed(capabilities.development_mode);
              setDevelopment(false);
              setDiagnostics(null);
              setExperiments(list);
              setToken(value);
            });
          }}
        >
          <label>
            管理员访问凭据
            <input type="password" name="credential" required autoComplete="off" />
          </label>
          <button disabled={busy}>进入后台</button>
        </form>
      ) : (
        <>
          <div className="toolbar">
            <div>
              <label htmlFor="experiment-choice">选择实验</label>
              <select
                id="experiment-choice"
                disabled={busy}
                value={experiment}
                onChange={(e) => {
                  const id = e.target.value;
                  setExperiment(id);
                  void work(async () => {
                    await load(id);
                  });
                }}
              >
                <option value="">请选择</option>
                {experiments.map((e) => (
                  <option key={`${e.id}-${e.version}`} value={e.id}>
                    {e.name} · v{e.version} · {e.status}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                setToken('');
                setDevelopment(false);
                setDiagnostics(null);
                setExperiment('');
                setExperiments([]);
                setParticipants([]);
                setMessages([]);
              }}
            >
              退出后台
            </button>
          </div>
          {experiments.length === 0 && <p>暂无实验。</p>}
          {experiment && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await load(experiment);
                  })
                }
              >
                刷新查询
              </button>
              <h3>参与者与当前状态</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>参与者编号</th>
                      <th>账号状态</th>
                      <th>条件</th>
                      <th>当前阶段</th>
                      <th>状态版本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.id}>
                        <td>{p.participant_code}</td>
                        <td>{p.status}</td>
                        <td>{p.condition ?? '未分配'}</td>
                        <td>{p.stage ?? '未开始'}</td>
                        <td>{p.core_version ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>实验对话</h3>
              <div aria-label="管理员对话记录">
                {messages.length === 0 && <p>暂无对话。</p>}
                {messages.map((m) => (
                  <p key={m.id} className="preserve">
                    <strong>
                      {m.session_id} · {m.sequence} · {m.role} · {m.status}
                    </strong>
                    <br />
                    {m.content ?? '尚无可用回复'}
                  </p>
                ))}
              </div>
              <h3>只读开发模式</h3>
              <label>
                开发模式（仅管理员）
                <input
                  type="checkbox"
                  disabled={busy || !developmentAllowed}
                  checked={development}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setDevelopment(enabled);
                    setDiagnostics(null);
                    if (enabled)
                      void work(async () => {
                        setDiagnostics(
                          await api<AdminDevelopment>(
                            `/admin/development?experiment_id=${experiment}`,
                            token,
                          ),
                        );
                      });
                  }}
                />
              </label>
              {!developmentAllowed && <p>开发模式未启用。</p>}
              {development && diagnostics && (
                <div aria-label="管理员开发数据">
                  <p>只读诊断，不能修改实验状态；每类最多 1000 条。</p>
                  <h4>当前状态</h4>
                  <pre>{JSON.stringify(diagnostics.states, null, 2)}</pre>
                  <h4>事件记录</h4>
                  <pre>{JSON.stringify(diagnostics.events, null, 2)}</pre>
                  <h4>变量变化</h4>
                  <pre>{JSON.stringify(diagnostics.variables, null, 2)}</pre>
                  <h4>模型调用日志</h4>
                  <pre>{JSON.stringify(diagnostics.model_runs, null, 2)}</pre>
                </div>
              )}
              <h3>导出数据</h3>
              <p>当前为限量 JSON 导出，每类最多 1000 条，不能作为完整研究归档。</p>
              <button
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    const data = await api<Record<string, unknown>>(
                      `/admin/export?experiment_id=${experiment}`,
                      token,
                    );
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                    );
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `research-${experiment}.json`;
                    document.body.append(link);
                    link.click();
                    link.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
              >
                下载限量 JSON
              </button>
            </>
          )}
        </>
      )}
      {busy && <p role="status">查询中…</p>}
    </section>
  );
}
