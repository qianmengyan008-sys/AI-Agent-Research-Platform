import { cognitiveV1, createInitialState, transition, EventType } from '../src/index.js';
import type { Scalar, StateTransitionEvent } from '../src/index.js';

// Synthetic answers and ratings illustrate structure, not a validated study protocol.
const steps: readonly [EventType, Record<string, Scalar>][] = [
  [EventType.EXPERIMENT_STARTED, {}],
  [EventType.STEREOTYPE_SUBMITTED, { response: '示例观点：仅用于验证数据结构。' }],
  [EventType.VIEWPOINT_CONFIRMED, { viewpoint: '示例观点：仅用于验证数据结构。', confirmed: true }],
  [EventType.RATING_SUBMITTED, { rating: 5 }],
  [EventType.REFRAME_COMPLETED, { response: '社会结构阶段的示例回答。' }],
  [EventType.REFRAME_COMPLETED, { response: '媒体算法阶段的示例回答。' }],
  [EventType.REFRAME_COMPLETED, { response: '反例阶段的示例回答。' }],
  [EventType.REFRAME_COMPLETED, { response: '个体差异阶段的示例回答。' }],
  [EventType.RATING_SUBMITTED, { rating: 3 }],
  [EventType.ACTION_INTENTION_SUBMITTED, { response: '行动意愿的示例回答。' }],
];

let state = createInitialState(cognitiveV1);
const trace: StateTransitionEvent[] = [];
for (const [type, data] of steps) {
  const event = {
    id: `demo-${state.version + 1}`,
    type,
    experimentVersion: state.experimentVersion,
    expectedStateVersion: state.version,
  };
  const result = transition(state, event, data, cognitiveV1);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  trace.push(...result.events);
  state = result.newState;
}
console.info(JSON.stringify({ trace, finalState: state }, null, 2));
