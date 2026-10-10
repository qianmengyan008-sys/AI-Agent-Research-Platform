import { describe, expect, it } from 'vitest';
import {
  cognitiveV1,
  emotionV1,
  dailyV1,
  createInitialState,
  transition,
  validateDefinition,
  EventType,
} from '../src/index.js';
import type { ExperimentDefinition } from '../src/index.js';
import { eventFor } from './fixtures.js';

describe('definition validation', () => {
  it.each([cognitiveV1, emotionV1, dailyV1])(
    'accepts $experimentVersion as an immutable structural definition',
    (definition) => {
      expect(validateDefinition(definition)).toEqual([]);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.stages)).toBe(true);
    },
  );

  const invalidDefinitions: unknown[] = [
    null,
    {},
    { ...dailyV1, path: 'unknown' },
    { ...dailyV1, experimentVersion: '' },
    { ...dailyV1, stages: [] },
    { ...dailyV1, stages: [{ id: 'only', fields: [] }] },
    { ...dailyV1, stages: [dailyV1.stages[0], dailyV1.stages[0], dailyV1.stages[2]] },
    { ...dailyV1, stages: [{ id: 'INIT', on: 'MODEL_ADVANCE', fields: [] }, dailyV1.stages[2]] },
    { ...dailyV1, stages: [{ id: 'INIT', fields: [] }, dailyV1.stages[2]] },
    {
      ...dailyV1,
      stages: [dailyV1.stages[0], { id: 'END', on: EventType.CHAT_FINISHED, fields: [] }],
    },
    {
      ...dailyV1,
      stages: [
        dailyV1.stages[0],
        { id: 'END', fields: [{ field: 'x', variable: 'x', type: 'text' }] },
      ],
    },
    { ...dailyV1, prompt: 'entire experiment' },
    {
      ...dailyV1,
      stages: [
        { id: 'INIT', on: EventType.EXPERIMENT_STARTED, fields: [], execute: () => 'COMPLETED' },
        dailyV1.stages[2],
      ],
    },
    ...[
      { field: 'response', variable: '__proto__', type: 'text' },
      { field: 'constructor', variable: 'answer', type: 'text' },
      { field: 'response', variable: 'answer', type: 'code' },
      { field: 'response', variable: 'answer', type: 'text', maxLength: 0 },
      { field: 'response', variable: 'answer', type: 'text', maxLength: '100' },
      { field: 'rating', variable: 'rating', type: 'number', min: 8, max: 1 },
      { field: 'rating', variable: 'rating', type: 'number', min: NaN },
      { field: 'rating', variable: 'rating', type: 'number', max: Infinity },
      { field: 'confirmed', variable: 'confirmed', type: 'confirmation', execute: 'code' },
    ].map((rule) => ({
      ...dailyV1,
      stages: [{ id: 'INIT', on: EventType.EXPERIMENT_STARTED, fields: [rule] }, dailyV1.stages[2]],
    })),
    {
      ...dailyV1,
      stages: [
        {
          id: 'INIT',
          on: EventType.EXPERIMENT_STARTED,
          fields: [
            { field: 'a', variable: 'same', type: 'text' },
            { field: 'b', variable: 'same', type: 'text' },
          ],
        },
        dailyV1.stages[2],
      ],
    },
    {
      ...dailyV1,
      stages: [
        {
          id: 'INIT',
          on: EventType.EXPERIMENT_STARTED,
          fields: [
            { field: 'same', variable: 'a', type: 'text' },
            { field: 'same', variable: 'b', type: 'text' },
          ],
        },
        dailyV1.stages[2],
      ],
    },
  ];

  it.each(invalidDefinitions.map((definition, index) => ({ definition, index })))(
    'rejects malformed definition $index without transitioning',
    ({ definition }) => {
      expect(validateDefinition(definition).length).toBeGreaterThan(0);
      expect(() => createInitialState(definition as ExperimentDefinition)).toThrow();
      const state = createInitialState(dailyV1);
      const result = transition(
        state,
        eventFor(state, EventType.EXPERIMENT_STARTED),
        {},
        definition as ExperimentDefinition,
      );
      expect(result.ok).toBe(false);
      expect(result.newState).toBe(state);
      expect(result.errors[0]?.code).toBe('INVALID_DEFINITION');
    },
  );
});
