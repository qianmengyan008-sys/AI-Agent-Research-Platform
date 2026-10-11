import { createInitialState, transition } from '@research/experiment-core';
import type {
  ExperimentDefinition,
  ExperimentStateSnapshot,
  Scalar,
} from '@research/experiment-core';
import { createContext, demoPolicy, orchestrate } from '@research/ai-orchestrator';
import type { LanguageGenerator, OrchestrationRequest } from '@research/ai-orchestrator';
import { experimentLog, participantReply } from '../src/index.js';
import type { ModelSettings } from '../src/index.js';

export const confirmedBelief = '我认为这种刻板印象是不合理的';
export function submitData(
  state: ExperimentStateSnapshot,
  definition: ExperimentDefinition,
  belief: string,
) {
  const stage = definition.stages[state.version];
  if (!stage?.on) throw new Error('Missing explicit backend event');
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
            ? belief
            : state.stage === 'STEREOTYPE_CAPTURE'
              ? '我听到不同刻板印象，但不赞同它们。'
              : `合成参与者回答：${state.stage}`;
  }
  return data;
}
export function submit(
  state: ExperimentStateSnapshot,
  definition: ExperimentDefinition,
  belief: string,
) {
  const stage = definition.stages[state.version];
  if (!stage?.on) throw new Error('Missing explicit backend event');
  const result = transition(
    state,
    {
      id: `run-${definition.path}-${state.version}`,
      type: stage.on,
      experimentVersion: state.experimentVersion,
      expectedStateVersion: state.version,
    },
    submitData(state, definition, belief),
    definition,
  );
  if (!result.ok) throw new Error('Backend simulation rejected submission');
  return result;
}
export function stateAt(
  definition: ExperimentDefinition,
  target: string,
  belief = confirmedBelief,
) {
  let state = createInitialState(definition);
  while (state.stage !== target) state = submit(state, definition, belief).newState;
  return state;
}

/** The backend simulator owns explicit participant submissions. Models do not advance state. */
export async function runExperiment(
  definition: ExperimentDefinition,
  generator: LanguageGenerator,
  settings: ModelSettings,
) {
  let state = createInitialState(definition);
  let fallbackCount = 0;
  const calls = [];
  const transitions = [];
  const logs = [];
  let status: 'completed' | 'provider_failed' | 'blocked' = 'completed';
  while (state.lifecycle !== 'completed') {
    if (state.lifecycle === 'active') {
      const request: OrchestrationRequest = {
        state,
        definition,
        policy: demoPolicy(definition, state.stage),
        userInput:
          state.stage === 'INITIAL_RATING'
            ? '我想先聊一下，暂时不想评分。'
            : definition.path === 'emotional'
              ? '好，我愿意聊聊当前的经历。'
              : '我愿意补充自己的想法。',
      };
      const context = createContext(request);
      const before = JSON.stringify(state);
      const start = performance.now();
      const result = await orchestrate(request, generator, {
        timeoutMs: settings.timeout_ms,
        maxAttempts: settings.max_attempts,
      });
      const responseLatency = performance.now() - start;
      const unchanged = JSON.stringify(state) === before;
      if (!unchanged) throw new Error('Model call changed backend state');
      fallbackCount += result.status === 'fallback' ? 1 : 0;
      logs.push(
        experimentLog({
          conversation_id: `synthetic-${definition.path}`,
          participant_id: 'synthetic-P001',
          state_before: state,
          state_after: state,
          model_name: settings.model_name,
          model_parameters: settings,
          response_latency: responseLatency,
          fallback_count: fallbackCount,
          result,
        }),
      );
      calls.push({
        stage: state.stage,
        context,
        result,
        participant: participantReply(result),
        stateUnchanged: unchanged,
      });
      if (result.status === 'blocked') {
        status = 'blocked';
        break;
      }
      if (
        result.status !== 'generated' &&
        result.violations.some((v) =>
          ['GENERATOR_FAILURE', 'GENERATOR_TIMEOUT', 'GENERATOR_ABORTED'].includes(v),
        )
      ) {
        status = 'provider_failed';
        break;
      }
    }
    // Simulate a separate, explicit valid submission after any interruption.
    const from = state.stage;
    const accepted = submit(state, definition, confirmedBelief);
    transitions.push({
      from,
      to: accepted.newState.stage,
      authority: 'explicit-participant-submission-to-backend',
      variables: accepted.variables,
    });
    state = accepted.newState;
  }
  return {
    path: definition.path,
    synthetic: true,
    status,
    calls,
    transitions,
    logs,
    fallback_count: fallbackCount,
    finalState: state,
  };
}
