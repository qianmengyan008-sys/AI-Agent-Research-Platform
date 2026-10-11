import { describe, expect, it } from 'vitest';
import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import { createContext, demoPolicy, orchestrate, validateResponse } from '../src/index.js';
import { demoState } from '../examples/fixtures.js';

function cafeteria(phase = 'seated') {
  const stage = 'SHARED_EXPERIENCE';
  const policy = demoPolicy(emotionV1, stage);
  return {
    state: demoState(emotionV1, stage),
    definition: emotionV1,
    policy: {
      ...policy,
      scene: {
        ...policy.scene!,
        id: 'cafeteria-seated',
        scene_state: 'cafeteria',
        scene_phase: phase,
        description: '食堂内已经取好饭，正在座位交流。',
        fixedTransition: '保持座位交流，不重新取餐或转场。',
        allowed_actions: ['回应当前座位交流'],
      },
    },
    userInput: '好的',
  };
}
describe('round nine context-dependent validator regressions', () => {
  it.each(['重新打饭。', '我们重新认识人物吧。', '跳回图书馆。', '我们返回图书馆整理图书。'])(
    'rejects prohibited cafeteria.seated actions: %s',
    async (text) => {
      const request = cafeteria();
      const before = JSON.stringify(request.state);
      const context = createContext(request);
      expect(validateResponse(text, context).violations).toContain('WRONG_SCENE');
      const result = await orchestrate(request, { generate: async () => text });
      expect(result.status).toBe('fallback');
      expect(result.attempts).toBe(2);
      expect(validateResponse(result.text, context).valid).toBe(true);
      expect(JSON.stringify(request.state)).toBe(before);
    },
  );
  it('applies the seated restriction according to trusted scene phase', () => {
    expect(validateResponse('去打饭吧。', createContext(cafeteria())).valid).toBe(false);
    // This only demonstrates the seated guard; other phases need approved policies.
    expect(validateResponse('去打饭吧。', createContext(cafeteria('queue'))).valid).toBe(true);
    expect(validateResponse('这顿午餐你最喜欢哪道菜？', createContext(cafeteria())).valid).toBe(
      true,
    );
  });
  it('blocks premature reframe and a substituted frozen belief at INITIAL_RATING', () => {
    const stage = 'INITIAL_RATING';
    const request = {
      state: demoState(cognitiveV1, stage),
      definition: cognitiveV1,
      policy: demoPolicy(cognitiveV1, stage),
      userInput: '拒绝评分。',
    };
    const context = createContext(request);
    expect(validateResponse('现在进入认知重构阶段。', context).violations).toContain('STAGE_JUMP');
    expect(validateResponse('你真正想表达的是另一个观点。', context).violations).toContain(
      'BELIEF_REPLACEMENT',
    );
  });
  it('does not convert a denial into a negative stereotype or any backend variable', async () => {
    const stage = 'STEREOTYPE_CAPTURE';
    const state = demoState(cognitiveV1, stage);
    const before = JSON.stringify(state);
    const request = {
      state,
      definition: cognitiveV1,
      policy: demoPolicy(cognitiveV1, stage),
      userInput: '我不认为所有美国黑人都这样。',
    };
    expect(createContext(request).variables.cognitive?.negative_stereotype).toBeNull();
    const result = await orchestrate(request, {
      generate: async () => '你是在否定这种概括，愿意谈谈你的看法吗？',
    });
    expect(result.status).toBe('generated');
    expect(JSON.stringify(state)).toBe(before);
    expect(result).not.toHaveProperty('variables');
    expect(result).not.toHaveProperty('newState');
    // No classifier exists here. This tests write authority, not real LLM semantics.
  });
});
