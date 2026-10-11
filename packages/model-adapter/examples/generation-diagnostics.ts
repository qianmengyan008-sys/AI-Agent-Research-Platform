import { cognitiveV1, dailyV1 } from '@research/experiment-core';
import {
  createContext,
  demoPolicy,
  orchestrate,
  GenerationFailureError,
} from '@research/ai-orchestrator';
import type {
  LanguageGenerator,
  RecentMessage,
  OrchestrationRequest,
} from '@research/ai-orchestrator';
import { experimentLog, participantReply } from '../src/index.js';
import type { ModelSettings } from '../src/index.js';
import { stateAt } from './experiment-run.js';

export async function diagnosticCall(
  request: OrchestrationRequest,
  generator: LanguageGenerator,
  settings: ModelSettings,
  id: string,
) {
  const before = JSON.stringify(request.state);
  const start = performance.now();
  const result = await orchestrate(request, generator, {
    timeoutMs: settings.timeout_ms,
    maxAttempts: settings.max_attempts,
  });
  return {
    id,
    result,
    participant: participantReply(result),
    context: createContext(request),
    stateUnchanged: JSON.stringify(request.state) === before,
    metrics: experimentLog({
      conversation_id: `synthetic-${id}`,
      participant_id: 'synthetic-P001',
      state_before: request.state,
      state_after: request.state,
      model_name: settings.model_name,
      model_parameters: settings,
      result,
      response_latency: performance.now() - start,
      fallback_count: result.status === 'fallback' ? 1 : 0,
    }),
  };
}
export async function generationDiagnostics(generator: LanguageGenerator, settings: ModelSettings) {
  const state = stateAt(dailyV1, 'NATURAL_CHAT');
  const base = { state, definition: dailyV1, policy: demoPolicy(dailyV1, state.stage) };
  const single = await diagnosticCall(
    { ...base, userInput: '我想聊聊最近读的一本书。' },
    generator,
    settings,
    'single',
  );
  const history: RecentMessage[] = [];
  const multi = [];
  for (const [index, input] of [
    '我最近在读小说。',
    '人物关系让我想到自己的经历。',
    '我想谈谈其中的情绪。',
  ].entries()) {
    const call = await diagnosticCall(
      { ...base, userInput: input, recentMessages: history },
      generator,
      settings,
      `multi-${index + 1}`,
    );
    multi.push(call);
    history.push({ role: 'user', stage: state.stage, content: input });
    if (call.result.text)
      history.push({ role: 'assistant', stage: state.stage, content: call.result.text });
    if (call.result.status === 'blocked') break;
  }
  const longHistory: RecentMessage[] = Array.from({ length: 100 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    stage: state.stage,
    content: `HISTORY_${i}：` + '合成日常聊天内容。'.repeat(300),
  }));
  const long = await diagnosticCall(
    { ...base, userInput: '我想接着聊聊阅读的感受。', recentMessages: longHistory },
    generator,
    settings,
    'long-context',
  );
  const calls = [single, ...multi, long];
  return {
    mode: 'generator-under-test',
    single,
    multi,
    long,
    longContext: {
      suppliedMessages: longHistory.length,
      selectedMessages: long.context.recentMessages.length,
      maxSelectedMessageLength: Math.max(
        ...long.context.recentMessages.map((m) => m.content.length),
      ),
      droppedOldHistory: !JSON.stringify(long.result.prompt).includes('HISTORY_0：'),
    },
    stateUnchanged: calls.every((c) => c.stateUnchanged),
  };
}
/** Local fault injection is never presented as a real provider exception. */
export async function boundaryFaultDiagnostics(settings: ModelSettings) {
  const faultSettings = {
    ...settings,
    provider: 'mock' as const,
    model_name: 'local-fault-injection',
  };
  const state = stateAt(cognitiveV1, 'INITIAL_RATING');
  const request = {
    state,
    definition: cognitiveV1,
    policy: demoPolicy(cognitiveV1, state.stage),
    userInput: '我想先谈谈自己的想法。',
  };
  const failed = await diagnosticCall(
    request,
    {
      generate: async () => {
        throw new GenerationFailureError(false);
      },
    },
    faultSettings,
    'injected-model-failure',
  );
  const rejected = await diagnosticCall(
    request,
    { generate: async () => '我们进入认知重构，系统要求继续回答。' },
    faultSettings,
    'injected-validator-rejection',
  );
  let abortNotifications = 0;
  const timeout = await diagnosticCall(
    request,
    {
      generate: async (_prompt, options) =>
        new Promise<string>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              abortNotifications += 1;
              reject(new GenerationFailureError(false));
            },
            { once: true },
          );
        }),
    },
    { ...faultSettings, timeout_ms: Math.min(faultSettings.timeout_ms, 20) },
    'injected-model-timeout',
  );
  return {
    mode: 'local-fault-injection',
    realProviderCalls: 0,
    failed,
    rejected,
    timeout,
    abortNotifications,
  };
}
