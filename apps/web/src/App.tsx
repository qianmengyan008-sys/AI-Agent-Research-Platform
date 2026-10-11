import { useState } from 'react';
import { Participant } from './Participant';
import { Admin } from './Admin';
export function App() {
  const [mode, setMode] = useState<'participant' | 'admin'>('participant');
  return (
    <main>
      <p className="eyebrow">心理学实验 · 独立研究平台</p>
      <h1>AI Agent 在线对话研究平台</h1>
      <nav aria-label="入口">
        <button aria-pressed={mode === 'participant'} onClick={() => setMode('participant')}>
          参与者入口
        </button>
        <button aria-pressed={mode === 'admin'} onClick={() => setMode('admin')}>
          管理员入口
        </button>
      </nav>
      {mode === 'participant' ? <Participant /> : <Admin />}
    </main>
  );
}
