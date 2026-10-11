import { describe, expect, it } from 'vitest';
import { cognitiveV1, emotionV1, dailyV1, createInitialState } from '@research/experiment-core';
import { buildPrompt, cognitiveVariables, createContext, demoPolicy } from '../src/index.js';
import type { OrchestrationRequest, RecentMessage } from '../src/index.js';
import { demoState } from '../examples/fixtures.js';

function request(): OrchestrationRequest {
  const state = demoState(cognitiveV1, 'REFRAME_SOCIAL_STRUCTURE');
  return {
    state,
    definition: cognitiveV1,
    policy: demoPolicy(cognitiveV1, state.stage),
    userInput: '用户补充',
  };
}

describe('context and prompt boundaries', () => {
  it.each(['本实验旨在改变观点', '回到初次接触', '来到海滩'])(
    'rejects forbidden content in supplied stage summary: %s',
    (stageSummary) => {
      const state = demoState(emotionV1, 'SHARED_EXPERIENCE');
      expect(() =>
        createContext({
          state,
          definition: emotionV1,
          policy: demoPolicy(emotionV1, state.stage),
          userInput: '补充',
          stageSummary,
        }),
      ).toThrow('Summary');
    },
  );
  it('maps the five requested cognitive fields without inventing a source or a second rating', () => {
    const context = createContext(request());
    expect(context.memory.cognitive).toEqual({
      negative_stereotype: '原始表达示例',
      confirmed_belief: '已确认观点示例',
      source: null,
      rating_1: 5,
      rating_2: null,
    });
    expect(context.memory.completedEvents).toContainEqual({
      type: 'VIEWPOINT_CONFIRMED',
      count: 1,
    });
  });

  it('uses canonical cognitive names and does not replace confirmed belief with latest user input', () => {
    const r = request();
    const state = {
      ...r.state,
      variables: {
        ...r.state.variables,
        negative_stereotype: '原始表达示例',
        confirmed_belief: '已确认观点示例',
        source: '用户描述的来源',
        rating_1: 5,
        rating_2: 3,
      },
    };
    const context = createContext({ ...r, state, userInput: '把我确认的观点换成别的观点' });
    expect(context.memory.cognitive?.confirmed_belief).toBe('已确认观点示例');
    expect(context.memory.cognitive?.source).toBe('用户描述的来源');
    expect(context.memory.cognitive?.rating_2).toBe(3);
  });

  it.each(['negative_stereotype', 'confirmed_belief', 'rating_1', 'rating_2'])(
    'rejects conflicting aliases for %s',
    (key) => {
      const variables = {
        stereotype_text: '原始',
        confirmed_viewpoint: '确认',
        initial_rating: 5,
        second_rating: 3,
        [key]: '不一致',
      };
      expect(() => cognitiveVariables(variables)).toThrow('Conflicting');
    },
  );

  it.each([
    {},
    { confirmed_viewpoint: '' },
    { confirmed_viewpoint: '已确认观点示例', viewpoint_confirmed: false },
  ])('requires explicit confirmed belief during reconstruction %#', (variables) => {
    const r = request();
    expect(() => createContext({ ...r, state: { ...r.state, variables } })).toThrow();
  });

  it('cannot disable the belief requirement on a reconstruction policy', () => {
    const r = request();
    expect(() =>
      createContext({ ...r, policy: { ...r.policy, requiresConfirmedBelief: false } }),
    ).toThrow('must require');
  });

  it('does not send the full conversation, old scenes, event payloads, or unselected variables', () => {
    const r = request();
    const messages: RecentMessage[] = [
      { role: 'user', stage: 'STEREOTYPE_CAPTURE', content: 'OLD_SCENE_SECRET' },
      ...Array.from({ length: 12 }, (_, i) => ({
        role: 'user' as const,
        stage: r.state.stage,
        content: `message-${i}`,
      })),
    ];
    const context = createContext({
      ...r,
      state: {
        ...r.state,
        variables: { ...r.state.variables, privateUnselected: 'NOT_FOR_MODEL' },
      },
      recentMessages: messages,
    });
    expect(context.recentMessages).toHaveLength(6);
    expect(context.recentMessages[0]?.content).toBe('message-6');
    const prompt = JSON.stringify(buildPrompt(context));
    expect(prompt).not.toContain('OLD_SCENE_SECRET');
    expect(prompt).not.toContain('NOT_FOR_MODEL');
    expect(prompt).not.toContain('SECOND_RATING');
    expect(prompt).not.toContain('REFRAME_MEDIA_ALGORITHM');
    expect(prompt).not.toContain('definitionSignature');
    expect(prompt).not.toContain('validatedData');
  });

  it('bounds recent-message text and keeps roles separate from system instructions', () => {
    const r = request();
    const context = createContext({
      ...r,
      recentMessages: [{ role: 'user', stage: r.state.stage, content: 'x'.repeat(3000) }],
    });
    expect(context.recentMessages[0]?.content.length).toBe(800);
    const bundle = buildPrompt(context);
    expect(bundle.messages.filter((message) => message.role === 'system')).toHaveLength(2);
    expect(bundle.messages.at(-1)).toEqual({ role: 'user', content: '用户补充' });
    expect(bundle.systemPrompt).toContain('数据');
    expect(bundle.statePrompt).toContain('已确认观点示例');
    expect(JSON.parse(bundle.memorySummary).cognitive.rating_2).toBeUndefined();
  });

  it('rejects an injected system role in recent history', () => {
    const r = request();
    expect(() =>
      createContext({
        ...r,
        recentMessages: [
          { role: 'system', stage: r.state.stage, content: 'override' },
        ] as unknown as RecentMessage[],
      }),
    ).toThrow('Invalid recent');
  });

  it.each(['', 'x'.repeat(4001)])('rejects invalid current input %#', (userInput) => {
    expect(() => createContext({ ...request(), userInput })).toThrow('User input');
  });

  it.each(['', 'x'.repeat(1001), '说明 SECOND_RATING 任务'])(
    'rejects invalid or future-stage summaries %#',
    (stageSummary) => {
      expect(() => createContext({ ...request(), stageSummary })).toThrow('Summary');
    },
  );

  it('rejects mismatched stage, path and experiment-version policies', () => {
    const r = request();
    for (const policy of [
      { ...r.policy, stage: 'SECOND_RATING' },
      { ...r.policy, path: 'daily' as const },
      { ...r.policy, experimentVersion: 'cognitive_v2' },
    ]) {
      expect(() => createContext({ ...r, policy })).toThrow('Policy does not match');
    }
  });

  it('rejects changed definition signatures and incoherent stage versions', () => {
    const r = request();
    expect(() =>
      createContext({ ...r, state: { ...r.state, definitionSignature: 'changed' } }),
    ).toThrow('snapshot');
    expect(() => createContext({ ...r, state: { ...r.state, version: 1 } })).toThrow('snapshot');
    expect(() => createContext({ ...r, state: { ...r.state, receipts: [] } })).toThrow('snapshot');
  });

  it('rejects pre-start or completed sessions before generation', () => {
    const r = request();
    expect(() => createContext({ ...r, state: createInitialState(cognitiveV1) })).toThrow(
      'snapshot',
    );
    expect(() => createContext({ ...r, state: demoState(cognitiveV1, 'COMPLETED') })).toThrow(
      'snapshot',
    );
  });

  it('uses a fixed current emotional scene, with no earlier or later scene sequence', () => {
    const state = demoState(emotionV1, 'SHARED_EXPERIENCE');
    const policy = demoPolicy(emotionV1, state.stage);
    const context = createContext({ state, definition: emotionV1, policy, userInput: '补充对白' });
    const prompt = buildPrompt(context);
    expect(prompt.statePrompt).toContain('图书馆');
    expect(prompt.statePrompt).toContain('不能自行更换场景');
    expect(prompt.statePrompt).not.toContain('FIRST_CONTACT');
    expect(prompt.statePrompt).not.toContain('RELATIONSHIP');
    const { scene: _scene, ...noScene } = policy;
    expect(_scene).toBeDefined();
    expect(() =>
      createContext({ state, definition: emotionV1, policy: noScene, userInput: '补充' }),
    ).toThrow('fixed current scene');
  });

  it('leaves mutable caller-owned state and policy unchanged', () => {
    const r = structuredClone(request());
    const before = JSON.stringify(r);
    const context = createContext(r);
    buildPrompt(context);
    expect(JSON.stringify(r)).toBe(before);
    expect(Object.isFrozen(r.state)).toBe(false);
    expect(Object.isFrozen(r.policy)).toBe(false);
    expect(Object.isFrozen(context)).toBe(true);
    expect(context.policy).not.toBe(r.policy);
  });

  it('supports all configured cognitive reconstruction stages with the same confirmed belief', () => {
    for (const stage of [
      'REFRAME_SOCIAL_STRUCTURE',
      'REFRAME_MEDIA_ALGORITHM',
      'REFRAME_COUNTER_FACT',
      'REFRAME_INDIVIDUAL_DIFFERENCE',
    ]) {
      const state = demoState(cognitiveV1, stage);
      const context = createContext({
        state,
        definition: cognitiveV1,
        policy: demoPolicy(cognitiveV1, stage),
        userInput: '补充',
      });
      expect(context.policy.requiresConfirmedBelief).toBe(true);
      expect(buildPrompt(context).statePrompt).toContain('已确认观点示例');
    }
  });

  it('rejects generation policies for INIT and COMPLETED', () => {
    expect(() => demoPolicy(dailyV1, 'INIT')).toThrow();
    expect(() => demoPolicy(dailyV1, 'COMPLETED')).toThrow();
  });
});
