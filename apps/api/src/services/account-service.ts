import { randomBytes } from 'node:crypto';
import type { UnitOfWork } from '../repositories/context.js';
import { admin, fail, object, passwordHash, text, uuid } from './common.js';
import type { AdminIdentity } from './common.js';
import { assignParticipant } from './experiment-service.js';
import { loginWorkbook } from './login-workbook.js';
import type { LoginRow } from './login-workbook.js';
export class AccountService {
  constructor(private readonly uow: UnitOfWork) {}
  async options(actor: AdminIdentity, experiment: string) {
    admin(actor);
    uuid(experiment);
    return this.uow.read((r) => r.participants.accountOptions(experiment));
  }
  async batch(actor: AdminIdentity, input: unknown) {
    admin(actor);
    const v = object(input, [
      'experiment_id',
      'condition_id',
      'count',
      'prefix',
      'start',
      'request_id',
    ]);
    const experiment = uuid(v.experiment_id),
      condition = uuid(v.condition_id),
      batch = uuid(v.request_id),
      prefix = text(v.prefix, 16);
    if (
      !/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(prefix) ||
      !Number.isInteger(v.count) ||
      Number(v.count) < 1 ||
      Number(v.count) > 100 ||
      !Number.isInteger(v.start) ||
      Number(v.start) < 1 ||
      Number(v.start) + Number(v.count) > 1000000
    )
      fail(400, 'INVALID_ACCOUNT_BATCH');
    return this.uow.transaction(async (r) => {
      await r.participants.reserveLoginBatch(batch);
      const option = (await r.participants.accountOptions(experiment)).find(
        (x) => x.id === condition,
      );
      if (!option) return fail(400, 'ASSIGNMENT_OPTIONS_MISMATCH');
      const rows: LoginRow[] = [];
      for (let i = 0; i < Number(v.count); i++) {
        const code = `${prefix}-${batch.replaceAll('-', '')}-${String(Number(v.start) + i).padStart(4, '0')}`;
        const password = randomBytes(24).toString('base64url');
        const p = await r.participants.create(experiment, code, passwordHash(password));
        await assignParticipant(r, actor, p.id, condition);
        rows.push({
          experiment_id: experiment,
          participant_code: code,
          initial_password: password,
          study_path: option.path,
          condition: option.code,
          agent: option.agent,
          model_batch: option.model_batch,
          batch_id: batch,
          created_at: new Date().toISOString(),
        });
      }
      await r.experiments.audit(experiment, actor.id, 'LOGIN_ACCOUNTS_CREATED', batch);
      return { batch_id: batch, workbook: loginWorkbook(rows) };
    });
  }
  async reset(actor: AdminIdentity, participant: string) {
    admin(actor);
    uuid(participant);
    return this.uow.transaction(async (r) => {
      const row = await r.participants.loginAccount(participant);
      if (!row) fail(404, 'NOT_FOUND');
      // Legacy fixed bootstrap accounts are reproducible from the existing operator page.
      // Changing their hashes would break its unchanged seed-integrity check at restart.
      if (/^B\d{3,6}-P\d{4}$/.test(row!.participant_code)) fail(409, 'FIXED_BOOTSTRAP_ACCOUNT');
      const password = randomBytes(24).toString('base64url');
      await r.participants.resetPassword(participant, passwordHash(password));
      await r.experiments.audit(row!.experiment_id, actor.id, 'LOGIN_PASSWORD_RESET', participant);
      return loginWorkbook([
        {
          ...row!,
          initial_password: password,
          batch_id: 'reset-' + randomBytes(12).toString('hex'),
        },
      ]);
    });
  }
}
