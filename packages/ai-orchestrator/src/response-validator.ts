import type { GenerationContext, ResponseValidation, ViolationCode } from './types.js';

export const normalizedReply = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[\p{P}\p{Z}\s]/gu, '')
    .toLowerCase();
const contains = (text: string, phrases: readonly string[]): boolean =>
  phrases.some((phrase) => normalizedReply(text).includes(normalizedReply(phrase)));

/** Deterministic textual guards, not a complete semantic safety guarantee. */
export function validateResponse(reply: unknown, context: GenerationContext): ResponseValidation {
  if (typeof reply !== 'string' || normalizedReply(reply).length === 0)
    return { valid: false, violations: ['EMPTY_REPLY'] };
  const violations: ViolationCode[] = [];
  if (reply.length > context.policy.maxReplyLength) violations.push('REPLY_TOO_LONG');
  if (context.recentReplyFingerprints.includes(normalizedReply(reply)))
    violations.push('REPEATED_REPLY');
  if (contains(reply, context.policy.forbiddenPurpose)) violations.push('PURPOSE_DISCLOSURE');
  if (
    contains(reply, context.policy.forbiddenJumps) ||
    context.disallowedStageIds.some((id) => reply.includes(id)) ||
    /["']?(?:stage|event)["']?\s*[:=]/i.test(reply)
  )
    violations.push('STAGE_JUMP');
  if (contains(reply, context.policy.forbiddenScenes)) violations.push('WRONG_SCENE');
  if (contains(reply, context.policy.forbiddenContent))
    violations.push('CURRENT_STAGE_RESTRICTION');
  if (context.memory.cognitive && context.policy.requiresConfirmedBelief) {
    const belief = context.memory.cognitive.confirmed_belief;
    if (!belief || !reply.includes(belief)) violations.push('BELIEF_ANCHOR_MISSING');
    if (contains(reply, ['把你的观点改为', '换一个观点', '你的观点现在是']))
      violations.push('BELIEF_REPLACEMENT');
  }
  return { valid: violations.length === 0, violations };
}
