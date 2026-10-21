import { useState } from 'react';
import type { AdminParticipant } from '@research/contracts';
import { api, errorText } from './api';
type Row = Record<string, string | number | null | Record<string, unknown>>;
type History = {
  sessions: Row[];
  messages: Row[];
  notices: Row[];
  events: Row[];
  interruptions: Row[];
};
export function ConversationHistory({
  token,
  experiment,
  participants,
}: {
  token: string;
  experiment: string;
  participants: AdminParticipant[];
}) {
  const [participant, setParticipant] = useState(''),
    [path, setPath] = useState(''),
    [session, setSession] = useState('');
  const [history, setHistory] = useState<History | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section aria-label="完整会话记录">
      <h3>完整会话记录</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setHistory(null);
          const q = new URLSearchParams({ experiment_id: experiment, participant_id: participant });
          if (path) q.set('path', path);
          if (session) q.set('session_id', session);
          void api<History>('/admin/history?' + q, token)
            .then(setHistory)
            .catch((e) => setError(errorText(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          查询参与者
          <select
            aria-label="查询参与者"
            required
            value={participant}
            onChange={(e) => {
              setParticipant(e.target.value);
              setHistory(null);
            }}
          >
            <option value="">请选择</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.participant_code}
              </option>
            ))}
          </select>
        </label>
        <label>
          查询实验路径
          <select aria-label="查询实验路径" value={path} onChange={(e) => setPath(e.target.value)}>
            <option value="">所有路径</option>
            <option value="cognitive">认知</option>
            <option value="emotional">情感</option>
            <option value="daily">日常</option>
          </select>
        </label>
        <label>
          查询会话编号（选填）
          <input value={session} onChange={(e) => setSession(e.target.value)} />
        </label>
        <button disabled={busy || !participant}>{busy ? '查询中…' : '查询完整记录'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {history && (
        <div aria-label="完整记录结果">
          {history.sessions.length === 0 && <p>没有符合条件的会话。</p>}
          {history.sessions.map((s) => (
            <article key={String(s.session_id)}>
              <h4>
                {String(s.participant_code)} · {String(s.path_type)}
              </h4>
              <p>
                会话编号：{String(s.session_id)} · 对话编号：{String(s.conversation_id)}
              </p>
              <p>
                开始：{String(s.started_at)} · 结束：{s.ended_at ? String(s.ended_at) : '尚未完成'}{' '}
                · 状态：{String(s.status)}
              </p>
            </article>
          ))}
          <h4>按时间排列的消息与操作</h4>
          {[
            ...history.messages.map((m): Row => ({ ...m, kind: 'message' })),
            ...history.notices.map((n): Row => ({ ...n, kind: 'notice' })),
            ...history.events.map((e): Row => ({ ...e, kind: 'event' })),
          ]
            .sort(
              (a, b) =>
                String(a.created_at).localeCompare(String(b.created_at)) ||
                Number(a.sequence ?? a.to_version ?? a.notice_order ?? 0) -
                  Number(b.sequence ?? b.to_version ?? b.notice_order ?? 0),
            )
            .map((row) => (
              <article key={String(row.id)} className="history-entry preserve">
                <time>{String(row.created_at)}</time>
                <p>
                  {row.kind === 'event'
                    ? `事件 ${String(row.event)} · ${String(row.previous_state)} → ${String(row.current_state)}`
                    : row.kind === 'notice'
                      ? '系统指导／卡片记录'
                      : `#${String(row.sequence)} · ${String(row.role)} · ${String(row.status)}`}
                </p>
                {row.kind === 'event' ? (
                  <p>{JSON.stringify(row.validated_payload)}</p>
                ) : (
                  <p>{String(row.content ?? '回复未生成')}</p>
                )}
                {row.card_record && <p>{JSON.stringify(row.card_record)}</p>}
              </article>
            ))}
          <h4>异常与等待记录</h4>
          <p>
            未完成不等同异常中断；仅展示实际失败、过期或等待中的请求。关闭浏览器本身不能可靠判定异常。
          </p>
          {history.interruptions.map((i) => (
            <p key={String(i.turn_id)}>
              {String(i.created_at)} · {String(i.turn_id)} · {String(i.status)}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
