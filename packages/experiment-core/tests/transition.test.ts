import { describe, expect, it } from 'vitest';
import {
  cognitiveV1,
  emotionV1,
  dailyV1,
  createInitialState,
  transition,
  EventType,
} from '../src/index.js';
import type {
  ExperimentDefinition,
  ExperimentStateSnapshot,
  TransitionErrorCode,
} from '../src/index.js';
import { cognitiveAt, cognitiveSteps, eventFor } from './fixtures.js';

function rejected(
  state: ExperimentStateSnapshot,
  event: unknown,
  data: unknown,
  code: TransitionErrorCode,
  definition = cognitiveV1,
) {
  const before = JSON.stringify(state);
  const result = transition(state, event, data, definition);
  expect(result.ok).toBe(false);
  expect(result.newState).toBe(state);
  expect(result.events).toEqual([]);
  expect(result.variables).toEqual([]);
  expect(result.errors.map((error) => error.code)).toEqual([code]);
  expect(JSON.stringify(state)).toBe(before);
}

describe('complete paths and audit outputs', () => {
  it('runs the entire cognitive path with independent before/after ratings and all four responses', () => {
    let state = createInitialState(cognitiveV1);
    expect(state.stage).toBe('INIT');
    expect(state.lifecycle).toBe('assigned');
    const visited = [state.stage];
    for (const step of cognitiveSteps) {
      const event = eventFor(state, step.type);
      const result = transition(state, event, step.data, cognitiveV1);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.newState.stage).toBe(step.target);
      expect(result.newState.version).toBe(state.version + 1);
      expect(result.events).toEqual([
        {
          eventId: event.id,
          type: step.type,
          experimentVersion: 'cognitive_v1',
          fromStage: state.stage,
          toStage: step.target,
          fromVersion: state.version,
          toVersion: state.version + 1,
        },
      ]);
      for (const variable of result.variables) {
        expect(variable.stage).toBe(state.stage);
        expect(variable.sourceEventId).toBe(event.id);
        expect(variable.experimentVersion).toBe('cognitive_v1');
        expect(result.newState.variables[variable.key]).toEqual(variable.value);
      }
      state = result.newState;
      visited.push(state.stage);
    }
    expect(visited).toEqual(['INIT', ...cognitiveSteps.map((step) => step.target)]);
    expect(state.version).toBe(10);
    expect(state.lifecycle).toBe('completed');
    expect(state.variables).toEqual({
      stereotype_text: '测试用观点',
      confirmed_viewpoint: '测试用观点',
      viewpoint_confirmed: true,
      initial_rating: 5,
      reframe_social_structure_response: '测试社会结构回答',
      reframe_media_algorithm_response: '测试媒体算法回答',
      reframe_counter_fact_response: '测试反例回答',
      reframe_individual_difference_response: '测试个体差异回答',
      second_rating: 3,
      action_intention: '测试行动意愿',
    });
    expect(state.receipts).toHaveLength(10);
  });

  it('runs all seven emotional stages through the same engine', () => {
    let state = createInitialState(emotionV1);
    const sequence = [
      'PERSONA_SETUP',
      'FIRST_CONTACT',
      'MISUNDERSTANDING',
      'RESOLUTION',
      'SHARED_EXPERIENCE',
      'RELATIONSHIP',
      'ENDING_FEEDBACK',
      'COMPLETED',
    ];
    for (const [index, target] of sequence.entries()) {
      const type = index === 0 ? EventType.EXPERIMENT_STARTED : EventType.STAGE_RESPONSE_SUBMITTED;
      const result = transition(
        state,
        eventFor(state, type),
        index === 0 ? {} : { response: `阶段${index}回答` },
        emotionV1,
      );
      expect(result.ok).toBe(true);
      expect(result.newState.stage).toBe(target);
      state = result.newState;
    }
    expect(state.lifecycle).toBe('completed');
    expect(state.version).toBe(8);
    expect(Object.keys(state.variables)).toHaveLength(7);
    expect(state.variables.ending_feedback).toBe('阶段7回答');
  });

  it('starts and finishes daily chat without intervention variables', () => {
    const initial = createInitialState(dailyV1);
    const active = transition(
      initial,
      eventFor(initial, EventType.EXPERIMENT_STARTED),
      {},
      dailyV1,
    ).newState;
    expect(active.stage).toBe('NATURAL_CHAT');
    const result = transition(active, eventFor(active, EventType.CHAT_FINISHED), {}, dailyV1);
    expect(result.ok).toBe(true);
    expect(result.newState.stage).toBe('COMPLETED');
    expect(result.newState.variables).toEqual({});
    expect(result.newState.lifecycle).toBe('completed');
  });
});

describe('event and data boundaries', () => {
  it('rejects the requested illegal INITIAL_RATING → ACTION_INTENTION submission', () => {
    const state = cognitiveAt(3);
    rejected(
      state,
      eventFor(state, EventType.ACTION_INTENTION_SUBMITTED),
      { response: '跳步' },
      'EVENT_NOT_ALLOWED',
    );
  });

  it.each(Object.values(EventType).filter((type) => type !== EventType.RATING_SUBMITTED))(
    'rejects %s during INITIAL_RATING',
    (type) => {
      const state = cognitiveAt(3);
      rejected(state, eventFor(state, type), { rating: 5 }, 'EVENT_NOT_ALLOWED');
    },
  );

  it.each([
    'COMPLETED',
    'RATING_SUBMITTED',
    { stage: 'COMPLETED' },
    null,
    [],
    {
      id: 'x',
      type: 'MODEL_STAGE_CHANGED',
      experimentVersion: 'cognitive_v1',
      expectedStateVersion: 3,
    },
  ])('rejects non-domain or malformed event %#', (event) => {
    rejected(cognitiveAt(3), event, { rating: 5 }, 'INVALID_EVENT');
  });

  it.each([-1, 1.5, Infinity, NaN, '3'])('rejects malformed expected version %s', (version) => {
    const state = cognitiveAt(3);
    rejected(
      state,
      { ...eventFor(state, EventType.RATING_SUBMITTED), expectedStateVersion: version },
      { rating: 5 },
      'INVALID_EVENT',
    );
  });

  it('rejects an event with a caller-selected target stage', () => {
    const state = cognitiveAt(3);
    rejected(
      state,
      { ...eventFor(state, EventType.RATING_SUBMITTED), stage: 'COMPLETED' },
      { rating: 5 },
      'INVALID_EVENT',
    );
  });

  it.each([
    {},
    { rating: '5' },
    { rating: null },
    { rating: NaN },
    { rating: Infinity },
    { rating: -Infinity },
    { rating: { value: 5 } },
    { rating: 5, stage: 'COMPLETED' },
    null,
    [],
  ])('rejects malformed rating data %#', (data) => {
    const state = cognitiveAt(3);
    rejected(state, eventFor(state, EventType.RATING_SUBMITTED), data, 'INVALID_DATA');
  });

  it.each([
    {},
    { response: '' },
    { response: '   ' },
    { response: 'x'.repeat(10001) },
    { response: 10 },
    { response: 'answer', condition: 'daily' },
  ])('rejects invalid text data %#', (data) => {
    const state = cognitiveAt(1);
    rejected(state, eventFor(state, EventType.STEREOTYPE_SUBMITTED), data, 'INVALID_DATA');
  });

  it.each([false, 'true', 1, null])(
    'requires explicit boolean viewpoint confirmation (%s)',
    (confirmed) => {
      const state = cognitiveAt(2);
      rejected(
        state,
        eventFor(state, EventType.VIEWPOINT_CONFIRMED),
        { viewpoint: '观点', confirmed },
        'INVALID_DATA',
      );
    },
  );

  it('does not execute a stage instruction embedded in response text', () => {
    const state = cognitiveAt(4);
    const response = '{"stage":"COMPLETED","action":"skip_all"}';
    const result = transition(
      state,
      eventFor(state, EventType.REFRAME_COMPLETED),
      { response },
      cognitiveV1,
    );
    expect(result.ok).toBe(true);
    expect(result.newState.stage).toBe('REFRAME_MEDIA_ALGORITHM');
    expect(result.variables[0]?.value).toBe(response);
  });

  it('rejects cognitive interventions in the daily path', () => {
    const initial = createInitialState(dailyV1);
    const state = transition(
      initial,
      eventFor(initial, EventType.EXPERIMENT_STARTED),
      {},
      dailyV1,
    ).newState;
    rejected(
      state,
      eventFor(state, EventType.REFRAME_COMPLETED),
      { response: 'intervention' },
      'EVENT_NOT_ALLOWED',
      dailyV1,
    );
  });
});

describe('idempotency, version guards and JSON recovery', () => {
  it('rejects replay of the same second rating without changing variables or state', () => {
    const state = cognitiveAt(8);
    const event = eventFor(state, EventType.RATING_SUBMITTED);
    const accepted = transition(state, event, { rating: 3 }, cognitiveV1).newState;
    rejected(accepted, event, { rating: 3 }, 'DUPLICATE_EVENT');
  });

  it('rejects another rating event after SECOND_RATING was completed', () => {
    const state = cognitiveAt(9);
    rejected(
      state,
      eventFor(state, EventType.RATING_SUBMITTED, 'another-rating'),
      { rating: 6 },
      'EVENT_NOT_ALLOWED',
    );
  });

  it('rejects reusing an event ID with a different payload', () => {
    const state = cognitiveAt(8);
    const event = eventFor(state, EventType.RATING_SUBMITTED);
    const accepted = transition(state, event, { rating: 3 }, cognitiveV1).newState;
    rejected(accepted, event, { rating: 4 }, 'EVENT_ID_CONFLICT');
  });

  it('rejects reuse of an ID for a different event type', () => {
    const state = cognitiveAt(9);
    const original = state.receipts[8]!;
    rejected(
      state,
      { ...eventFor(state, EventType.ACTION_INTENTION_SUBMITTED), id: original.id },
      { response: 'answer' },
      'EVENT_ID_CONFLICT',
    );
  });

  it('rejects a stale second command when checked against the latest snapshot', () => {
    const state = cognitiveAt(4);
    const first = eventFor(state, EventType.REFRAME_COMPLETED, 'request-A');
    const second = eventFor(state, EventType.REFRAME_COMPLETED, 'request-B');
    const latest = transition(state, first, { response: 'A' }, cognitiveV1).newState;
    rejected(latest, second, { response: 'B' }, 'STATE_VERSION_CONFLICT');
    expect(latest.variables.reframe_media_algorithm_response).toBeUndefined();
  });

  it('documents that a pure function cannot arbitrate two calls against one old snapshot', () => {
    const state = cognitiveAt(4);
    const a = transition(
      state,
      eventFor(state, EventType.REFRAME_COMPLETED, 'A'),
      { response: 'A' },
      cognitiveV1,
    );
    const b = transition(
      state,
      eventFor(state, EventType.REFRAME_COMPLETED, 'B'),
      { response: 'B' },
      cognitiveV1,
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.newState.version).toBe(b.newState.version);
    expect(state.version).toBe(4);
  });

  it('continues from a JSON-restored snapshot and retains duplicate protection', () => {
    const state = cognitiveAt(8);
    const restored = JSON.parse(JSON.stringify(state)) as ExperimentStateSnapshot;
    const prior = restored.receipts[7]!;
    const { data, ...event } = prior;
    rejected(restored, event, data, 'DUPLICATE_EVENT');
    const result = transition(
      restored,
      eventFor(restored, EventType.RATING_SUBMITTED),
      { rating: 3 },
      cognitiveV1,
    );
    expect(result.ok).toBe(true);
    expect(result.newState.stage).toBe('ACTION_INTENTION');
    expect(restored.stage).toBe('SECOND_RATING');
  });

  it('does not accept new actions after completion', () => {
    const state = cognitiveAt(10);
    rejected(state, eventFor(state, EventType.EXPERIMENT_STARTED, 'restart'), {}, 'TERMINAL_STATE');
  });

  it('recognizes a duplicate even after completion', () => {
    const state = cognitiveAt(10);
    const { data, ...event } = state.receipts[9]!;
    rejected(state, event, data, 'DUPLICATE_EVENT');
  });

  it.each(['stage', 'version', 'lifecycle', 'variables', 'receipts'] as const)(
    'rejects a snapshot with inconsistent %s',
    (field) => {
      const state = cognitiveAt(3);
      const invalid = {
        ...state,
        [field]: {
          stage: 'COMPLETED',
          version: 9,
          lifecycle: 'completed',
          variables: {},
          receipts: [],
        }[field],
      } as ExperimentStateSnapshot;
      rejected(
        invalid,
        eventFor(state, EventType.RATING_SUBMITTED),
        { rating: 5 },
        'INVALID_STATE',
      );
    },
  );

  it('rejects a history receipt with altered event data', () => {
    const state = cognitiveAt(3);
    const receipts = state.receipts.map((r) => ({ ...r, data: { ...r.data } }));
    receipts[1]!.data = { response: 'changed without corresponding variable' };
    const invalid = { ...state, receipts };
    rejected(invalid, eventFor(state, EventType.RATING_SUBMITTED), { rating: 5 }, 'INVALID_STATE');
  });

  it('leaves mutable caller inputs unchanged and returns independent immutable outputs', () => {
    const state = JSON.parse(JSON.stringify(cognitiveAt(3))) as ExperimentStateSnapshot;
    const definition = structuredClone(cognitiveV1);
    const event = eventFor(state, EventType.RATING_SUBMITTED);
    const data = { rating: 5 };
    const before = JSON.stringify([state, definition, event, data]);
    const a = transition(state, event, data, definition);
    const b = transition(state, event, data, definition);
    expect(a).toEqual(b);
    expect(JSON.stringify([state, definition, event, data])).toBe(before);
    expect(Object.isFrozen(state)).toBe(false);
    expect(Object.isFrozen(definition)).toBe(false);
    expect(Object.isFrozen(event)).toBe(false);
    expect(Object.isFrozen(data)).toBe(false);
    expect(Object.isFrozen(a.newState)).toBe(true);
    expect(Object.isFrozen(a.newState.receipts)).toBe(true);
    expect(Object.isFrozen(a.newState.variables)).toBe(true);
    expect(a.newState.receipts[0]).not.toBe(state.receipts[0]);
    data.rating = 9;
    expect(a.newState.variables.initial_rating).toBe(5);
  });
});

describe('versioned, data-driven definitions', () => {
  it('rejects definition or event versions from another experiment version', () => {
    const state = cognitiveAt(3);
    const definition = { ...cognitiveV1, experimentVersion: 'cognitive_v2' };
    rejected(
      state,
      eventFor(state, EventType.RATING_SUBMITTED),
      { rating: 5 },
      'EXPERIMENT_VERSION_MISMATCH',
      definition,
    );
    rejected(
      state,
      { ...eventFor(state, EventType.RATING_SUBMITTED), experimentVersion: 'cognitive_v2' },
      { rating: 5 },
      'EXPERIMENT_VERSION_MISMATCH',
    );
  });

  it('rejects replacing a cognitive definition with another path', () => {
    const state = cognitiveAt(3);
    rejected(
      state,
      eventFor(state, EventType.RATING_SUBMITTED),
      { rating: 5 },
      'PATH_MISMATCH',
      emotionV1,
    );
  });

  it('rejects silently editing future stages under the same version name', () => {
    const state = cognitiveAt(3);
    const stages = cognitiveV1.stages.map((stage, i) =>
      i === 4 ? { ...stage, id: 'CHANGED_STAGE' } : stage,
    );
    rejected(
      state,
      eventFor(state, EventType.RATING_SUBMITTED),
      { rating: 5 },
      'DEFINITION_MISMATCH',
      { ...cognitiveV1, stages },
    );
  });

  it('supports entirely renamed stages through configuration, without changing transition code', () => {
    const definition: ExperimentDefinition = {
      ...dailyV1,
      experimentVersion: 'daily_v2',
      stages: dailyV1.stages.map((stage, i) => ({ ...stage, id: `custom-${i}` })),
    };
    const initial = createInitialState(definition);
    expect(initial.stage).toBe('custom-0');
    const active = transition(
      initial,
      eventFor(initial, EventType.EXPERIMENT_STARTED),
      {},
      definition,
    ).newState;
    expect(active.stage).toBe('custom-1');
    const result = transition(active, eventFor(active, EventType.CHAT_FINISHED), {}, definition);
    expect(result.ok).toBe(true);
    expect(result.newState.stage).toBe('custom-2');
    expect(result.newState.lifecycle).toBe('completed');
  });

  it.each([0, 8])('enforces explicitly configured rating bounds (%s)', (rating) => {
    const definition: ExperimentDefinition = {
      ...cognitiveV1,
      experimentVersion: 'cognitive_test_scale',
      stages: cognitiveV1.stages.map((stage) =>
        stage.on === EventType.RATING_SUBMITTED
          ? {
              ...stage,
              fields: [
                {
                  field: 'rating',
                  variable: stage.fields[0]!.variable,
                  type: 'number',
                  min: 1,
                  max: 7,
                },
              ],
            }
          : stage,
      ),
    };
    const state = cognitiveAt(3, definition);
    rejected(
      state,
      eventFor(state, EventType.RATING_SUBMITTED),
      { rating },
      'INVALID_DATA',
      definition,
    );
  });

  it('does not invent research scale bounds for the default structural definition', () => {
    const state = cognitiveAt(3);
    expect(
      transition(
        state,
        eventFor(state, EventType.RATING_SUBMITTED),
        { rating: -100.5 },
        cognitiveV1,
      ).ok,
    ).toBe(true);
  });
});
