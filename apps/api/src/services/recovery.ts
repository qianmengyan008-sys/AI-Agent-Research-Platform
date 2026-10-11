import type { Repositories } from '../repositories/context.js';
export async function recover(r: Repositories, session: string) {
  for (const t of await r.conversations.expire(session)) {
    const c = t.generation_context;
    await r.conversations.log(
      t,
      c.experiment,
      c.promptId,
      c.promptVersion,
      c.model,
      null,
      0,
      'failed',
      'GENERATION_LEASE_EXPIRED',
    );
  }
}
