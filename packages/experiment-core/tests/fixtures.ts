import { EventType, cognitiveV1, createInitialState, transition } from '../src/index.js';
import type { ExperimentDefinition, ExperimentStateSnapshot, Scalar } from '../src/index.js';

export const cognitiveSteps: readonly {
  type: EventType;
  data: Record<string, Scalar>;
  target: string;
}[] = [
  { type: EventType.EXPERIMENT_STARTED, data: {}, target: 'STEREOTYPE_CAPTURE' },
  {
    type: EventType.STEREOTYPE_SUBMITTED,
    data: { response: '测试用观点' },
    target: 'VIEWPOINT_CONFIRMATION',
  },
  {
    type: EventType.VIEWPOINT_CONFIRMED,
    data: { viewpoint: '测试用观点', confirmed: true },
    target: 'INITIAL_RATING',
  },
  { type: EventType.RATING_SUBMITTED, data: { rating: 5 }, target: 'REFRAME_SOCIAL_STRUCTURE' },
  {
    type: EventType.REFRAME_COMPLETED,
    data: { response: '测试社会结构回答' },
    target: 'REFRAME_MEDIA_ALGORITHM',
  },
  {
    type: EventType.REFRAME_COMPLETED,
    data: { response: '测试媒体算法回答' },
    target: 'REFRAME_COUNTER_FACT',
  },
  {
    type: EventType.REFRAME_COMPLETED,
    data: { response: '测试反例回答' },
    target: 'REFRAME_INDIVIDUAL_DIFFERENCE',
  },
  {
    type: EventType.REFRAME_COMPLETED,
    data: { response: '测试个体差异回答' },
    target: 'SECOND_RATING',
  },
  { type: EventType.RATING_SUBMITTED, data: { rating: 3 }, target: 'ACTION_INTENTION' },
  {
    type: EventType.ACTION_INTENTION_SUBMITTED,
    data: { response: '测试行动意愿' },
    target: 'COMPLETED',
  },
];

export function eventFor(
  state: ExperimentStateSnapshot,
  type: EventType,
  id = `event-${state.version}`,
) {
  return {
    id,
    type,
    experimentVersion: state.experimentVersion,
    expectedStateVersion: state.version,
  };
}

export function cognitiveAt(count: number, definition: ExperimentDefinition = cognitiveV1) {
  let state = createInitialState(definition);
  for (const step of cognitiveSteps.slice(0, count)) {
    const result = transition(state, eventFor(state, step.type), step.data, definition);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    state = result.newState;
  }
  return state;
}
