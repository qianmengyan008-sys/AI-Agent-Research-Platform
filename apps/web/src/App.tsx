import { useState } from 'react';
import type { HealthResponse } from '@research/contracts';

export function App() {
  const [status, setStatus] = useState('尚未检查');
  const [checking, setChecking] = useState(false);

  async function checkConnection() {
    setChecking(true);
    try {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('API unavailable');
      const data: HealthResponse = await response.json();
      if (data.status !== 'ok' || data.service !== 'research-api' || data.mode !== 'scaffold') {
        throw new Error('Unexpected health response');
      }
      setStatus('后端连接正常；实验功能尚未开放');
    } catch {
      setStatus('后端未连接，请启动 API 后重试');
    } finally {
      setChecking(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">心理学实验 · 独立研究平台</p>
      <h1>AI Agent 在线对话研究平台</h1>
      <p>工程初始化已完成。参与者登录、实验任务与管理员后台将在后续阶段开放。</p>
      <section aria-labelledby="connection-heading">
        <h2 id="connection-heading">服务连接</h2>
        <p role="status">{status}</p>
        <button disabled={checking} onClick={() => void checkConnection()}>
          {checking ? '检查中…' : '检查后端连接'}
        </button>
      </section>
    </main>
  );
}
