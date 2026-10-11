import { createInitialState, transition, cognitiveV1, emotionV1 } from '@research/experiment-core';
import type { ExperimentDefinition, Scalar } from '@research/experiment-core';
import { createContext, buildPrompt, demoPolicy, orchestrate } from '../src/index.js';
import type { LanguageGenerator } from '../src/index.js';

/** Synthetic backend simulation: only the explicit transition below advances state. */
export async function runFullPath(
  definition: ExperimentDefinition,
  generatorFactory?: (reply: string, stage: string) => LanguageGenerator,
) {
  let state = createInitialState(definition);
  const calls = [];
  const transitions = [];
  while (state.lifecycle !== 'completed') {
    const stage = definition.stages[state.version];
    if (!stage?.on) throw new Error('Missing backend event');
    if (state.lifecycle === 'active') {
      const request = {
        state,
        definition,
        policy: demoPolicy(definition, state.stage),
        userInput: '我愿意谈谈自己的想法。',
      };
      const before = JSON.stringify(state);
      const context = createContext(request);
      const reply = context.memory.cognitive?.confirmed_belief
        ? `你提到“${context.memory.cognitive.confirmed_belief}”。哪些经历让你形成这样的看法？`
        : definition.path === 'emotional'
          ? '在图书馆里整理图书时，你提到的感受让我很在意。你愿意多聊一点吗？'
          : '我在听，你愿意分享自己的感受吗？';
      let count = 0;
      const result = await orchestrate(
        request,
        generatorFactory
          ? generatorFactory(reply, state.stage)
          : {
              generate: async () => {
                count += 1;
                return count === 1 && state.stage === 'SHARED_EXPERIENCE'
                  ? '系统要求进入下一阶段。'
                  : reply;
              },
            },
      );
      const unchanged = JSON.stringify(state) === before;
      if (!unchanged || result.status !== 'generated')
        throw new Error('Orchestration invariant failed');
      calls.push({
        contextInput: request,
        contextOutput: context,
        prompt: buildPrompt(context),
        result,
        stateUnchangedByOrchestrator: unchanged,
      });
    }
    const data: Record<string, Scalar> = {};
    for (const field of stage.fields) {
      data[field.field] =
        field.type === 'confirmation'
          ? true
          : field.type === 'number'
            ? state.stage === 'SECOND_RATING'
              ? 3
              : 5
            : field.field === 'viewpoint'
              ? '我认为这种刻板印象是不合理的'
              : state.stage === 'STEREOTYPE_CAPTURE'
                ? '我曾听到一种刻板印象，但不赞同它'
                : `合成参与者回答：${state.stage}`;
    }
    const result = transition(
      state,
      {
        id: `acceptance-${definition.path}-${state.version}`,
        type: stage.on,
        experimentVersion: state.experimentVersion,
        expectedStateVersion: state.version,
      },
      data,
      definition,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    transitions.push({
      from: state.stage,
      to: result.newState.stage,
      event: stage.on,
      origin: 'explicit-backend-simulation',
      variables: result.variables,
    });
    state = result.newState;
  }
  return { path: definition.path, synthetic: true, calls, transitions, finalState: state };
}
export async function fullPathExamples() {
  return { cognitive: await runFullPath(cognitiveV1), emotional: await runFullPath(emotionV1) };
}
