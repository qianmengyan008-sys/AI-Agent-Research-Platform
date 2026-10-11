import type { PoolClient } from 'pg';
import type { RecentMessage, OrchestrationResult } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
export interface RunContext {
  experiment: string;
  promptId: string;
  promptVersion: string;
  model: ModelSettings;
  stage: string;
}
export interface Turn {
  generation_context: RunContext;
  id: string;
  session_id: string;
  status: string;
  request_hash: string;
  lease_token: string | null;
  lease_until: Date | null;
  accepted_core_version: number;
  chat_revision: number;
}
export class ConversationRepository {
  constructor(private readonly db: PoolClient) {}
  async find(session: string, request: string) {
    return (
      await this.db.query<Turn>(
        'SELECT * FROM research.conversation_turn WHERE session_id=$1 AND idempotency_key=$2',
        [session, request],
      )
    ).rows[0];
  }
  async turn(participant: string, id: string) {
    return (
      await this.db.query<Turn>(
        `SELECT t.* FROM research.conversation_turn t JOIN research.experiment_session s ON s.id=t.session_id JOIN research.experiment_assignment a ON a.id=s.assignment_id WHERE a.participant_id=$1 AND t.id=$2`,
        [participant, id],
      )
    ).rows[0];
  }
  async create(
    session: string,
    request: string,
    checksum: string,
    version: number,
    revision: number,
    input: string,
    lease: string,
    leaseMs: number,
    context: RunContext,
  ) {
    await this.db.query('UPDATE research.experiment_session SET chat_revision=$2 WHERE id=$1', [
      session,
      revision,
    ]);
    const t = (
      await this.db.query<Turn>(
        `INSERT INTO research.conversation_turn(session_id,idempotency_key,request_hash,accepted_core_version,chat_revision,status,lease_token,lease_until,generation_context) VALUES($1,$2,$3,$4,$5,'generating',$6,now()+($7::integer*interval '1 millisecond'),$8) RETURNING *`,
        [session, request, checksum, version, revision, lease, leaseMs, JSON.stringify(context)],
      )
    ).rows[0]!;
    const c = (
      await this.db.query<{ id: string }>(
        'SELECT id FROM research.conversation WHERE session_id=$1',
        [session],
      )
    ).rows[0]!;
    const sequence = (
      await this.db.query<{ sequence: number }>(
        'SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM research.message WHERE session_id=$1',
        [session],
      )
    ).rows[0]!.sequence;
    await this.db.query(
      "INSERT INTO research.message(session_id,conversation_id,turn_id,sequence,role,content,status) VALUES($1,$2,$3,$4,'user',$5,'ready')",
      [session, c.id, t.id, sequence, input],
    );
    await this.db.query(
      "INSERT INTO research.message(session_id,conversation_id,turn_id,sequence,role,status) VALUES($1,$2,$3,$4,'assistant','pending')",
      [session, c.id, t.id, sequence + 1],
    );
    return t;
  }
  async expire(session: string) {
    const rows = await this.db.query<Turn>(
      "UPDATE research.conversation_turn SET status='failed' WHERE session_id=$1 AND status IN ('pending','generating') AND lease_until<now() RETURNING *",
      [session],
    );
    for (const row of rows.rows)
      await this.db.query(
        "UPDATE research.message SET status='failed' WHERE turn_id=$1 AND role='assistant'",
        [row.id],
      );
    return rows.rows;
  }
  async active(session: string) {
    return (
      await this.db.query<{ id: string }>(
        "SELECT id FROM research.conversation_turn WHERE session_id=$1 AND status IN ('pending','generating')",
        [session],
      )
    ).rows[0];
  }
  async recent(session: string, version: number, stage: string): Promise<RecentMessage[]> {
    const rows = (
      await this.db.query<{ role: 'user' | 'assistant'; content: string }>(
        `SELECT m.role,m.content FROM research.message m JOIN research.conversation_turn t ON t.id=m.turn_id WHERE m.session_id=$1 AND m.status='ready' AND t.status='ready' AND t.accepted_core_version=$2 ORDER BY m.sequence DESC LIMIT 6`,
        [session, version],
      )
    ).rows;
    return rows.reverse().map((r) => ({ ...r, stage }));
  }
  async finish(id: string, text: string | null, status: string) {
    await this.db.query('UPDATE research.conversation_turn SET status=$2 WHERE id=$1', [
      id,
      status,
    ]);
    await this.db.query(
      "UPDATE research.message SET content=$2,status=$3 WHERE turn_id=$1 AND role='assistant'",
      [id, text, status === 'ready' ? 'ready' : status],
    );
  }
  async reply(id: string) {
    return (
      await this.db.query<{ content: string | null; status: string }>(
        "SELECT content,status FROM research.message WHERE turn_id=$1 AND role='assistant'",
        [id],
      )
    ).rows[0];
  }
  async messages(participant: string) {
    return (
      await this.db.query(
        `SELECT m.id,m.role,m.content AS text,m.created_at FROM research.message m JOIN research.experiment_session s ON s.id=m.session_id JOIN research.experiment_assignment a ON a.id=s.assignment_id WHERE a.participant_id=$1 AND m.status='ready' ORDER BY m.sequence LIMIT 1000`,
        [participant],
      )
    ).rows as Record<string, unknown>[];
  }
  async log(
    turn: Turn,
    experiment: string,
    prompt: string,
    promptVersion: string,
    settings: ModelSettings,
    result: OrchestrationResult | null,
    latency: number,
    status: string,
    error: string | null,
  ) {
    await this.db.query(
      `INSERT INTO research.model_run_log(turn_id,session_id,experiment_id,provider,model_name,prompt_version_id,prompt_version,validator_version,code_commit,temperature,max_tokens,latency_ms,retry_count,fallback_count,validator_result,error_code,status) VALUES($1,$2,$3,$4,$5,$6,$7,'stage-language-v3',$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        turn.id,
        turn.session_id,
        experiment,
        settings.provider,
        settings.model_name,
        prompt,
        promptVersion,
        process.env.RESEARCH_CODE_COMMIT ?? 'development',
        settings.temperature,
        settings.max_tokens,
        latency,
        Math.max(0, (result?.attempts ?? 1) - 1),
        result?.status === 'fallback' ? 1 : 0,
        JSON.stringify(
          result
            ? {
                status: result.status,
                violations: result.violations,
                auditEvents: result.auditEvents,
              }
            : {},
        ),
        error,
        status,
      ],
    );
  }
  async adminMessages(experiment: string) {
    return (
      await this.db.query(
        `SELECT m.id,m.session_id,m.sequence,m.role,m.content,m.status,m.created_at FROM research.message m JOIN research.experiment_session s ON s.id=m.session_id WHERE s.experiment_id=$1 ORDER BY s.id,m.sequence LIMIT 1000`,
        [experiment],
      )
    ).rows as Record<string, unknown>[];
  }
  async export(experiment: string) {
    const participants = (
      await this.db.query(
        'SELECT id,participant_code,status,created_at FROM research.participant WHERE experiment_id=$1 ORDER BY id LIMIT 1000',
        [experiment],
      )
    ).rows;
    const assignments = (
      await this.db.query(
        'SELECT id,participant_id,template_version_id,condition_id,created_at FROM research.experiment_assignment WHERE experiment_id=$1 ORDER BY id LIMIT 1000',
        [experiment],
      )
    ).rows;
    const messages = await this.adminMessages(experiment);
    const transitions = (
      await this.db.query(
        'SELECT t.* FROM research.state_transition t JOIN research.experiment_session s ON s.id=t.session_id WHERE s.experiment_id=$1 ORDER BY t.created_at LIMIT 1000',
        [experiment],
      )
    ).rows;
    const variables = (
      await this.db.query(
        'SELECT v.* FROM research.experiment_variable v JOIN research.experiment_session s ON s.id=v.session_id WHERE s.experiment_id=$1 ORDER BY v.created_at LIMIT 1000',
        [experiment],
      )
    ).rows;
    const runs = (
      await this.db.query(
        'SELECT r.* FROM research.model_run_log r WHERE r.experiment_id=$1 ORDER BY r.created_at LIMIT 1000',
        [experiment],
      )
    ).rows;
    return { participants, assignments, messages, transitions, variables, runs };
  }
}
