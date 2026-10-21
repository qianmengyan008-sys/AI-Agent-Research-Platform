import { assistantBubbles, chatMessageGroups } from './message-bubbles';
import { boundedBubbles } from '@research/contracts';
import { RatingCard } from './RatingCard';
import { useEffect, useRef, useState } from 'react';
import type { ParticipantCurrent, ParticipantMessage, ParticipantTurn } from '@research/contracts';
import { api, ApiError, errorText } from './api';
const labels: Record<string, string> = {
  response: '确认内容',
  viewpoint: '确认后的观点',
  confirmed: '我确认上述观点',
  rating: '当前评分',
  source: '你是从哪里了解到的？（选填）',
};
interface MessageRequest {
  text: string;
  state_token: string;
  request_id: string;
  interaction?: 'chat';
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
  const [optimistic, setOptimistic] = useState<MessageRequest | null>(null);
  const historyEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    historyEnd.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
  }, [messages, optimistic, current?.state_token, screen]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [retry, setRetry] = useState<MessageRequest | null>(null);
  const submission = useRef<{
    state_token: string;
    request_id: string;
    data: Record<string, string | number | boolean>;
    interaction?: 'chat';
  } | null>(null);
  const [retrySubmission, setRetrySubmission] = useState(false);
  function handleError(e: unknown) {
    setError(errorText(e));
    if (e instanceof ApiError && e.status === 401) {
      setToken('');
      setOptimistic(null);
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
    setOptimistic(null);
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
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void api<ParticipantTurn>(
        `/conversation/turns/${current.pending_turn_id}`,
        token,
        undefined,
        { signal: controller.signal },
      )
        .then(async (turn) => {
          if (cancelled) return;
          if (!['pending', 'generating'].includes(turn.status)) {
            if (turn.status !== 'ready') setNotice('回复未能生成，请重新发送或联系研究人员。');
            const [state, history] = await Promise.all([
              api<ParticipantCurrent>('/experiment/current', token, undefined, {
                signal: controller.signal,
              }),
              api<ParticipantMessage[]>('/conversation/messages', token, undefined, {
                signal: controller.signal,
              }),
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
    // Upper bound includes the backend maximum attempt/lease budget; this is
    // a client recovery deadline, never an experiment turn-count rule.
    const waitDeadline = setTimeout(() => {
      cancelled = true;
      clearInterval(timer);
      controller.abort();
      setNotice('等待回复已超时，请刷新实验查看已保存结果，或联系研究人员。');
    }, 240000);
    return () => {
      cancelled = true;
      clearTimeout(waitDeadline);
      clearInterval(timer);
      controller.abort();
    };
  }, [token, current?.status, current?.pending_turn_id]);
  async function send(request: MessageRequest) {
    setOptimistic(request);
    setRetry(request);
    let result: ParticipantTurn;
    try {
      result = await api<ParticipantTurn>('/conversation/message', token, request);
    } catch (e) {
      // A definitive rejection was never accepted; only ambiguous network/5xx outcomes retain the key.
      if (e instanceof ApiError && e.status > 0 && e.status < 500) {
        setRetry(null);
        setOptimistic(null);
      }
      throw e;
    }
    setRetry(null);
    setDraft('');
    setNotice(
      result.status === 'failed' || result.status === 'stale'
        ? '回复未能生成，请重新发送或联系研究人员。'
        : '',
    );
    const refreshed = await refresh();
    if (refreshed.state_token === request.state_token)
      setValues((v) => ({ ...v, response: request.text }));
  }
  const generating = current?.status === 'generating';
  const disabled = busy || generating;
  const canSubmit = current?.form?.fields.every(
    (f) =>
      f.required === false ||
      (f.name === 'viewpoint' && current?.confirmation_card
        ? true
        : f.kind === 'confirmation'
          ? values[f.name] === true
          : typeof values[f.name] === 'string' &&
            String(values[f.name]).trim() !== '' &&
            (f.kind !== 'number' ||
              (Number.isFinite(Number(values[f.name])) &&
                (f.min === undefined || Number(values[f.name]) >= f.min) &&
                (f.max === undefined || Number(values[f.name]) <= f.max) &&
                (f.step !== 1 || Number.isInteger(Number(values[f.name])))))),
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
    <section
      aria-labelledby="participant-title"
      className={screen === 'chat' ? 'participant chat-active' : 'participant'}
    >
      <div className="toolbar">
        <h2 id="participant-title">我的实验</h2>
        <button
          disabled={busy}
          onClick={() =>
            void work(async () => {
              await api('/auth/logout', token, {});
              setToken('');
              setOptimistic(null);
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
      {current && (
        <p role="status">
          {current.status === 'finished'
            ? '实验已完成'
            : busy || generating
              ? '正在处理，请稍候。'
              : '可以继续对话。'}
        </p>
      )}
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
              <button
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await api('/conversation/start', token, {});
                    await refresh();
                    setScreen('chat');
                  })
                }
              >
                开始／继续对话
              </button>
            </>
          ) : (
            <>
              <header className="chat-heading">
                {current.agent.avatar && (
                  <img className="agent-avatar" src={current.agent.avatar} alt="" />
                )}
                <div>
                  <h3>与 {current.agent.name} 对话</h3>
                  {current.agent.identity && (
                    <p className="agent-identity">{current.agent.identity}</p>
                  )}
                </div>
              </header>
              <div className="chat-layout">
                <div className="messages" aria-label="对话记录" role="log" aria-live="polite">
                  {messages.length === 0 && !optimistic && <p>可以从这里开始对话。</p>}
                  {chatMessageGroups(messages).map((m) => (
                    <div key={m.id} className={`message ${m.role}`} data-message-id={m.id}>
                      <span className="speaker">
                        {m.role === 'user' ? (
                          '我'
                        ) : current.study_path === 'daily' ? (
                          <span className="message-identity">
                            {current.agent.avatar ? (
                              <img
                                className="agent-avatar"
                                src={current.agent.avatar}
                                alt={current.agent.name + '头像'}
                              />
                            ) : (
                              <span
                                className="agent-avatar avatar-placeholder"
                                role="img"
                                aria-label="人物头像占位图"
                              >
                                {current.agent.name.slice(0, 1)}
                              </span>
                            )}
                            <span>
                              {current.agent.name}
                              <br />
                              {current.agent.identity}
                            </span>
                          </span>
                        ) : (
                          current.agent.name
                        )}
                      </span>
                      {m.card_record ? (
                        <div className="inline-card completed-card">
                          <strong>{m.card_record.label}</strong>
                          <p>{m.card_record.belief}</p>
                          <p>
                            {typeof m.card_record.value === 'number'
                              ? `${m.card_record.value} / 100`
                              : '本人已确认'}
                          </p>
                        </div>
                      ) : (
                        (m.role === 'assistant'
                          ? current.study_path && current.study_path !== 'cognitive'
                            ? (boundedBubbles(m.text, current.study_path) ?? [m.text])
                            : assistantBubbles(m.text)
                          : [m.text]
                        ).map((text, index) => (
                          <div key={index} className="bubble preserve">
                            {text}
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                  {optimistic && (
                    <div className="message user pending-message">
                      <span className="speaker">我 · {error ? '发送结果待确认' : '发送中'}</span>
                      <div className="bubble preserve">{optimistic.text}</div>
                    </div>
                  )}
                  {generating && <p role="status">回复生成中，请稍候。</p>}
                  {current.status === 'finished' ? (
                    <p role="status">本次实验的全部步骤已保存。</p>
                  ) : (
                    <>
                      {(current.rating_card ||
                        current.confirmation_card ||
                        (current.study_path !== 'daily' && current.form?.fields.length === 0)) && (
                        <div className="inline-card" aria-label="本段确认卡">
                          {current.form?.fields.length !== 0 && (
                            <h3>{current.rating_card ? '请为观点评分' : '确认并继续'}</h3>
                          )}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void work(async () => {
                                if (!submission.current) {
                                  const data: Record<string, string | number | boolean> = {};
                                  for (const f of current.form?.fields ?? []) {
                                    const value = values[f.name];
                                    if (
                                      f.required === false &&
                                      (value === undefined || value === '')
                                    )
                                      continue;
                                    data[f.name] =
                                      f.kind === 'confirmation'
                                        ? value === true
                                        : f.kind === 'number'
                                          ? Number(value)
                                          : String(value);
                                  }
                                  if (current.confirmation_card)
                                    data.viewpoint = current.confirmation_card.belief;
                                  submission.current = {
                                    interaction: 'chat',
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
                                  setNotice('你的确认已保存。');
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
                            {current.confirmation_card && (
                              <p className="preserve">
                                你表达的观点是：“{current.confirmation_card.belief}
                                ”。这是否准确表达了你的想法？
                              </p>
                            )}
                            {current.rating_card && (
                              <RatingCard
                                card={current.rating_card}
                                value={String(values.rating ?? '')}
                                disabled={disabled || retrySubmission}
                                onChange={(rating) => setValues((v) => ({ ...v, rating }))}
                              />
                            )}
                            {current.form?.fields
                              .filter(
                                (f) =>
                                  !(current.rating_card && f.name === 'rating') &&
                                  f.name !== 'viewpoint',
                              )
                              .map((f) => (
                                <label key={f.name}>
                                  {labels[f.name] ?? '请填写你的选择'}
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
                                      onChange={(e) =>
                                        setValues((v) => ({ ...v, [f.name]: e.target.value }))
                                      }
                                    />
                                  )}
                                </label>
                              ))}
                            <button disabled={disabled || (!retrySubmission && !canSubmit)}>
                              {retrySubmission
                                ? '重试同一提交'
                                : current.rating_card
                                  ? '提交评分'
                                  : current.form?.fields.length === 0
                                    ? '结束本次对话'
                                    : '确认并继续'}
                            </button>
                          </form>
                        </div>
                      )}
                    </>
                  )}
                  <div ref={historyEnd} className="history-end" aria-hidden="true" />
                </div>
                {current.status !== 'finished' && (
                  <div className="composer">
                    {' '}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.trim())
                          void work(async () => {
                            await send({
                              interaction: 'chat',
                              text: draft.trim(),
                              state_token: current.state_token,
                              request_id: crypto.randomUUID(),
                            });
                          });
                      }}
                    >
                      <label htmlFor="participant-message">发送消息</label>
                      <textarea
                        id="participant-message"
                        maxLength={4000}
                        value={draft}
                        disabled={disabled || !!retry}
                        onChange={(e) => setDraft(e.target.value)}
                        required
                      />
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
                  </div>
                )}
              </div>
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
