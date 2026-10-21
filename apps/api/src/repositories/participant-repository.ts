import type { PoolClient } from 'pg';
export class ParticipantRepository {
  constructor(private readonly db: PoolClient) {}
  async create(experiment: string, code: string, password: string) {
    return (
      await this.db.query<{ id: string }>(
        'INSERT INTO research.participant(experiment_id,participant_code,password_hash) VALUES($1,$2,$3) RETURNING id',
        [experiment, code, password],
      )
    ).rows[0]!;
  }
  async credentials(experiment: string, code: string) {
    return (
      await this.db.query<{ id: string; password_hash: string; status: string }>(
        'SELECT id,password_hash,status FROM research.participant WHERE experiment_id=$1 AND participant_code=$2',
        [experiment, code],
      )
    ).rows[0];
  }
  async assign(
    experiment: string,
    participant: string,
    template: string,
    condition: string,
    actor: string,
  ) {
    return (
      await this.db.query<{ id: string }>(
        'INSERT INTO research.experiment_assignment(experiment_id,participant_id,template_version_id,condition_id,assigned_by) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [experiment, participant, template, condition, actor],
      )
    ).rows[0]!;
  }
  async session(participant: string, tokenHash: string, expires: Date) {
    await this.db.query(
      'INSERT INTO research.auth_session(participant_id,token_hash,expires_at) VALUES($1,$2,$3)',
      [participant, tokenHash, expires],
    );
  }
  async authenticate(tokenHash: string) {
    return (
      await this.db.query<{ id: string }>(
        "SELECT p.id FROM research.auth_session s JOIN research.participant p ON p.id=s.participant_id WHERE s.token_hash=$1 AND s.expires_at>now() AND p.status='enabled'",
        [tokenHash],
      )
    ).rows[0];
  }
  async logout(tokenHash: string) {
    await this.db.query('DELETE FROM research.auth_session WHERE token_hash=$1', [tokenHash]);
  }
  async list(experiment: string) {
    return (
      await this.db.query(
        `SELECT p.id,p.participant_code,p.status,c.code AS condition,s.id AS session_id,es.stage,es.core_version FROM research.participant p LEFT JOIN research.experiment_assignment a ON a.participant_id=p.id LEFT JOIN research.condition c ON c.id=a.condition_id LEFT JOIN research.experiment_session s ON s.assignment_id=a.id LEFT JOIN research.experiment_state es ON es.session_id=s.id WHERE p.experiment_id=$1 ORDER BY p.created_at LIMIT 1000`,
        [experiment],
      )
    ).rows as Record<string, unknown>[];
  }
  async reserveLoginBatch(batch: string) {
    await this.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      'login-batch:' + batch,
    ]);
    const prior = await this.db.query(
      "SELECT 1 FROM research.admin_event WHERE event='LOGIN_ACCOUNTS_CREATED' AND reason=$1",
      [batch],
    );
    if (prior.rowCount) {
      const e = Object.assign(new Error('CONFLICT'), { code: '23505' });
      throw e;
    }
  }
  async accountOptions(experiment: string) {
    return (
      await this.db.query<{
        id: string;
        code: string;
        path: string;
        agent: string;
        model_batch: string;
      }>(
        `
      SELECT c.id,c.code,sm.path_type AS path,av.configuration->>'name' AS agent,
      (t.configuration->'model'->>'provider') || ' / ' || (t.configuration->'model'->>'model_name') AS model_batch
      FROM research.condition c JOIN research.template_version t ON t.id=c.template_version_id
      JOIN research.state_machine_version sm ON sm.id=c.state_machine_version_id
      JOIN research.agent_version av ON av.id=c.agent_version_id
      WHERE c.experiment_id=$1 AND t.status='published' ORDER BY c.code`,
        [experiment],
      )
    ).rows;
  }
  async loginAccount(participant: string) {
    return (
      await this.db.query<{
        experiment_id: string;
        participant_code: string;
        study_path: string;
        condition: string;
        agent: string;
        model_batch: string;
        created_at: string;
      }>(
        `
      SELECT p.experiment_id,p.participant_code,sm.path_type AS study_path,c.code AS condition,
      av.configuration->>'name' AS agent,(t.configuration->'model'->>'provider') || ' / ' || (t.configuration->'model'->>'model_name') AS model_batch,p.created_at::text
      FROM research.participant p JOIN research.experiment_assignment a ON a.participant_id=p.id
      JOIN research.condition c ON c.id=a.condition_id JOIN research.template_version t ON t.id=a.template_version_id
      JOIN research.state_machine_version sm ON sm.id=c.state_machine_version_id JOIN research.agent_version av ON av.id=c.agent_version_id
      WHERE p.id=$1 FOR UPDATE OF p`,
        [participant],
      )
    ).rows[0];
  }
  async resetPassword(participant: string, encoded: string) {
    await this.db.query('UPDATE research.participant SET password_hash=$2 WHERE id=$1', [
      participant,
      encoded,
    ]);
    await this.db.query('DELETE FROM research.auth_session WHERE participant_id=$1', [participant]);
  }
}
