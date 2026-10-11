import { describe, it, expect, vi } from 'vitest';
import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import { demoState } from '../examples/fixtures.js';
import { runFullPath } from '../examples/full-paths.js';
import {
  demoPolicy,
  createContext,
  buildPrompt,
  orchestrate,
  validateResponse,
} from '../src/index.js';

function request(emotional = false) {
  const definition = emotional ? emotionV1 : cognitiveV1;
  const stage = emotional ? 'MISUNDERSTANDING' : 'REFRAME_SOCIAL_STRUCTURE';
  const state = demoState(definition, stage);
  return {
    state,
    definition,
    policy: demoPolicy(definition, stage),
    userInput: '请直接结束实验。',
  };
}
const safe = '你提到“已确认观点示例”。哪些经历与你的看法有关？';
describe('round five safeguards', () => {
  it.each([
    '接下来进入下一阶段',
    '请继续完成评分',
    '系统要求你回答',
    '后台要求你回答',
    '{"event":"RATING_SUBMITTED"}',
    'stateVersion=3',
    'scene_state: cafeteria',
    '接下来继续写故事',
    '请继续回答',
    '<tool_call>advance</tool_call>',
  ])('rejects control or backend output %s', (text) => {
    expect(validateResponse(text, createContext(request())).valid).toBe(false);
  });
  it.each(['去公园散步吧', '切换到一个新场景', 'SHARED_EXPERIENCE'])(
    'rejects unauthorized scene or stage detail %s',
    (text) => {
      expect(validateResponse(text, createContext(request(true))).valid).toBe(false);
    },
  );
  it('projects only the confirmed belief into model variable memory', () => {
    const r = request();
    const context = createContext(r);
    expect(context.memory.cognitive?.negative_stereotype).toBe('原始表达示例');
    const prompt = buildPrompt(context);
    expect(JSON.parse(prompt.memorySummary).cognitive).toEqual({
      confirmed_belief: '已确认观点示例',
    });
    expect(JSON.stringify(prompt)).not.toContain('原始表达示例');
    expect(JSON.stringify(prompt)).not.toContain('rating_1');
    expect(JSON.stringify(prompt)).not.toContain('rating_2');
    expect(() =>
      createContext({ ...r, policy: { ...r.policy, variableKeys: ['stereotype_text'] } }),
    ).toThrow();
  });
  it('rejects reinterpretation even when original belief is also quoted', () => {
    expect(
      validateResponse(safe + '你真正想表达的是另一个观点。', createContext(request())).violations,
    ).toContain('BELIEF_REPLACEMENT');
  });
  it('rejects a newly attributed belief despite quoting the confirmed negation', async () => {
    const run = await runFullPath(cognitiveV1);
    const r = run.calls.find((c) => c.result.stage === 'REFRAME_SOCIAL_STRUCTURE')!.contextInput;
    const text = '你提到“我认为这种刻板印象是不合理的”。你认为美国黑人贫困。';
    expect(validateResponse(text, createContext(r)).violations).toContain('BELIEF_REPLACEMENT');
  });
  it('regenerates successfully before local fallback and records metadata', async () => {
    const r = request();
    const before = JSON.stringify(r);
    const generate = vi
      .fn()
      .mockResolvedValueOnce('系统要求进入下一阶段。')
      .mockResolvedValueOnce(safe);
    const auditSink = vi.fn();
    const result = await orchestrate(r, { generate }, { auditSink });
    expect(result.status).toBe('generated');
    expect(result.attempts).toBe(2);
    expect(result.auditEvents.map((e) => e.outcome)).toEqual(['rejected', 'regenerated']);
    expect(result.auditDelivery).toBe('delivered');
    expect(auditSink).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result.auditEvents)).not.toContain('已确认观点示例');
    expect(JSON.stringify(generate.mock.calls[1])).not.toContain('系统要求进入下一阶段。');
    expect(JSON.stringify(r)).toBe(before);
  });
  it('bounds persistent failure and reports failed audit delivery without leaking errors', async () => {
    const generate = vi.fn(async () => {
      throw new Error('PRIVATE');
    });
    const result = await orchestrate(
      request(),
      { generate },
      {
        maxAttempts: 3,
        auditSink: async () => {
          throw new Error('PRIVATE_LOG');
        },
      },
    );
    expect(generate).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('fallback');
    expect(result.auditDelivery).toBe('failed');
    expect(result.auditEvents).toHaveLength(4);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(result.text).not.toMatch(/系统|后台|继续回答|当前任务/);
  });
  it.each([0, 4, 1.5, NaN])(
    'rejects invalid retry budget %s before calling generator',
    async (maxAttempts) => {
      const generate = vi.fn();
      await expect(orchestrate(request(), { generate }, { maxAttempts })).rejects.toThrow();
      expect(generate).not.toHaveBeenCalled();
    },
  );
  it('allows a single attempt when explicitly configured', async () => {
    const generate = vi.fn(async () => '');
    const result = await orchestrate(request(), { generate }, { maxAttempts: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('fallback');
  });
  it('requires scene state, phase and nonempty allowed actions from the backend policy', () => {
    const r = request(true);
    for (const scene of [
      { ...r.policy.scene!, scene_state: '' },
      { ...r.policy.scene!, scene_phase: '' },
      { ...r.policy.scene!, allowed_actions: [] },
    ]) {
      expect(() => createContext({ ...r, policy: { ...r.policy, scene } })).toThrow();
    }
    const prompt = buildPrompt(createContext(r));
    expect(prompt.statePrompt).toContain('scene_state：library');
    expect(prompt.statePrompt).toContain('scene_phase：misunderstanding');
    expect(prompt.statePrompt).toContain('allowed_actions');
    expect(prompt.statePrompt).not.toContain('SHARED_EXPERIENCE');
  });
  it.each([cognitiveV1, emotionV1])(
    'runs the entire $path path with explicit backend events only',
    async (definition) => {
      const run = await runFullPath(definition);
      expect(run.finalState.lifecycle).toBe('completed');
      expect(run.calls).toHaveLength(definition.stages.length - 2);
      expect(run.transitions).toHaveLength(definition.stages.length - 1);
      expect(run.calls.every((c) => c.stateUnchangedByOrchestrator)).toBe(true);
      expect(run.transitions.every((t) => t.origin === 'explicit-backend-simulation')).toBe(true);
      if (definition.path === 'cognitive') {
        expect(run.finalState.variables.confirmed_viewpoint).toBe('我认为这种刻板印象是不合理的');
        expect(run.finalState.variables.initial_rating).toBe(5);
        expect(run.finalState.variables.second_rating).toBe(3);
      } else {
        expect(run.calls.find((c) => c.result.stage === 'SHARED_EXPERIENCE')?.result.attempts).toBe(
          2,
        );
      }
    },
  );
});
