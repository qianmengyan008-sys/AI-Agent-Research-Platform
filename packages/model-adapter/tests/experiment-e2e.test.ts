import { describe, expect, it } from 'vitest';
import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import {
  createContext,
  demoPolicy,
  orchestrate,
  validateResponse,
} from '@research/ai-orchestrator';
import { OpenAICompatibleAdapter, experimentLog, participantReply } from '../src/index.js';
import type { ModelSettings } from '../src/index.js';
import { confirmedBelief, stateAt, submit, runExperiment } from '../examples/experiment-run.js';
import { experimentCases } from '../examples/experiment-cases.js';
import { localModel, completion } from './helpers/http-server.js';

const settings: ModelSettings = {
  provider: 'openai-compatible',
  model_name: 'local-protocol-fixture',
  base_url: null,
  temperature: 0.2,
  max_tokens: 512,
  timeout_ms: 1000,
  max_attempts: 2,
};
function adapter(baseURL: string) {
  return new OpenAICompatibleAdapter({
    baseURL,
    apiKey: 'SYNTHETIC_LOCAL_KEY',
    model: settings.model_name,
    temperature: settings.temperature,
    maxTokens: settings.max_tokens,
    timeoutMs: settings.timeout_ms,
    allowLocalHTTP: true,
  });
}
function safeReply(body: Record<string, unknown>) {
  const messages = body.messages as { content: string }[];
  const statePrompt = messages[1]!.content;
  const belief = statePrompt.match(/唯一确认观点：(.*)/u)?.[1];
  return belief
    ? `你提到“${JSON.parse(belief)}”。哪些经历与你的看法有关？`
    : '图书馆里一起整理图书时，你愿意多聊一点吗？';
}
describe('experiment end-to-end through real adapter and local HTTP fixture', () => {
  it.each([cognitiveV1, emotionV1])(
    'completes the entire $path path with backend-controlled order',
    async (definition) => {
      const server = await localModel((_req, res, body) =>
        res.end(JSON.stringify(completion(safeReply(body)))),
      );
      try {
        const run = await runExperiment(definition, adapter(server.baseURL), settings);
        expect(run.status).toBe('completed');
        expect(run.finalState.lifecycle).toBe('completed');
        expect(run.calls.map((c) => c.stage)).toEqual(
          definition.stages.slice(1, -1).map((s) => s.id),
        );
        expect(run.calls.every((c) => c.stateUnchanged)).toBe(true);
        expect(run.transitions).toHaveLength(definition.stages.length - 1);
        expect(run.logs.every((l) => l.state_before.stage === l.state_after.stage)).toBe(true);
        expect(server.requests).toHaveLength(definition.stages.length - 2);
        if (definition.path === 'cognitive') {
          expect(run.finalState.variables.confirmed_viewpoint).toBe(confirmedBelief);
          expect(
            run.calls.filter((c) => c.stage.startsWith('REFRAME_')).map((c) => c.stage),
          ).toEqual([
            'REFRAME_SOCIAL_STRUCTURE',
            'REFRAME_MEDIA_ALGORITHM',
            'REFRAME_COUNTER_FACT',
            'REFRAME_INDIVIDUAL_DIFFERENCE',
          ]);
          expect(
            run.calls
              .filter((c) => c.stage.startsWith('REFRAME_'))
              .every((c) => c.context.memory.cognitive?.confirmed_belief === confirmedBelief),
          ).toBe(true);
          expect(run.transitions.find((t) => t.to === 'SECOND_RATING')?.authority).toBe(
            'explicit-participant-submission-to-backend',
          );
        } else {
          expect(
            run.calls.every((c) => c.context.variables.emotional?.scene_state === 'library'),
          ).toBe(true);
          expect(
            new Set(run.calls.map((c) => c.context.variables.emotional?.scene_phase)).size,
          ).toBe(7);
        }
      } finally {
        await server.close();
      }
    },
  );
  it.each(experimentCases)('preserves experimental facts for $id', async (scenario) => {
    const definition = scenario.path === 'cognitive' ? cognitiveV1 : emotionV1;
    const belief = 'belief' in scenario ? scenario.belief : confirmedBelief;
    const state = stateAt(definition, scenario.stage, belief);
    const request = {
      state,
      definition,
      policy: demoPolicy(definition, state.stage),
      userInput: scenario.input,
    };
    const before = JSON.stringify(state);
    const server = await localModel((_req, res, body) =>
      res.end(JSON.stringify(completion(safeReply(body)))),
    );
    try {
      const result = await orchestrate(request, adapter(server.baseURL));
      expect(result.status).toBe('generated');
      expect(JSON.stringify(state)).toBe(before);
      expect(result.stage).toBe(scenario.stage);
      expect(result).not.toHaveProperty('events');
      expect(result).not.toHaveProperty('variables');
      expect(result).not.toHaveProperty('newState');
      if (scenario.path === 'cognitive') expect(result.text).toContain(belief);
    } finally {
      await server.close();
    }
  });
  it('an interrupted rating remains in place until a separate valid submission resumes the flow', async () => {
    const state = stateAt(cognitiveV1, 'INITIAL_RATING');
    const before = JSON.stringify(state);
    const server = await localModel((_req, res) =>
      res.end(JSON.stringify(completion('我们进入认知重构。'))),
    );
    try {
      const request = {
        state,
        definition: cognitiveV1,
        policy: demoPolicy(cognitiveV1, state.stage),
        userInput: '先别评分',
      };
      const result = await orchestrate(request, adapter(server.baseURL));
      expect(result.status).toBe('fallback');
      expect(JSON.stringify(state)).toBe(before);
      expect(state.variables.initial_rating).toBeUndefined();
      expect(state.stage).toBe('INITIAL_RATING');
      const resumed = submit(state, cognitiveV1, confirmedBelief);
      expect(resumed.newState.stage).toBe('REFRAME_SOCIAL_STRUCTURE');
      expect(resumed.newState.variables.initial_rating).toBe(5);
    } finally {
      await server.close();
    }
  });
  it.each([
    ['进入下一阶段。', 'STAGE_JUMP'],
    ['系统要求你继续回答。', 'BACKEND_DISCLOSURE'],
    ['你的观点现在是另一个观点。', 'BELIEF_REPLACEMENT'],
    ['本实验旨在测量你的变化。', 'PURPOSE_DISCLOSURE'],
    ['现在进行第二次评分。', 'CURRENT_STAGE_RESTRICTION'],
    ['{"stage":"COMPLETED"}', 'CONTROL_INSTRUCTION'],
  ] as const)('rejects adversarial provider text: %s', async (text, code) => {
    const state = stateAt(cognitiveV1, 'REFRAME_SOCIAL_STRUCTURE');
    const before = JSON.stringify(state);
    const server = await localModel((_req, res) => res.end(JSON.stringify(completion(text))));
    try {
      const request = {
        state,
        definition: cognitiveV1,
        policy: demoPolicy(cognitiveV1, state.stage),
        userInput: '用户补充',
      };
      const result = await orchestrate(request, adapter(server.baseURL));
      expect(result.violations).toContain(code);
      expect(result.status).toBe('fallback');
      expect(validateResponse(result.text, createContext(request)).valid).toBe(true);
      expect(JSON.stringify(state)).toBe(before);
    } finally {
      await server.close();
    }
  });
  it.each(['评分对象：新的观点。', '评分对象：__CONFIRMED_BELIEF__。'])(
    'rejects new or forged scoring claims outside the exact frozen quotation: %s',
    (text) => {
      const belief = '我仅选择对群体A的能力印象作为本次评分对象';
      const state = stateAt(cognitiveV1, 'INITIAL_RATING', belief);
      const request = {
        state,
        definition: cognitiveV1,
        policy: demoPolicy(cognitiveV1, state.stage),
        userInput: '用户补充',
      };
      expect(
        validateResponse(`你提到“${belief}”。${text}`, createContext(request)).violations,
      ).toContain('BELIEF_REPLACEMENT');
    },
  );
  it('records all requested administrator fields and isolates participant output', async () => {
    const state = stateAt(cognitiveV1, 'REFRAME_SOCIAL_STRUCTURE');
    const server = await localModel((_req, res) =>
      res.end(JSON.stringify(completion('系统检测到错误'))),
    );
    try {
      const result = await orchestrate(
        {
          state,
          definition: cognitiveV1,
          policy: demoPolicy(cognitiveV1, state.stage),
          userInput: 'PRIVATE_USER_TEXT',
        },
        adapter(server.baseURL),
      );
      const log = experimentLog({
        conversation_id: 'synthetic-conversation',
        participant_id: 'synthetic-P001',
        state_before: state,
        state_after: state,
        model_name: settings.model_name,
        result,
        response_latency: 12,
        fallback_count: 1,
      });
      expect(Object.keys(log)).toEqual([
        'conversation_id',
        'participant_id',
        'state_before',
        'state_after',
        'model_name',
        'prompt_version',
        'response_latency',
        'validator_result',
        'fallback_count',
      ]);
      expect(log.state_before).toEqual(log.state_after);
      expect(log.fallback_count).toBe(1);
      expect(JSON.stringify(log)).not.toContain('PRIVATE_USER_TEXT');
      expect(JSON.stringify(log)).not.toContain(confirmedBelief);
      expect(participantReply(result)).toEqual({ text: result.text });
      expect(Object.keys(participantReply(result))).toEqual(['text']);
    } finally {
      await server.close();
    }
  });
});
