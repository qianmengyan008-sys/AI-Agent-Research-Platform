import { UnitOfWork } from '../repositories/context.js';
import { admin, uuid } from './common.js';
import type { AdminIdentity } from './common.js';
export class AdminService {
  constructor(private readonly uow: UnitOfWork) {}
  async experiments(actor: AdminIdentity) {
    admin(actor);
    return this.uow.read((r) => r.experiments.list());
  }
  async participants(actor: AdminIdentity, experiment: string) {
    admin(actor);
    uuid(experiment);
    return this.uow.read((r) => r.participants.list(experiment));
  }
  async conversations(actor: AdminIdentity, experiment: string) {
    admin(actor);
    uuid(experiment);
    return this.uow.read((r) => r.conversations.adminMessages(experiment));
  }
  async export(actor: AdminIdentity, experiment: string) {
    admin(actor);
    uuid(experiment);
    await this.uow.transaction((r) =>
      r.experiments.audit(
        experiment,
        actor.id,
        'DATA_EXPORTED',
        'Authorized synchronous JSON export',
      ),
    );
    return this.uow.transaction(
      async (r) => ({
        format: 'research-json-v1',
        experiment_id: experiment,
        generated_at: new Date().toISOString(),
        per_table_limit: 1000,
        complete: false,
        note: 'Bounded engineering export; production pagination and complete version bundle remain pending',
        ...(await r.conversations.export(experiment)),
      }),
      true,
    );
  }
}
