import { createInitialState, transition } from '@research/experiment-core';
import type { ExperimentDefinition, Scalar } from '@research/experiment-core';

/** Backend state-machine simulation for synthetic examples/tests only. */
export function demoState(definition: ExperimentDefinition, target: string) {
  let state = createInitialState(definition);
  while (state.stage !== target) {
    const stage = definition.stages[state.version];
    if (!stage?.on) throw new Error('Unknown example target');
    const data: Record<string, Scalar> = {};
    for (const field of stage.fields) {
      data[field.field] =
        field.type === 'confirmation'
          ? true
          : field.type === 'number'
            ? 5
            : field.field === 'viewpoint'
              ? '已确认观点示例'
              : state.stage === 'STEREOTYPE_CAPTURE'
                ? '原始表达示例'
                : `合成回答：${state.stage}`;
    }
    const result = transition(
      state,
      {
        id: `demo-${state.version}`,
        type: stage.on,
        experimentVersion: state.experimentVersion,
        expectedStateVersion: state.version,
      },
      data,
      definition,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    state = result.newState;
  }
  return state;
}
