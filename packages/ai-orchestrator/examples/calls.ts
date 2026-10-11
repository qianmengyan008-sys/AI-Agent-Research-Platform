import { cognitiveV1, emotionV1 } from '@research/experiment-core';
import { createContext, demoPolicy, orchestrate, FixedTextGenerator } from '../src/index.js';
import { demoState } from './fixtures.js';

const cognitiveState = demoState(cognitiveV1, 'REFRAME_SOCIAL_STRUCTURE');
const cognitiveRequest = {
  state: cognitiveState,
  definition: cognitiveV1,
  policy: demoPolicy(cognitiveV1, cognitiveState.stage),
  userInput: '我想补充身边环境的影响。',
};
const cognitiveBefore = JSON.stringify(cognitiveState);
const cognitive = await orchestrate(
  cognitiveRequest,
  new FixedTextGenerator(
    '你确认的观点是“已确认观点示例”。你提到身边环境，愿意说说哪些环境因素与你的看法有关吗？',
  ),
);

const emotionalState = demoState(emotionV1, 'SHARED_EXPERIENCE');
const emotionalRequest = {
  state: emotionalState,
  definition: emotionV1,
  policy: demoPolicy(emotionV1, emotionalState.stage),
  userInput: '整理图书时，我发现我们关注的主题很相似。',
};
const emotionalBefore = JSON.stringify(emotionalState);
const emotional = await orchestrate(
  emotionalRequest,
  new FixedTextGenerator(
    '一起整理图书时发现相似的关注点，让这段共同经历多了些交流的机会。你想补充聊聊哪个主题？',
  ),
);
const rejectedAndRecovered = await orchestrate(
  emotionalRequest,
  new FixedTextGenerator('我们回到咖啡馆，进入下一阶段，对话已经结束。'),
);

console.info(
  JSON.stringify(
    {
      cognitive: {
        currentStage: cognitiveState.stage,
        variables: createContext(cognitiveRequest).memory.cognitive,
        stateUnchanged: JSON.stringify(cognitiveState) === cognitiveBefore,
        result: cognitive,
      },
      emotional: {
        currentStage: emotionalState.stage,
        stateUnchanged: JSON.stringify(emotionalState) === emotionalBefore,
        result: emotional,
      },
      rejectedAndRecovered,
    },
    null,
    2,
  ),
);
