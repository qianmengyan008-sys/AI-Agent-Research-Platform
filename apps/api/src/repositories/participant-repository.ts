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
}
