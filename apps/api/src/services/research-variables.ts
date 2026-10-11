import type { TransitionResult, VariableChange } from '@research/experiment-core';

/** Persist research names alongside unchanged v1 core variables, never from generated text. */
export function researchVariables(result: TransitionResult, source?: string): VariableChange[] {
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
  return values;
}
