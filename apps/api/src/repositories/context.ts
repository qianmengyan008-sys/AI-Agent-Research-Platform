import type { Pool, PoolClient } from 'pg';
import { ExperimentRepository } from './experiment-repository.js';
import { ParticipantRepository } from './participant-repository.js';
import { StateRepository } from './state-repository.js';
import { ConversationRepository } from './conversation-repository.js';
export class Repositories {
  readonly experiments;
  readonly participants;
  readonly states;
  readonly conversations;
  constructor(client: PoolClient) {
    this.experiments = new ExperimentRepository(client);
    this.participants = new ParticipantRepository(client);
    this.states = new StateRepository(client);
    this.conversations = new ConversationRepository(client);
  }
}
export class UnitOfWork {
  constructor(private readonly pool: Pool) {}
  async read<T>(operation: (repositories: Repositories) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await operation(new Repositories(client));
    } finally {
      client.release();
    }
  }
  async transaction<T>(
    operation: (repositories: Repositories) => Promise<T>,
    consistentRead = false,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(
        consistentRead ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN',
      );
      const value = await operation(new Repositories(client));
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
