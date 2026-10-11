import type { PoolClient } from 'pg';
import type {
  ExperimentDefinition,
  ExperimentStateSnapshot,
  TransitionResult,
  VariableChange,
} from '@research/experiment-core';
import type { StagePolicy } from '@research/ai-orchestrator';
import type { Configuration } from './experiment-repository.js';
export interface Bundle {
  session_id: string;
  participant_id: string;
  experiment_id: string;
  condition_id: string;
  assignment_id: string;
  status: string;
  chat_revision: number;
  snapshot: ExperimentStateSnapshot;
  state_token: string;
  definition: ExperimentDefinition;
  agent: { name: string };
  configuration: Configuration;
  policies: Record<string, StagePolicy>;
  prompt_ids: Record<string, string>;
}
export class StateRepository {
  constructor(private readonly db: PoolClient) {}
  async initialize(assignment: string, experiment: string, state: ExperimentStateSnapshot) {
    const s = (
      await this.db.query<{ id: string }>(
        'INSERT INTO research.experiment_session(assignment_id,experiment_id) VALUES($1,$2) RETURNING id',
        [assignment, experiment],
      )
    ).rows[0]!;
    await this.db.query(
      'INSERT INTO research.experiment_state(session_id,stage,core_version,snapshot) VALUES($1,$2,$3,$4)',
      [s.id, state.stage, state.version, JSON.stringify(state)],
    );
    await this.db.query('INSERT INTO research.conversation(session_id) VALUES($1)', [s.id]);
    return s.id;
  }
  async load(participant: string, lock = false) {
    return (
      await this.db.query<Bundle>(
        `SELECT s.id AS session_id,a.participant_id,s.experiment_id,a.condition_id,a.id AS assignment_id,s.status,s.chat_revision,es.snapshot,es.state_token,sm.definition,av.configuration AS agent,t.configuration,
   (SELECT jsonb_object_agg(cp.stage,p.policy) FROM research.condition_prompt cp JOIN research.prompt_version p ON p.id=cp.prompt_version_id WHERE cp.condition_id=c.id) AS policies,
   (SELECT jsonb_object_agg(cp.stage,p.id) FROM research.condition_prompt cp JOIN research.prompt_version p ON p.id=cp.prompt_version_id WHERE cp.condition_id=c.id) AS prompt_ids
   FROM research.experiment_assignment a JOIN research.experiment_session s ON s.assignment_id=a.id JOIN research.experiment_state es ON es.session_id=s.id
   JOIN research.condition c ON c.id=a.condition_id JOIN research.template_version t ON t.id=a.template_version_id
   JOIN research.state_machine_version sm ON sm.id=c.state_machine_version_id JOIN research.agent_version av ON av.id=c.agent_version_id
   WHERE a.participant_id=$1${lock ? ' FOR UPDATE OF s,es' : ''}`,
        [participant],
      )
    ).rows[0];
  }
  async save(
    session: string,
    result: TransitionResult,
    actor: string,
    payload: unknown,
    actorType: 'participant' | 'backend' = 'participant',
    supplemental: readonly VariableChange[] = [],
  ) {
    const state = result.newState;
    await this.db.query(
      'UPDATE research.experiment_state SET stage=$2,core_version=$3,snapshot=$4,state_token=gen_random_uuid(),updated_at=now() WHERE session_id=$1',
      [session, state.stage, state.version, JSON.stringify(state)],
    );
    for (const event of result.events) {
      const t = (
        await this.db.query<{ id: string }>(
          `INSERT INTO research.state_transition(session_id,core_event_id,event,previous_state,current_state,from_version,to_version,actor_type,actor_id,validated_payload,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            session,
            event.eventId,
            event.type,
            event.fromStage,
            event.toStage,
            event.fromVersion,
            event.toVersion,
            actorType,
            actor,
            JSON.stringify(payload),
            JSON.stringify(state.receipts.at(-1)),
          ],
        )
      ).rows[0]!;
      for (const variable of [...result.variables, ...supplemental].filter(
        (v) => v.sourceEventId === event.eventId,
      ))
        await this.db.query(
          `INSERT INTO research.experiment_variable(session_id,key,value,revision,source_transition_id,recorded_stage) VALUES($1,$2,$3,(SELECT COALESCE(MAX(revision),0)+1 FROM research.experiment_variable WHERE session_id=$1 AND key=$2),$4,$5)`,
          [session, variable.key, JSON.stringify(variable.value), t.id, variable.stage],
        );
    }
    if (state.lifecycle === 'completed')
      await this.db.query("UPDATE research.experiment_session SET status='completed' WHERE id=$1", [
        session,
      ]);
  }
  async receipt(session: string, id: string) {
    return (
      await this.db.query<{ request_hash: string; response: Record<string, unknown> }>(
        'SELECT request_hash,response FROM research.submission_receipt WHERE session_id=$1 AND request_id=$2',
        [session, id],
      )
    ).rows[0];
  }
  async storeReceipt(session: string, id: string, checksum: string, response: unknown) {
    await this.db.query(
      'INSERT INTO research.submission_receipt(session_id,request_id,request_hash,response) VALUES($1,$2,$3,$4)',
      [session, id, checksum, JSON.stringify(response)],
    );
  }
  async pending(session: string) {
    return (
      (
        await this.db.query(
          "SELECT id FROM research.conversation_turn WHERE session_id=$1 AND status IN ('pending','generating')",
          [session],
        )
      ).rowCount !== 0
    );
  }
}
