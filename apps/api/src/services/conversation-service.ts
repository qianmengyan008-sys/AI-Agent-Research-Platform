import { randomUUID } from 'node:crypto';
import { UnitOfWork } from '../repositories/context.js';
import type { Repositories } from '../repositories/context.js';
import type { Turn } from '../repositories/conversation-repository.js';
import { fail, hash, object, text, uuid } from './common.js';
import type { ParticipantIdentity } from './common.js';
import { recover } from './recovery.js';
import { ModelRunService } from './model-run-service.js';
async function publicTurn(r: Repositories, t: Turn) {
  const reply = await r.conversations.reply(t.id);
  return {
    turn_id: t.id,
    status: t.status,
    text: t.status === 'ready' ? (reply?.content ?? null) : null,
  };
}
export class ConversationService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly model: ModelRunService,
  ) {}
  async send(actor: ParticipantIdentity, input: unknown) {
    const v = object(input, ['text', 'request_id', 'state_token']);
    const content = text(v.text, 4000),
      request = text(v.request_id, 128),
      token = uuid(v.state_token);
    const checksum = hash(v);
    const prepared = await this.uow.transaction(async (r) => {
      const b = await r.states.load(actor.participantId, true);
      if (!b) fail(404, 'NOT_ASSIGNED');
      await recover(r, b!.session_id);
      const prior = await r.conversations.find(b!.session_id, request);
      if (prior) {
        if (prior.request_hash !== checksum) fail(409, 'IDEMPOTENCY_CONFLICT');
        return { existing: await publicTurn(r, prior) };
      }
      if (b!.status !== 'open') fail(409, 'EXPERIMENT_FINISHED');
      if (b!.state_token !== token) fail(409, 'STATE_CONFLICT');
      if (await r.states.pending(b!.session_id)) fail(409, 'GENERATION_PENDING');
      const policy = b!.policies[b!.snapshot.stage];
      const promptId = b!.prompt_ids[b!.snapshot.stage];
      if (!policy || !promptId) fail(409, 'MISSING_STAGE_POLICY');
      const context = {
        experiment: b!.experiment_id,
        promptId: promptId!,
        promptVersion: `stage-language-v3-${hash(policy)}`,
        model: b!.configuration.model,
        stage: b!.snapshot.stage,
      };
      const recent = await r.conversations.recent(
        b!.session_id,
        b!.snapshot.version,
        b!.snapshot.stage,
      );
      const turn = await r.conversations.create(
        b!.session_id,
        request,
        checksum,
        b!.snapshot.version,
        b!.chat_revision + 1,
        content,
        randomUUID(),
        context.model.timeout_ms * context.model.max_attempts + 30000,
        context,
      );
      return { bundle: b!, turn, policy: policy!, recent, context };
    });
    if ('existing' in prepared) return prepared.existing;
    const { bundle, turn, policy, recent, context } = prepared;
    const started = performance.now();
    let result: Awaited<ReturnType<ModelRunService['generate']>> | null = null;
    let error: string | null = null;
    try {
      result = await this.model.generate(
        {
          state: bundle.snapshot,
          definition: bundle.definition,
          policy,
          userInput: content,
          recentMessages: recent,
        },
        context.model,
      );
    } catch {
      error = 'MODEL_GENERATION_FAILED';
    }
    const latency = performance.now() - started;
    return this.uow.transaction(async (r) => {
      const current = await r.states.load(actor.participantId, true);
      if (current) await recover(r, current.session_id);
      const saved = await r.conversations.turn(actor.participantId, turn.id);
      const stale =
        !current ||
        !saved ||
        saved.status !== 'generating' ||
        saved.lease_token !== turn.lease_token ||
        current.status !== 'open' ||
        current.snapshot.version !== turn.accepted_core_version ||
        current.chat_revision !== turn.chat_revision;
      const generationFailure =
        !result ||
        (result.status !== 'generated' &&
          result.violations.some((v) =>
            ['GENERATOR_FAILURE', 'GENERATOR_TIMEOUT', 'GENERATOR_ABORTED'].includes(v),
          ));
      const failed = generationFailure || result?.status === 'blocked';
      if (generationFailure) error = 'MODEL_GENERATION_FAILED';
      const status = stale ? 'stale' : failed ? 'failed' : 'ready';
      // A stale worker never overwrites a result or an expired lease's state.
      if (!stale || saved?.status === 'generating')
        await r.conversations.finish(turn.id, status === 'ready' ? result!.text : null, status);
      await r.conversations.log(
        turn,
        context.experiment,
        context.promptId,
        context.promptVersion,
        context.model,
        result,
        latency,
        stale
          ? 'stale'
          : failed
            ? result?.status === 'blocked'
              ? 'blocked'
              : 'failed'
            : result!.status,
        error,
      );
      return publicTurn(r, {
        ...turn,
        status: stale && saved?.status !== 'generating' ? (saved?.status ?? 'stale') : status,
      });
    });
  }
  async status(actor: ParticipantIdentity, id: string) {
    uuid(id);
    return this.uow.transaction(async (r) => {
      const b = await r.states.load(actor.participantId, true);
      if (!b) fail(404, 'NOT_FOUND');
      await recover(r, b!.session_id);
      const t = await r.conversations.turn(actor.participantId, id);
      if (!t) fail(404, 'NOT_FOUND');
      return publicTurn(r, t!);
    });
  }
  async messages(actor: ParticipantIdentity) {
    return this.uow.read((r) => r.conversations.messages(actor.participantId));
  }
}
