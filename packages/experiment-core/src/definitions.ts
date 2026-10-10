import { EventType } from './events.js';
import { freeze } from './immutable.js';
import type { ExperimentDefinition, StageDefinition } from './types.js';

const text = (id: string, on: EventType, variable: string): StageDefinition => ({
  id,
  on,
  fields: [{ field: 'response', variable, type: 'text', maxLength: 10000 }],
});
const initial: StageDefinition = { id: 'INIT', on: EventType.EXPERIMENT_STARTED, fields: [] };
const completed: StageDefinition = { id: 'COMPLETED', fields: [] };
const rating = (id: string, variable: string): StageDefinition => ({
  id,
  on: EventType.RATING_SUBMITTED,
  // Structural validation only. A research-approved scale is not yet configured.
  fields: [{ field: 'rating', variable, type: 'number' }],
});

export const cognitiveV1: ExperimentDefinition = freeze({
  path: 'cognitive',
  experimentVersion: 'cognitive_v1',
  stages: [
    initial,
    text('STEREOTYPE_CAPTURE', EventType.STEREOTYPE_SUBMITTED, 'stereotype_text'),
    {
      id: 'VIEWPOINT_CONFIRMATION',
      on: EventType.VIEWPOINT_CONFIRMED,
      fields: [
        { field: 'viewpoint', variable: 'confirmed_viewpoint', type: 'text', maxLength: 10000 },
        { field: 'confirmed', variable: 'viewpoint_confirmed', type: 'confirmation' },
      ],
    },
    rating('INITIAL_RATING', 'initial_rating'),
    text(
      'REFRAME_SOCIAL_STRUCTURE',
      EventType.REFRAME_COMPLETED,
      'reframe_social_structure_response',
    ),
    text(
      'REFRAME_MEDIA_ALGORITHM',
      EventType.REFRAME_COMPLETED,
      'reframe_media_algorithm_response',
    ),
    text('REFRAME_COUNTER_FACT', EventType.REFRAME_COMPLETED, 'reframe_counter_fact_response'),
    text(
      'REFRAME_INDIVIDUAL_DIFFERENCE',
      EventType.REFRAME_COMPLETED,
      'reframe_individual_difference_response',
    ),
    rating('SECOND_RATING', 'second_rating'),
    text('ACTION_INTENTION', EventType.ACTION_INTENTION_SUBMITTED, 'action_intention'),
    completed,
  ],
});
export const emotionV1: ExperimentDefinition = freeze({
  path: 'emotional',
  experimentVersion: 'emotion_v1',
  stages: [
    initial,
    text('PERSONA_SETUP', EventType.STAGE_RESPONSE_SUBMITTED, 'persona_snapshot'),
    text('FIRST_CONTACT', EventType.STAGE_RESPONSE_SUBMITTED, 'first_contact_response'),
    text('MISUNDERSTANDING', EventType.STAGE_RESPONSE_SUBMITTED, 'misunderstanding_response'),
    text('RESOLUTION', EventType.STAGE_RESPONSE_SUBMITTED, 'resolution_response'),
    text('SHARED_EXPERIENCE', EventType.STAGE_RESPONSE_SUBMITTED, 'shared_experience_response'),
    text('RELATIONSHIP', EventType.STAGE_RESPONSE_SUBMITTED, 'relationship_response'),
    text('ENDING_FEEDBACK', EventType.STAGE_RESPONSE_SUBMITTED, 'ending_feedback'),
    completed,
  ],
});
export const dailyV1: ExperimentDefinition = freeze({
  path: 'daily',
  experimentVersion: 'daily_v1',
  stages: [initial, { id: 'NATURAL_CHAT', on: EventType.CHAT_FINISHED, fields: [] }, completed],
});
export const experimentDefinitions = freeze({
  cognitive_v1: cognitiveV1,
  emotion_v1: emotionV1,
  daily_v1: dailyV1,
});
