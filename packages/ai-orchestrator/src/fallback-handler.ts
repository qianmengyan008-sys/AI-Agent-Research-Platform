import { validateResponse } from './response-validator.js';
import type { GenerationContext } from './types.js';

/** Local recovery after bounded regeneration; every template passes the same validator. */
export function fallbackReply(context: GenerationContext): string | null {
  for (const template of context.policy.fallbackReplies) {
    const reply = template.replaceAll(
      '{{confirmed_belief}}',
      context.memory.cognitive?.confirmed_belief ?? '',
    );
    if (validateResponse(reply, context).valid) return reply;
  }
  return null;
}
