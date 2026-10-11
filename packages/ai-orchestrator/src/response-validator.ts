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
  if (
    contains(reply, ['请继续完成评分', '接下来继续写故事', '请继续回答']) ||
    /(?:stage|event|transition|allowed_actions|scene_state|scene_phase)["']?\s*[:=]/i.test(reply) ||
    /(?:推进|切换|修改|触发|跳过).{0,8}(?:阶段|状态|事件)/u.test(reply) ||
    /<\/?(?:tool_call|function_call)>|```(?:json|javascript|typescript)/i.test(reply)
  )
    violations.push('CONTROL_INSTRUCTION');
  if (
    contains(reply, [
      '系统要求',
      '后台要求',
      '系统提示词',
      '状态机',
      'experiment_state',
      'experimentVersion',
      'stateVersion',
      'confirmed_belief',
      'allowed_actions',
      'scene_state',
      'scene_phase',
      '管理员配置',
      '开发者指令',
      '当前阶段',
      '下一阶段',
    ])
  )
    violations.push('BACKEND_DISCLOSURE');
  if (reply.length > context.policy.maxReplyLength) violations.push('REPLY_TOO_LONG');
  if (context.recentReplyFingerprints.includes(normalizedReply(reply)))
    violations.push('REPEATED_REPLY');
  if (reply.includes(context.stage)) violations.push('BACKEND_DISCLOSURE');
  if (contains(reply, context.policy.forbiddenPurpose)) violations.push('PURPOSE_DISCLOSURE');
  if (
    contains(reply, context.policy.forbiddenJumps) ||
    context.disallowedStageIds.some((id) => reply.includes(id)) ||
    /["']?(?:stage|event)["']?\s*[:=]/i.test(reply)
  )
    violations.push('STAGE_JUMP');
  if (
    contains(reply, context.policy.forbiddenScenes) ||
    (context.policy.scene &&
      /(?:创建|开启|切换|更换|跳到|转到).{0,8}(?:场景|散步|海滩|公园)|(?:去|来到).{0,5}(?:咖啡馆|海滩|公园)/u.test(
        reply,
      ))
  )
    violations.push('WRONG_SCENE');
  if (contains(reply, context.policy.forbiddenContent))
    violations.push('CURRENT_STAGE_RESTRICTION');
  if (context.memory.cognitive && context.policy.requiresConfirmedBelief) {
    const belief = context.memory.cognitive.confirmed_belief;
    if (!belief || !reply.includes(belief)) violations.push('BELIEF_ANCHOR_MISSING');
    const attributedClaims = [
      ...reply.matchAll(/你(?:认为|相信|认定)[：:“”「」\s]*([^。！？\n]+)/gu),
    ];
    if (attributedClaims.some((claim) => !belief || !claim[1]?.includes(belief)))
      violations.push('BELIEF_REPLACEMENT');
    if (
      contains(reply, [
        '把你的观点改为',
        '换一个观点',
        '你的观点现在是',
        '你真正想表达的是',
        '你其实认为',
        '你的真实意思是',
      ])
    )
      violations.push('BELIEF_REPLACEMENT');
  }
  return { valid: violations.length === 0, violations };
}
