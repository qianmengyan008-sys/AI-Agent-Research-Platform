import type { ResearchConfig } from './research-profile.js';
import type { TransitionResult, VariableChange } from '@research/experiment-core';

/** Persist research names alongside unchanged v1 core variables, never from generated text. */
export function researchVariables(
  result: TransitionResult,
  source?: string,
  profile?: ResearchConfig,
): VariableChange[] {
  if (!result.ok) return [];
  const aliases: Record<string, string> = {
    stereotype_text: 'raw_expression',
    confirmed_viewpoint: 'confirmed_belief',
    initial_rating: 'rating_1',
    second_rating: 'rating_2',
    persona_snapshot: 'character_profile',
    relationship_response: 'relationship_state',
  };
  const values = result.variables.flatMap((v) =>
    aliases[v.key] ? [{ ...v, key: aliases[v.key]! }] : [],
  );
  const event = result.events[0];
  if (!event) return values;
  const base = {
    sourceEventId: event.eventId,
    experimentVersion: event.experimentVersion,
    stage: event.fromStage,
  };
  if (source !== undefined) values.push({ ...base, key: 'source', value: source });
  if (result.newState.path === 'emotional') {
    values.push({ ...base, key: 'scene_phase', value: event.toStage });
    const scene = result.variables.find((v) =>
      [
        'first_contact_response',
        'misunderstanding_response',
        'resolution_response',
        'shared_experience_response',
      ].includes(v.key),
    );
    if (scene) values.push({ ...scene, key: 'scene_state' });
  }
  if (profile && result.newState.path === 'emotional') {
    for (const value of values) {
      if (value.key === 'scene_state')
        value.value = profile.emotional.scenes[event.toStage]?.place ?? event.toStage;
      if (value.key === 'character_profile')
        value.value =
          Object.entries(profile.emotional.characters)
            .map(([name, identity]) => name + '：' + identity)
            .join('；') +
          '。参与者补充（仅外貌/兴趣/性格）：' +
          String(value.value);
    }
  }
  return values;
}
