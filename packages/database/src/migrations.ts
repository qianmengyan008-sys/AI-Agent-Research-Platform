import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Client } from 'pg';

export interface Migration {
  readonly id: string;
  readonly up: string;
  readonly down: string;
  readonly checksum: string;
}
export async function loadMigrations(directory: string): Promise<readonly Migration[]> {
  const files = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z_]+\.up\.sql$/.test(name))
    .sort();
  if (!files.length) throw new Error('No migrations found');
  const migrations = [];
  for (const file of files) {
    const id = file.replace('.up.sql', '');
    const up = await readFile(`${directory}/${file}`, 'utf8');
    const down = await readFile(`${directory}/${id}.down.sql`, 'utf8');
    const checksum = createHash('sha256').update(up).update('\0').update(down).digest('hex');
    migrations.push({ id, up, down, checksum });
  }
  return migrations;
}
/** One connected client; session advisory lock serializes migration processes. */
export async function migrate(
  client: Client,
  migrations: readonly Migration[],
  direction: 'up' | 'down' = 'up',
) {
  if (
    !migrations.length ||
    new Set(migrations.map((m) => m.id)).size !== migrations.length ||
    migrations.some((m, i) => i > 0 && m.id <= migrations[i - 1]!.id)
  )
    throw new Error('Invalid migration order');
  await client.query('SELECT pg_advisory_lock(186451027)');
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS research_meta');
    await client.query(`CREATE TABLE IF NOT EXISTS research_meta.schema_migration (
      id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query<{ id: string; checksum: string }>(
      'SELECT id,checksum FROM research_meta.schema_migration ORDER BY id',
    );
    if (rows.some((r, i) => r.id !== migrations[i]?.id || r.checksum !== migrations[i]?.checksum))
      throw new Error('Migration history or checksum mismatch');
    const pending =
      direction === 'up'
        ? migrations.slice(rows.length)
        : rows.length
          ? [migrations[rows.length - 1]!]
          : [];
    const applied = [];
    for (const migration of pending) {
      await client.query('BEGIN');
      try {
        await client.query(direction === 'up' ? migration.up : migration.down);
        if (direction === 'up')
          await client.query(
            'INSERT INTO research_meta.schema_migration(id,checksum) VALUES($1,$2)',
            [migration.id, migration.checksum],
          );
        else
          await client.query('DELETE FROM research_meta.schema_migration WHERE id=$1', [
            migration.id,
          ]);
        await client.query('COMMIT');
        applied.push(migration.id);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return { direction, applied };
  } finally {
    await client.query('SELECT pg_advisory_unlock(186451027)');
  }
}
