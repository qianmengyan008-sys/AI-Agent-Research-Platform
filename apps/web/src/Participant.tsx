import { useEffect, useRef, useState } from 'react';
import type { ParticipantCurrent, ParticipantMessage, ParticipantTurn } from '@research/contracts';
import { api, ApiError, errorText } from './api';
const labels: Record<string, string> = {
  response: '当前回答',
  viewpoint: '确认后的观点',
  confirmed: '我确认上述观点',
  rating: '当前评分',
  source: '表达来源（选填）',
};
interface MessageRequest {
  text: string;
  state_token: string;
  request_id: string;
}
export function Participant() {
  const [token, setToken] = useState('');
  const [current, setCurrent] = useState<ParticipantCurrent | null>(null);
  const [messages, setMessages] = useState<ParticipantMessage[]>([]);
  const [screen, setScreen] = useState<'instructions' | 'chat'>('instructions');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [retry, setRetry] = useState<MessageRequest | null>(null);
  const submission = useRef<{
    state_token: string;
    request_id: string;
    data: Record<string, string | number | boolean>;
  } | null>(null);
  const [retrySubmission, setRetrySubmission] = useState(false);
  function handleError(e: unknown) {
    setError(errorText(e));
    if (e instanceof ApiError && e.status === 401) {
      setToken('');
      setCurrent(null);
      setMessages([]);
      setRetry(null);
      submission.current = null;
      setRetrySubmission(false);
    }
  }
  async function refresh(auth = token) {
    const [state, history] = await Promise.all([
      api<ParticipantCurrent>('/experiment/current', auth),
      api<ParticipantMessage[]>('/conversation/messages', auth),
    ]);
    setCurrent(state);
    setMessages(history);
    return state;
  }
  async function work(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      handleError(e);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    setValues({});
    submission.current = null;
    setRetrySubmission(false);
  }, [current?.state_token]);
  useEffect(() => {
    if (!token || current?.status !== 'generating' || !current.pending_turn_id) return;
    let cancelled = false,
      polling = false;
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void api<ParticipantTurn>(`/conversation/turns/${current.pending_turn_id}`, token)
        .then(async (turn) => {
          if (cancelled) return;
          if (!['pending', 'generating'].includes(turn.status)) {
            if (turn.status !== 'ready') setNotice('回复未能生成，请重新发送或联系研究人员。');
            const [state, history] = await Promise.all([
              api<ParticipantCurrent>('/experiment/current', token),
              api<ParticipantMessage[]>('/conversation/messages', token),
            ]);
            if (!cancelled) {
              setCurrent(state);
              setMessages(history);
            }
          }
        })
        .catch((e) => {
          if (!cancelled) handleError(e);
        })
        .finally(() => {
          polling = false;
        });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, current?.status, current?.pending_turn_id]);
  async function send(request: MessageRequest) {
    setRetry(request);
    const result = await api<ParticipantTurn>('/conversation/message', token, request);
    setRetry(null);
    setDraft('');
    setNotice(
      result.status === 'failed' || result.status === 'stale'
        ? '回复未能生成，请重新发送或联系研究人员。'
        : '',
    );
    await refresh();
  }
  const generating = current?.status === 'generating';
  const disabled = busy || generating;
  const canSubmit = current?.form?.fields.every(
    (f) =>
      f.required === false ||
      (f.kind === 'confirmation'
        ? values[f.name] === true
        : typeof values[f.name] === 'string' &&
          String(values[f.name]).trim() !== '' &&
          (f.kind !== 'number' || Number.isFinite(Number(values[f.name])))),
  );
  if (!token)
    return (
      <section aria-labelledby="login-title">
        <h2 id="login-title">参与者登录</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void work(async () => {
              const auth = await api<{ token: string }>('/auth/login', '', {
                experiment_id: data.get('experiment'),
                participant_code: data.get('code'),
                password: data.get('password'),
              });
              setToken(auth.token);
              setScreen('instructions');
              setNotice('');
              setRetry(null);
              await refresh(auth.token);
            });
          }}
        >
          <label>
            实验编号
            <input name="experiment" required autoComplete="off" />
          </label>
          <label>
            参与者编号
            <input name="code" required autoComplete="username" />
          </label>
          <label>
            密码
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button disabled={busy}>{busy ? '登录中…' : '登录实验'}</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  return (
    <section aria-labelledby="participant-title">
      <div className="toolbar">
        <h2 id="participant-title">我的实验</h2>
        <button
          disabled={busy}
          onClick={() =>
            void work(async () => {
              await api('/auth/logout', token, {});
              setToken('');
              setCurrent(null);
              setMessages([]);
              setRetry(null);
              submission.current = null;
            })
          }
        >
          退出登录
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!current ? (
        <button
          disabled={busy}
          onClick={() =>
            void work(async () => {
              await refresh();
            })
          }
        >
          重新获取实验
        </button>
      ) : (
        <>
          {screen === 'instructions' ? (
            <>
              <h3>实验说明</h3>
              <p className="preserve">{current.instructions}</p>
              <p>对话对象：{current.agent.name}</p>
              <button disabled={busy} onClick={() => setScreen('chat')}>
                开始／继续对话
              </button>
            </>
          ) : (
            <>
              <h3>与 {current.agent.name} 对话</h3>
              <div className="messages" aria-label="对话记录" role="log">
                {messages.length === 0 && <p>尚无消息，可以开始对话。</p>}
                {messages.map((m) => (
                  <p key={m.id} className={`message ${m.role}`}>
                    <strong>{m.role === 'user' ? '我' : current.agent.name}：</strong>
                    <span className="preserve">{m.text}</span>
                  </p>
                ))}
              </div>
              {current.status === 'finished' ? (
                <p role="status">本次实验已完成，谢谢参与。</p>
              ) : (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (draft.trim())
                        void work(async () => {
                          await send({
                            text: draft.trim(),
                            state_token: current.state_token,
                            request_id: crypto.randomUUID(),
                          });
                        });
                    }}
                  >
                    <label>
                      发送消息
                      <textarea
                        maxLength={4000}
                        value={draft}
                        disabled={disabled || !!retry}
                        onChange={(e) => setDraft(e.target.value)}
                        required
                      />
                    </label>
                    <button disabled={disabled || !draft.trim() || !!retry}>
                      {disabled ? '处理中…' : '发送'}
                    </button>
                  </form>
                  {retry && (
                    <button
                      disabled={disabled}
                      onClick={() =>
                        void work(async () => {
                          await send(retry);
                        })
                      }
                    >
                      重试同一消息
                    </button>
                  )}
                  {generating && <p role="status">回复生成中，请稍候。</p>}
                  <h3>当前填写</h3>
                  <p>发送聊天消息后，可在准备好时明确提交当前填写。</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void work(async () => {
                        if (!submission.current) {
                          const data: Record<string, string | number | boolean> = {};
                          for (const f of current.form?.fields ?? []) {
                            const value = values[f.name];
                            if (f.required === false && (value === undefined || value === ''))
                              continue;
                            data[f.name] =
                              f.kind === 'confirmation'
                                ? value === true
                                : f.kind === 'number'
                                  ? Number(value)
                                  : String(value);
                          }
                          submission.current = {
                            state_token: current.state_token,
                            request_id: crypto.randomUUID(),
                            data,
                          };
                        }
                        setRetrySubmission(true);
                        try {
                          await api('/experiment/submissions', token, submission.current);
                          submission.current = null;
                          setRetrySubmission(false);
                          setNotice('当前填写已保存。');
                          await refresh();
                        } catch (e) {
                          if (e instanceof ApiError && e.status !== 0 && e.status < 500) {
                            submission.current = null;
                            setRetrySubmission(false);
                          }
                          throw e;
                        }
                      });
                    }}
                  >
                    {current.form?.fields.map((f) => (
                      <label key={f.name}>
                        {labels[f.name] ?? '当前填写内容'}
                        {f.kind === 'confirmation' ? (
                          <input
                            type="checkbox"
                            checked={values[f.name] === true}
                            disabled={disabled || retrySubmission}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [f.name]: e.target.checked }))
                            }
                          />
                        ) : (
                          <input
                            type={f.kind === 'number' ? 'number' : 'text'}
                            step={f.kind === 'number' ? 'any' : undefined}
                            required={f.required !== false}
                            maxLength={10000}
                            disabled={disabled || retrySubmission}
                            value={String(values[f.name] ?? '')}
                            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                          />
                        )}
                      </label>
                    ))}
                    <button disabled={disabled || (!retrySubmission && !canSubmit)}>
                      {retrySubmission ? '重试同一提交' : '提交当前填写'}
                    </button>
                  </form>
                </>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await refresh();
                  })
                }
              >
                刷新实验
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
