import { useEffect, useState } from 'react';
import type { AdminParticipant } from '@research/contracts';
import { api, ApiError, errorText } from './api';
type Option = { id: string; code: string; path: string; agent: string; model_batch: string };
const paths: Record<string, string> = { cognitive: '认知', emotional: '情感', daily: '日常' };
async function workbook(path: string, token: string, body: unknown) {
  const response = await fetch('/api' + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const p = await response.json().catch(() => ({}));
    throw new ApiError(response.status, p.error ?? 'REQUEST_FAILED');
  }
  if (!response.headers.get('Content-Type')?.includes('spreadsheetml'))
    throw Error('WORKBOOK_RESPONSE_REQUIRED');
  return response.blob();
}
export function AccountManager({
  token,
  experiment,
  participants,
  onChanged,
}: {
  token: string;
  experiment: string;
  participants: AdminParticipant[];
  onChanged: () => Promise<void>;
}) {
  const [options, setOptions] = useState<Option[]>([]),
    [path, setPath] = useState(''),
    [condition, setCondition] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [file, setFile] = useState<Blob | null>(null),
    [reset, setReset] = useState('');
  useEffect(() => {
    let active = true;
    void api<Option[]>('/admin/account-options?experiment_id=' + experiment, token)
      .then((x) => {
        if (active) setOptions(x);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [experiment, token]);
  const selected = options.find((x) => x.id === condition);
  return (
    <div className="account-manager" aria-label="编号管理">
      <h3>编号管理</h3>
      <p>
        按已发布的实验配置创建独立登录账号。路径、条件、智能体和模型批次共同绑定，不会中途换组。
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        aria-label="批量创建实验账号"
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          setFile(null);
          void workbook('/admin/account-batches', token, {
            experiment_id: experiment,
            condition_id: condition,
            prefix: values.get('prefix'),
            start: Number(values.get('start')),
            count: Number(values.get('count')),
            request_id: crypto.randomUUID(),
          })
            .then(async (b) => {
              setFile(b);
              setNotice('账号已创建。初始密码仅在本次文件中提供，请私下保管。');
              await onChanged();
            })
            .catch((e) => {
              setError(errorText(e));
              setNotice('如响应中断，请先刷新账号列表；已创建账号可单独重置密码，不要重复创建。');
            })
            .finally(() => setBusy(false));
        }}
      >
        <div className="account-grid">
          <label>
            实验路径
            <select
              aria-label="实验路径"
              required
              value={path}
              disabled={busy}
              onChange={(e) => {
                setPath(e.target.value);
                setCondition('');
              }}
            >
              <option value="">请选择路径</option>
              {[...new Set(options.map((o) => o.path))].map((p) => (
                <option key={p} value={p}>
                  {paths[p] ?? p}
                </option>
              ))}
            </select>
          </label>
          <label>
            实验条件与组别
            <select
              aria-label="实验条件与组别"
              required
              value={condition}
              disabled={busy || !path}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="">请选择条件</option>
              {options
                .filter((o) => o.path === path)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.agent}
                  </option>
                ))}
            </select>
          </label>
          <label>
            分配的智能体
            <input readOnly value={selected?.agent ?? ''} />
          </label>
          <label>
            模型批次（由当前实验固定）
            <input readOnly value={selected?.model_batch ?? ''} />
          </label>
          <label>
            账号数量
            <input
              name="count"
              type="number"
              min="1"
              max="100"
              defaultValue="30"
              required
              disabled={busy}
            />
          </label>
          <label>
            编号前缀
            <input
              name="prefix"
              defaultValue="TEST"
              pattern="[A-Za-z][A-Za-z0-9_-]{0,15}"
              maxLength={16}
              required
              disabled={busy}
            />
          </label>
          <label>
            起始序号
            <input
              name="start"
              type="number"
              min="1"
              max="999999"
              defaultValue="1"
              required
              disabled={busy}
            />
          </label>
        </div>
        <p>
          编号自动包含独立批次标识，避免重复。登录文件含实验编号、账号、初始密码及分配信息，与实验数据导出分开。
        </p>
        <button disabled={busy || !selected}>{busy ? '正在处理…' : '批量创建实验账号'}</button>
      </form>
      {file && (
        <button
          className="login-download"
          onClick={() => {
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'login-accounts-' + Date.now() + '.xlsx';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setFile(null);
            setNotice('账号文件已下载。请保存到受控位置，不要上传GitHub或转发全体账号。');
          }}
        >
          下载登录账号 Excel
        </button>
      )}
      <div className="reset-account">
        <h4>遗失新建账号密码</h4>
        <p>
          无法反查旧密码。重置仅影响选中账号的密码和登录会话，不清空实验记录。原B001/B002固定账号仍从内部账号领取页私下查看。
        </p>
        <label>
          选择需要重置的账号
          <select
            aria-label="选择需要重置的账号"
            value={reset}
            onChange={(e) => setReset(e.target.value)}
            disabled={busy}
          >
            <option value="">请选择</option>
            {participants
              .filter((p) => !/^B\d{3,6}-P\d{4}$/.test(p.participant_code))
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.participant_code}
                </option>
              ))}
          </select>
        </label>
        <button
          disabled={busy || !reset}
          onClick={() => {
            setBusy(true);
            setFile(null);
            setError('');
            void workbook('/admin/participants/' + reset + '/reset-login', token, {})
              .then((b) => {
                setFile(b);
                setNotice('密码已重置，旧登录已失效。请下载新的登录账号文件。');
              })
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          重置选中账号密码
        </button>
      </div>
    </div>
  );
}
