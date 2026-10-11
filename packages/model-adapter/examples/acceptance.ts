import { cognitiveV1, emotionV1, dailyV1 } from '@research/experiment-core';
import { orchestrate, demoPolicy, createContext, buildPrompt } from '@research/ai-orchestrator';
import { MockAdapter } from '../src/index.js';
import { demoState } from '../../ai-orchestrator/examples/fixtures.js';
import { runFullPath } from '../../ai-orchestrator/examples/full-paths.js';

const paths = {
  cognitive: await runFullPath(cognitiveV1, (reply) => new MockAdapter(reply)),
  emotional: await runFullPath(emotionV1, (reply) => new MockAdapter(reply)),
  daily: await runFullPath(dailyV1, (reply) => new MockAdapter(reply)),
};
const replacement = await runFullPath(cognitiveV1, (reply) => ({
  generate: async () => `${reply}我在听。`,
}));
const stage = 'REFRAME_SOCIAL_STRUCTURE';
const request = {
  state: demoState(cognitiveV1, stage),
  definition: cognitiveV1,
  policy: demoPolicy(cognitiveV1, stage),
  userInput: '我想聊聊环境的影响。',
};
const failureCases = [];
for (const [name, adapter] of [
  [
    'providerFailure',
    new MockAdapter(async () => {
      throw new Error('PRIVATE_PROVIDER_ERROR');
    }),
  ],
  ['timeout', new MockAdapter(async () => new Promise(() => {}))],
  ['invalidReply', new MockAdapter('现在进行第二次评分。')],
] as const) {
  const before = JSON.stringify(request.state);
  const result = await orchestrate(request, adapter, { timeoutMs: 10, maxAttempts: 1 });
  failureCases.push({ name, result, stateUnchanged: JSON.stringify(request.state) === before });
}
const context = createContext(request);
console.info(
  JSON.stringify(
    {
      synthetic: true,
      realModelCalls: 0,
      paths,
      substitution: {
        finalStateIdentical:
          JSON.stringify(paths.cognitive.finalState) === JSON.stringify(replacement.finalState),
        transitionsIdentical:
          JSON.stringify(paths.cognitive.transitions) === JSON.stringify(replacement.transitions),
      },
      failureCases,
      contextExample: { backend: context, model: buildPrompt(context) },
    },
    null,
    2,
  ),
);
