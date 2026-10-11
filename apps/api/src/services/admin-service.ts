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
    return this.uow.transaction(async (r) => {
      const data = await r.conversations.export(experiment);
      const generatedAt = new Date().toISOString();
      const analysisRows = data.assignments.map((assignment) => {
        const state = data.states.find((s) => s.assignment_id === assignment.id);
        const session = state?.session_id;
        const prompts = data.prompts.filter((p) => p.condition_id === assignment.condition_id);
        const model = assignment.model_settings;
        return {
          participant_id: assignment.participant_id,
          experiment_id: experiment,
          assignment_id: assignment.id,
          session_id: session ?? null,
          condition: assignment.condition,
          condition_id: assignment.condition_id,
          path_type: assignment.path_type,
          agent_version: {
            id: assignment.agent_version_id,
            version: assignment.agent_version,
            configuration: assignment.agent_configuration,
          },
          state_machine_version: {
            id: assignment.state_machine_version_id,
            version: assignment.state_machine_version,
          },
          template_version_id: assignment.template_version_id,
          prompt_version: prompts.map((p) => ({
            stage: p.stage,
            id: p.prompt_version_id,
            version: p.prompt_version,
          })),
          model_version: {
            requested_model: model.model_name,
            provider: model.provider,
            supplier_revision: null,
          },
          model_settings: model,
          timestamp: { assigned_at: assignment.created_at, exported_at: generatedAt },
          current_state: state ?? null,
          state_transition: session ? data.transitions.filter((t) => t.session_id === session) : [],
          conversation_history: session
            ? data.messages.filter((m) => m.session_id === session)
            : [],
          experiment_variables: session
            ? data.variables.filter((v) => v.session_id === session)
            : [],
          model_runs: session ? data.runs.filter((r) => r.session_id === session) : [],
        };
      });
      return {
        format: 'research-json-v1',
        analysis_schema: 'participant-research-v1',
        experiment_id: experiment,
        generated_at: generatedAt,
        per_table_limit: 1000,
        complete: false,
        note: 'Bounded engineering export; supplier model revision unavailable; production pagination and complete version bundle remain pending',
        ...data,
        analysis_rows: analysisRows,
      };
    }, true);
  }
  async development(actor: AdminIdentity, experiment: string) {
    admin(actor);
    uuid(experiment);
    await this.uow.transaction((r) =>
      r.experiments.audit(
        experiment,
        actor.id,
        'DEVELOPMENT_VIEWED',
        'Authorized read-only development diagnostics',
      ),
    );
    return this.uow.transaction(async (r) => {
      const data = await r.conversations.export(experiment);
      return {
        read_only: true,
        per_table_limit: 1000,
        complete: false,
        states: data.states,
        events: data.transitions,
        variables: data.variables,
        model_runs: data.runs,
      };
    }, true);
  }
}
