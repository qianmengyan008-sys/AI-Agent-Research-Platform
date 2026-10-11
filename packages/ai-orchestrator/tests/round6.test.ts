import { describe, it, expect } from 'vitest';
import { cognitiveV1, emotionV1, dailyV1 } from '@research/experiment-core';
import {
  createContext,
  demoPolicy,
  buildPrompt,
  validateResponse,
  orchestrate,
  FixedTextGenerator,
} from '../src/index.js';
import { demoState } from '../examples/fixtures.js';

function request(stage = 'INITIAL_RATING') {
  return {
    state: demoState(cognitiveV1, stage),
    definition: cognitiveV1,
    policy: demoPolicy(cognitiveV1, stage),
    userInput: '我想补充一下。',
  };
}
function cafeteria() {
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
        scene_phase: 'seated',
        description: '食堂内已取好饭，正在座位上交流。',
        fixedTransition: '保持当前座位交流。',
        allowed_actions: ['描述当前座位交流', '回应用户补充'],
      },
    },
    userInput: '聊聊午餐吧。',
  };
}
describe('experiment-level interface boundaries', () => {
  it('separates structured backend facts from the explicit model projection', () => {
    const r = request();
    const context = createContext(r);
    expect(context.experiment.currentStage).toBe('INITIAL_RATING');
    expect(context.experiment.experimentVersion).toBe('cognitive_v1');
    expect(context.experiment.completedEvents).toHaveLength(3);
    expect(context.variables.cognitive?.confirmed_belief).toBe('已确认观点示例');
    expect(context.variables.cognitive?.rating_1).toBeNull();
    const prompt = JSON.stringify(buildPrompt(context));
    for (const secret of [
      'completedEvents',
      'VIEWPOINT_CONFIRMED',
      'experimentVersion',
      'stateVersion',
      'rating_1',
      'rating_2',
      'source',
      'REFRAME_SOCIAL_STRUCTURE',
    ])
      expect(prompt).not.toContain(secret);
  });
  it('keeps hypothesis, rating targets and administrator rules out of messages', () => {
    const r = request();
    const privatePolicy = {
      ...r.policy,
      hypothesis: 'SECRET_POLICY_HYPOTHESIS',
      rating_target: 'SECRET_POLICY_TARGET',
      administrator_rules: 'SECRET_POLICY_ADMIN',
      forbiddenPurpose: [...r.policy.forbiddenPurpose, 'SECRET_VALIDATOR_RULE'],
    };
    const context = createContext({
      ...r,
      policy: privatePolicy,
      state: {
        ...r.state,
        variables: {
          ...r.state.variables,
          hypothesis: 'SECRET_HYPOTHESIS',
          rating_target: 'SECRET_RATING_TARGET',
          administrator_rules: 'SECRET_ADMIN_RULES',
        },
      },
    });
    expect(JSON.stringify(buildPrompt(context))).not.toContain('SECRET_');
  });
  it.each(['hypothesis', 'rating_target', 'administrator_rules'])(
    'rejects accidental whitelist exposure of %s',
    (key) => {
      const r = cafeteria();
      expect(() => createContext({ ...r, policy: { ...r.policy, variableKeys: [key] } })).toThrow(
        'allowlist',
      );
    },
  );
  it('does not give daily chat access to experimental variables', () => {
    const stage = 'NATURAL_CHAT';
    expect(() =>
      createContext({
        state: demoState(dailyV1, stage),
        definition: dailyV1,
        policy: { ...demoPolicy(dailyV1, stage), variableKeys: ['rating_1'] },
        userInput: '天气不错',
      }),
    ).toThrow('allowlist');
  });
  it.each(['我们进入认知重构。', '现在开始第二次评分。', '接下来填写行动意愿。'])(
    'rejects stage-inconsistent INITIAL_RATING text: %s',
    (text) => {
      expect(validateResponse(text, createContext(request())).violations).toContain('STAGE_JUMP');
    },
  );
  it.each(['INITIAL_RATING', 'SECOND_RATING', 'ACTION_INTENTION'])(
    'protects the confirmed rating object after confirmation in %s',
    (stage) => {
      expect(
        validateResponse('评分对象：另一个用户没有表达的观点。', createContext(request(stage)))
          .violations,
      ).toContain('BELIEF_REPLACEMENT');
      expect(
        validateResponse('你认为另一种观点。', createContext(request(stage))).violations,
      ).toContain('BELIEF_REPLACEMENT');
      expect(
        validateResponse('评分对象：“已确认观点示例”。', createContext(request(stage))).valid,
      ).toBe(true);
    },
  );
  it.each(['INITIAL_RATING', 'SECOND_RATING'])(
    'requires a frozen confirmed belief in %s',
    (stage) => {
      const r = request(stage);
      expect(() =>
        createContext({ ...r, policy: { ...r.policy, requiresConfirmedBelief: false } }),
      ).toThrow('must require');
      expect(() =>
        createContext({
          ...r,
          state: { ...r.state, variables: { ...r.state.variables, viewpoint_confirmed: false } },
        }),
      ).toThrow('confirmed belief');
      expect(validateResponse('请给另一个观点评分', createContext(r)).violations).toContain(
        'BELIEF_ANCHOR_MISSING',
      );
    },
  );
  it('represents persona, scene state and phase as separate structured variables', () => {
    const context = createContext(cafeteria());
    expect(context.variables.emotional).toEqual({
      persona_snapshot: '合成回答：PERSONA_SETUP',
      scene_state: 'cafeteria',
      scene_phase: 'seated',
    });
    expect(buildPrompt(context).statePrompt).toContain('回应用户补充');
  });
  it.each([
    '重新去食堂打饭。',
    '我们重新认识人物吧。',
    '去打饭吧。',
    '现在结束故事。',
    '进入新场景。',
    '重新见面。',
  ])('rejects cafeteria regressions or self-ending: %s', (text) => {
    expect(validateResponse(text, createContext(cafeteria())).valid).toBe(false);
  });
  it('allows natural dialogue while seated without exposing scene metadata', () => {
    expect(
      validateResponse('这顿午餐让人很放松，你最喜欢哪道菜？', createContext(cafeteria())).valid,
    ).toBe(true);
  });
  it.each(['请继续完成当前任务', '系统检测到错误', '接下来进入下一阶段'])(
    'rejects backend language even when configured as fallback: %s',
    async (text) => {
      const r = cafeteria();
      const result = await orchestrate(
        { ...r, policy: { ...r.policy, fallbackReplies: [text, text] } },
        new FixedTextGenerator(''),
        { maxAttempts: 1 },
      );
      expect(result.status).toBe('blocked');
      expect(result.text).toBeNull();
    },
  );
});
