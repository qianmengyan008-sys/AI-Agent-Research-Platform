import { transition } from '@research/experiment-core';
import type { Repositories } from '../repositories/context.js';
import type { Bundle } from '../repositories/state-repository.js';
import { fail } from './common.js';
import { limits, turnStages } from './research-profile.js';
import { researchVariables } from './research-variables.js';

/** Chat is a delivery protocol over the existing frozen definition, never a second state machine. */
export function chatProjection(b: Bundle) {
  return {
    study_path: b.snapshot.path,
    interaction: 'chat' as const,
    ...(b.snapshot.stage === 'VIEWPOINT_CONFIRMATION'
      ? { confirmation_card: { belief: String(b.snapshot.variables.stereotype_text ?? '') } }
      : {}),
  };
}
export async function stageNotice(r: Repositories, b: Bundle) {
  if (!(await r.conversations.chatStarted(b.session_id))) return;
  const stage = b.snapshot.stage,
    config = b.configuration.research_config;
  if (['VIEWPOINT_CONFIRMATION', 'INITIAL_RATING', 'SECOND_RATING'].includes(stage)) return;
  let text: string | undefined;
  if (b.status === 'completed') text = '本次实验已完成，谢谢参与。';
  else if (b.snapshot.path === 'emotional' || b.snapshot.path === 'daily') return;
  else if (b.snapshot.path === 'cognitive' && config) {
    const captureCount =
      stage === 'STEREOTYPE_CAPTURE'
        ? await r.conversations.turnCounts(b.session_id, [stage])
        : null;
    text = b.policies[stage]?.fallbackReplies[captureCount?.effective === 1 ? 1 : 0]?.replaceAll(
      '{{confirmed_belief}}',
      String(b.snapshot.variables.confirmed_viewpoint ?? ''),
    );
  } else if (b.snapshot.version === 1) text = b.configuration.instructions;
  if (text)
    await r.conversations.notice(
      b.session_id,
      `task-${b.snapshot.version}`,
      text,
      100 + b.snapshot.version * 10,
    );
}
export async function completedCard(
  r: Repositories,
  b: Bundle,
  id: string,
  data: Record<string, unknown>,
) {
  const rating = ['INITIAL_RATING', 'SECOND_RATING'].includes(b.snapshot.stage);
  const confirmation = b.snapshot.stage === 'VIEWPOINT_CONFIRMATION';
  if (!rating && !confirmation) return;
  const belief = String(
    confirmation ? b.snapshot.variables.stereotype_text : b.snapshot.variables.confirmed_viewpoint,
  );
  const label = confirmation
    ? '观点已确认'
    : b.snapshot.stage === 'INITIAL_RATING'
      ? '初次评分已提交'
      : '二次评分已提交';
  const value = confirmation ? true : Number(data.rating);
  await r.conversations.notice(b.session_id, `card-${id}`, label, 50 + b.snapshot.version * 10, {
    label,
    value,
    belief,
  });
}
export async function advanceChat(
  r: Repositories,
  b: Bundle,
  turn: string,
  participant: string,
  content: string,
) {
  const stage = b.definition.stages.find((s) => s.id === b.snapshot.stage)!;
  if (!stage.fields.some((f) => f.field === 'response')) return; // no synthetic confirmations, ratings or daily finish
  const config = b.configuration.research_config;
  const count = await r.conversations.turnCounts(b.session_id, config ? turnStages(b) : [stage.id]);
  const min = config
    ? stage.id === 'STEREOTYPE_CAPTURE'
      ? config.cognitive.turns.capture_confirmation![0]!
      : limits(b).min
    : 1;
  if (count.effective < min) {
    if (stage.id === 'STEREOTYPE_CAPTURE' && config && count.effective === 1)
      await r.conversations.notice(
        b.session_id,
        `source-${b.snapshot.version}`,
        b.policies[stage.id]!.fallbackReplies[1]!,
        100 + b.snapshot.version * 10 + 1,
      );
    return;
  }
  const answers = await r.conversations.stageAnswers(b.session_id, stage.id);
  // Capture uses the participant's exact first belief; later capture messages record source without guessing.
  const combined = answers.join('\n') || content;
  const field = stage.fields.find((f) => f.field === 'response');
  const max = field?.type === 'text' ? (field.maxLength ?? Infinity) : Infinity;
  // All original answers remain in message rows. Never clip an answer or exceed the frozen field contract.
  const responseScope = combined.length > max ? 'last_complete_answer' : 'all_complete_answers';
  const data = {
    response:
      stage.id === 'STEREOTYPE_CAPTURE' ? answers[0]! : combined.length > max ? content : combined,
  };
  const source =
    stage.id === 'STEREOTYPE_CAPTURE' ? answers.slice(1).join('\n') || undefined : undefined;
  const moved = transition(
    b.snapshot,
    {
      id: `chat-turn-${turn}`,
      type: stage.on!,
      experimentVersion: b.snapshot.experimentVersion,
      expectedStateVersion: b.snapshot.version,
    },
    data,
    b.definition,
  );
  if (!moved.ok) fail(409, 'INVALID_AUTOMATIC_TRANSITION');
  await r.states.save(
    b.session_id,
    moved,
    participant,
    {
      ...data,
      ...(source ? { source } : {}),
      source_turn_id: turn,
      reason: 'participant_chat_task_completed',
      response_scope: responseScope,
      response_source_count: answers.length,
    },
    'participant',
    researchVariables(moved, source, config),
  );
}
