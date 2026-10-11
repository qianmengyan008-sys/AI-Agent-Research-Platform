import { randomBytes } from 'node:crypto';
import { transition } from '@research/experiment-core';
import type { Scalar } from '@research/experiment-core';
import { UnitOfWork } from '../repositories/context.js';
import type { Bundle } from '../repositories/state-repository.js';
import { admin, fail, hash, object, passwordHash, text, uuid, verifyPassword } from './common.js';
import type { AdminIdentity, ParticipantIdentity } from './common.js';
import { recover } from './recovery.js';
import { researchVariables } from './research-variables.js';
export function projection(b: Bundle) {
  const stage = b.definition.stages.find((s) => s.id === b.snapshot.stage)!;
  return {
    state_token: b.state_token,
    status: b.status === 'completed' ? 'finished' : 'awaiting_input',
    form:
      b.status === 'open'
        ? { id: b.state_token, fields: stage.fields.map((f) => ({ name: f.field, kind: f.type })) }
        : null,
  };
}
export class ParticipantService {
  private readonly dummy = passwordHash('SYNTHETIC_UNKNOWN_ACCOUNT');
  private readonly failures = new Map<string, { count: number; until: number }>();
  constructor(private readonly uow: UnitOfWork) {}
  async create(actor: AdminIdentity, input: unknown) {
    admin(actor);
    const v = object(input, ['experiment_id', 'participant_code', 'password']);
    const experiment = uuid(v.experiment_id);
    const encoded = passwordHash(text(v.password, 256));
    return this.uow.transaction(async (r) => {
      const p = await r.participants.create(experiment, text(v.participant_code, 80), encoded);
      await r.experiments.audit(
        experiment,
        actor.id,
        'PARTICIPANT_CREATED',
        'Create research account',
      );
      return { participantId: p.id };
    });
  }
  async login(input: unknown) {
    const v = object(input, ['experiment_id', 'participant_code', 'password']);
    const experiment = uuid(v.experiment_id),
      code = text(v.participant_code, 80),
      password = text(v.password, 256);
    const key = hash([experiment, code]);
    const previous = this.failures.get(key);
    if (previous && previous.until > Date.now() && previous.count >= 10) fail(429, 'LOGIN_LIMIT');
    const p = await this.uow.read((r) => r.participants.credentials(experiment, code));
    const valid = verifyPassword(password, p?.password_hash ?? this.dummy);
    if (!p || p.status !== 'enabled' || !valid) {
      if (this.failures.size > 10000) this.failures.clear();
      this.failures.set(key, {
        count: previous && previous.until > Date.now() ? previous.count + 1 : 1,
        until: Date.now() + 60000,
      });
      fail(401, 'INVALID_CREDENTIALS');
    }
    this.failures.delete(key);
    const token = randomBytes(32).toString('hex');
    await this.uow.transaction((r) =>
      r.participants.session(p!.id, hash(token), new Date(Date.now() + 8 * 60 * 60 * 1000)),
    );
    return { token, expires_in: 28800 };
  }
  async authenticate(token: string): Promise<ParticipantIdentity> {
    if (!/^[a-f0-9]{64}$/.test(token)) fail(401, 'UNAUTHORIZED');
    const p = await this.uow.read((r) => r.participants.authenticate(hash(token)));
    if (!p) fail(401, 'UNAUTHORIZED');
    return { participantId: p!.id };
  }
  async logout(token: string) {
    await this.uow.transaction((r) => r.participants.logout(hash(token)));
    return { logged_out: true };
  }
  async current(actor: ParticipantIdentity) {
    return this.uow.transaction(async (r) => {
      const b = await r.states.load(actor.participantId, true);
      if (!b) fail(404, 'NOT_ASSIGNED');
      await recover(r, b!.session_id);
      const pending = await r.conversations.active(b!.session_id);
      return {
        instructions: b!.configuration.instructions,
        agent: { name: b!.agent.name },
        ...projection(b!),
        ...(pending ? { status: 'generating', pending_turn_id: pending.id } : {}),
      };
    });
  }
  async submit(actor: ParticipantIdentity, input: unknown) {
    const v = object(input, ['state_token', 'request_id', 'data']);
    const token = uuid(v.state_token),
      id = text(v.request_id, 128);
    if (!v.data || typeof v.data !== 'object' || Array.isArray(v.data)) fail(400, 'INVALID_INPUT');
    const checksum = hash(v);
    return this.uow.transaction(async (r) => {
      const b = await r.states.load(actor.participantId, true);
      if (!b) fail(404, 'NOT_ASSIGNED');
      const prior = await r.states.receipt(b!.session_id, id);
      if (prior) {
        if (prior.request_hash !== checksum) fail(409, 'IDEMPOTENCY_CONFLICT');
        return prior.response;
      }
      if (b!.status !== 'open') fail(409, 'EXPERIMENT_FINISHED');
      if (b!.state_token !== token) fail(409, 'STATE_CONFLICT');
      await recover(r, b!.session_id);
      if (await r.states.pending(b!.session_id)) fail(409, 'GENERATION_PENDING');
      const stage = b!.definition.stages.find((s) => s.id === b!.snapshot.stage)!;
      const supportsSource = b!.snapshot.path === 'cognitive' && stage.id === 'STEREOTYPE_CAPTURE';
      const submitted = object(v.data, [
        ...stage.fields.map((f) => f.field),
        ...(supportsSource ? ['source'] : []),
      ]);
      const source = submitted.source === undefined ? undefined : text(submitted.source, 10000);
      const data = Object.fromEntries(
        Object.entries(submitted).filter(([key]) => key !== 'source'),
      ) as Record<string, Scalar>;
      const result = transition(
        b!.snapshot,
        {
          id,
          type: stage.on!,
          experimentVersion: b!.snapshot.experimentVersion,
          expectedStateVersion: b!.snapshot.version,
        },
        data,
        b!.definition,
      );
      if (!result.ok) fail(400, 'INVALID_SUBMISSION');
      await r.states.save(
        b!.session_id,
        result,
        actor.participantId,
        submitted,
        'participant',
        researchVariables(result, source),
      );
      const updated = await r.states.load(actor.participantId);
      const response = projection(updated!);
      await r.states.storeReceipt(b!.session_id, id, checksum, response);
      return response;
    });
  }
}
